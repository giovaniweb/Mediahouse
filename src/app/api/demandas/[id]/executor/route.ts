// "Quem da GH vai fazer" (12/11/2026): a empresa que recebeu o card por espelho
// escolhe quem da equipe dela faz a gravação. A escolha é dado DELA
// (`executor_espelho`): a dona do card recebe 404 aqui e nunca vê o nome.
//
// Só a gestão (admin ou gestor) da empresa ativa escolhe. O escolhido recebe
// aviso no sino; WhatsApp só se o WhatsApp da empresa estiver conectado (QR lido).
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaAcesso } from "@/lib/compartilhamento"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { ehGestaoDaEmpresa } from "@/lib/parceria"
import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { comOrg } from "@/lib/org-contexto"
import { emSegundoPlano } from "@/lib/notificar"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { whatsappConectado } from "@/lib/espelho-do-videomaker"

type Params = { params: Promise<{ id: string }> }

const naoEncontrado = () => NextResponse.json({ error: "Não encontrado" }, { status: 404 })

async function guarda(id: string, minimo: "acompanhar" | "executar") {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const acesso = await requireDemandaAcesso(session, id, minimo)
  if (acesso instanceof NextResponse) return acesso
  // A dona não escolhe nem vê quem da parceira faz: para ela, o card não tem isto.
  if (acesso.papel !== "espelho") return naoEncontrado()
  const vinculo = await permissoesEfetivas(session.user.id, acesso.organizacaoId)
  if (!ehGestaoDaEmpresa(vinculo?.papel)) {
    return NextResponse.json({ error: "Só admin ou gestor escolhe quem vai fazer." }, { status: 403 })
  }
  return { session, acesso }
}

/** As opções: os videomakers com vínculo ativo na empresa ativa. */
async function opcoes(organizacaoId: string) {
  const vinculos = await prisma.videomakerOrganizacao.findMany({
    where: { organizacaoId, status: "ativo", emListaNegra: false },
    select: { videomaker: { select: { id: true, nome: true, usuarioId: true } } },
    orderBy: { videomaker: { nome: "asc" } },
  })
  return vinculos.map((v) => ({ id: v.videomaker.id, nome: v.videomaker.nome, temLogin: !!v.videomaker.usuarioId }))
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const g = await guarda(id, "acompanhar")
  if (g instanceof NextResponse) return g
  const atual = await prisma.executorEspelho.findFirst({
    where: { organizacaoId: g.acesso.organizacaoId, demandaId: id },
    select: { videomaker: { select: { id: true, nome: true } }, updatedAt: true },
  })
  return NextResponse.json({ executor: atual?.videomaker ?? null, escolhidoEm: atual?.updatedAt ?? null, opcoes: await opcoes(g.acesso.organizacaoId) })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params
  const g = await guarda(id, "executar")
  if (g instanceof NextResponse) return g
  const { session, acesso } = g
  const organizacaoId = acesso.organizacaoId

  const { videomakerId } = (await req.json().catch(() => ({}))) as { videomakerId?: string | null }
  if (videomakerId === undefined) return NextResponse.json({ error: "Informe quem vai fazer (ou vazio para ninguém)." }, { status: 400 })

  if (!videomakerId) {
    await prisma.executorEspelho.deleteMany({ where: { organizacaoId, demandaId: id } })
  } else {
    if (!(await opcoes(organizacaoId)).some((o) => o.id === videomakerId)) {
      return NextResponse.json({ error: "Escolha um videomaker da sua equipe." }, { status: 400 })
    }
    await prisma.executorEspelho.upsert({
      where: { organizacaoId_demandaId: { organizacaoId, demandaId: id } },
      create: { organizacaoId, demandaId: id, videomakerId, escolhidoPorId: session.user.id },
      update: { videomakerId, escolhidoPorId: session.user.id },
    })
  }
  await registrarAuditoria(prisma, { organizacaoId, usuarioId: session.user.id }, {
    acao: "espelho.executor", recurso: "demanda", recursoId: id, correlationId: correlacaoAuditoria(),
  })

  if (videomakerId) emSegundoPlano(() => avisarEscolhido(organizacaoId, id, videomakerId), "aviso-executor-espelho")

  const atual = videomakerId ? await prisma.videomaker.findUnique({ where: { id: videomakerId }, select: { id: true, nome: true } }) : null
  return NextResponse.json({ executor: atual })
}

async function avisarEscolhido(organizacaoId: string, demandaId: string, videomakerId: string) {
  await comOrg(organizacaoId, async () => {
    const [vm, card] = await Promise.all([
      prisma.videomaker.findUnique({ where: { id: videomakerId }, select: { usuarioId: true, telefone: true } }),
      prisma.demanda.findUnique({ where: { id: demandaId }, select: { codigo: true, titulo: true, dataCaptacao: true, localGravacao: true } }),
    ])
    if (!card) return
    const quando = card.dataCaptacao ? ` em ${card.dataCaptacao.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""
    const mensagem = `Você vai fazer a gravação ${card.codigo} — ${card.titulo}${quando}${card.localGravacao ? `, ${card.localGravacao}` : ""}. Veja em Minhas Gravações.`
    if (vm?.usuarioId) {
      await prisma.alertaIA.create({ data: {
        organizacaoId, demandaId, usuarioId: vm.usuarioId, tipoAlerta: "espelho_executor",
        mensagem, severidade: "aviso", acaoSugerida: "Abrir Minhas Gravações",
      } })
    }
    // Sem o QR da empresa lido, nada sai — e nada fica na fila.
    if (vm?.telefone && await whatsappConectado(organizacaoId)) {
      await sendWhatsappMessage(vm.telefone, `🎬 *NuFlow* — ${mensagem}`, demandaId, organizacaoId)
    }
  })
}
