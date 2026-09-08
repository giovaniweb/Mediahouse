// Terceirizar a execução de uma demanda para uma empresa parceira.
//
// A rota vizinha `/compartilhar` é OUTRA coisa: ela gera o link público de
// acompanhamento (`/d/[token]`), que é leitura para quem não tem conta.
// Espelhar é dar operação a outra EMPRESA do NuFlow. Os nomes são parecidos e
// os recursos não são — por isso caminhos separados.
//
// O card NÃO muda de dono. O que nasce é uma aresta em
// `demanda_compartilhamento`, e ela só nasce sob parceria aceita — regra imposta
// pelo gatilho `compartilhamento_derivar_origem`, não por esta rota.
//
// Conceder e revogar são atos da DONA, sempre. A política
// `compartilhamento_escrita_da_origem` garante isso no banco; aqui a checagem
// existe para responder em português em vez de deixar o Postgres recusar cru.
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { ehGestaoDaEmpresa, parceirosAtivos } from "@/lib/parceria"
import { requireDemandaAcesso } from "@/lib/compartilhamento"
import { EVENTO_ESPELHO_CONCEDIDO, EVENTO_ESPELHO_REVOGADO } from "@/lib/status"
import type { EscopoCompartilhamento } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

/** Quem executa esta demanda hoje, e para quem ela ainda pode ser terceirizada. */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const acesso = await requireDemandaAcesso(session, id, "acompanhar")
  if (acesso instanceof NextResponse) return acesso

  const arestas = await prisma.demandaCompartilhamento.findMany({
    where: { demandaId: id, revogadoEm: null },
    select: { id: true, organizacaoDestinoId: true, nomeDestino: true, escopo: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
  })

  // A lista de parceiros só faz sentido para quem pode conceder. Quem executa
  // não precisa saber com quem mais a dona trabalha — e não deve.
  const parceiros = acesso.papel === "dona" ? await parceirosAtivos(acesso.organizacaoId) : []
  const jaCompartilhado = new Set(arestas.map((a) => a.organizacaoDestinoId))

  return NextResponse.json({
    papel: acesso.papel,
    compartilhamentos: arestas,
    parceirosDisponiveis: parceiros
      .filter((p) => !jaCompartilhado.has(p.organizacaoId))
      .map((p) => ({ organizacaoId: p.organizacaoId, nome: p.nome })),
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  // De propósito NÃO é `requireDemandaAcesso`: conceder é ato da dona, e quem
  // executa por espelhamento não sub-terceiriga o card de outra empresa.
  const demanda = await prisma.demanda.findUnique({
    where: { id },
    select: { organizacaoId: true, codigo: true },
  })
  if (!demanda || demanda.organizacaoId !== organizacaoId) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  if (!ehGestaoDaEmpresa(vinculo?.papel)) {
    return NextResponse.json({ error: "Só admin ou gestor terceiriza uma demanda." }, { status: 403 })
  }

  const { organizacaoDestinoId, escopo = "executar" } = (await req.json().catch(() => ({}))) as {
    organizacaoDestinoId?: string
    escopo?: EscopoCompartilhamento
  }
  if (!organizacaoDestinoId) {
    return NextResponse.json({ error: "Informe a empresa que vai executar." }, { status: 400 })
  }
  if (escopo !== "executar" && escopo !== "acompanhar") {
    return NextResponse.json({ error: "Escopo inválido." }, { status: 400 })
  }

  const parceiro = (await parceirosAtivos(organizacaoId)).find(
    (p) => p.organizacaoId === organizacaoDestinoId
  )
  if (!parceiro) {
    return NextResponse.json(
      { error: "Não há parceria aceita com esta empresa. O aperto de mão vem antes." },
      { status: 403 }
    )
  }

  // Reativa em vez de criar outra: o par (demanda, destino) é único, e a linha
  // guarda a prova de que o acesso existiu antes.
  const existente = await prisma.demandaCompartilhamento.findFirst({
    where: { demandaId: id, organizacaoDestinoId },
  })
  if (existente && existente.revogadoEm === null) {
    return NextResponse.json({ error: "Esta demanda já está com essa empresa.", compartilhamentoId: existente.id }, { status: 409 })
  }

  const aresta = existente
    ? await prisma.demandaCompartilhamento.update({
        where: { id: existente.id },
        data: { revogadoEm: null, revogadoPorId: null, escopo, criadoEm: new Date(), criadoPorId: session.user.id },
      })
    : await prisma.demandaCompartilhamento.create({
        data: {
          demandaId: id,
          // Os três são reescritos pelo gatilho a partir da demanda e de
          // `organizacoes`. Mandamos o que sabemos; a autoridade é o banco.
          organizacaoOrigemId: organizacaoId,
          organizacaoDestinoId,
          nomeOrigem: "",
          nomeDestino: parceiro.nome,
          escopo,
          criadoPorId: session.user.id,
        },
      })

  // §29: mudança relevante gera histórico. Terceirizar a execução é das mais
  // relevantes que acontecem com um card, e sem isto um card que trocou de mão
  // três vezes não responde quem fez o quê.
  await prisma.historicoStatus.create({
    data: {
      demandaId: id,
      statusNovo: EVENTO_ESPELHO_CONCEDIDO,
      usuarioId: session.user.id,
      origem: "manual",
      observacao: `Execução terceirizada para ${aresta.nomeDestino} (${escopo}).`,
    },
  })

  return NextResponse.json(
    { compartilhamentoId: aresta.id, nomeDestino: aresta.nomeDestino, escopo: aresta.escopo },
    { status: existente ? 200 : 201 }
  )
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  const demanda = await prisma.demanda.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!demanda || demanda.organizacaoId !== organizacaoId) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  if (!ehGestaoDaEmpresa(vinculo?.papel)) {
    return NextResponse.json({ error: "Só admin ou gestor revoga." }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const destinoId = searchParams.get("destino")
  if (!destinoId) return NextResponse.json({ error: "Informe a empresa." }, { status: 400 })

  const aresta = await prisma.demandaCompartilhamento.findFirst({
    where: { demandaId: id, organizacaoDestinoId: destinoId, revogadoEm: null },
  })
  if (!aresta) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  // Revogar é preencher a data, nunca apagar a linha. E o que a outra empresa
  // produziu — comentário, arquivo, histórico — FICA: é trabalho real, e apagar
  // seria reescrever a timeline para simplificar o presente (§29).
  await prisma.demandaCompartilhamento.update({
    where: { id: aresta.id },
    data: { revogadoEm: new Date(), revogadoPorId: session.user.id },
  })
  await prisma.historicoStatus.create({
    data: {
      demandaId: id,
      statusNovo: EVENTO_ESPELHO_REVOGADO,
      usuarioId: session.user.id,
      origem: "manual",
      observacao: `Acesso de ${aresta.nomeDestino} revogado.`,
    },
  })

  return NextResponse.json({ revogado: true, nomeDestino: aresta.nomeDestino })
}
