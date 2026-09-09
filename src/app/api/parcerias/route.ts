// Parcerias entre empresas — o aperto de mão que precede qualquer espelhamento.
//
// Convidar é ato da empresa que convida; aceitar é ato de quem foi convidada.
// A separação não vive só aqui: o gatilho `parceria_regras` recusa a empresa
// que convidou tentando aceitar o próprio convite, então esta rota é a porta e
// o banco é a parede.
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { ehGestaoDaEmpresa, parceriasDaEmpresa, resolverEmpresaPorSlug } from "@/lib/parceria"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  return NextResponse.json({ parcerias: await parceriasDaEmpresa(organizacaoId) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  if (!ehGestaoDaEmpresa(vinculo?.papel)) {
    return NextResponse.json({ error: "Só admin ou gestor cria parceria." }, { status: 403 })
  }

  const { slug } = (await req.json().catch(() => ({}))) as { slug?: string }
  if (!slug?.trim()) {
    return NextResponse.json({ error: "Informe o identificador da empresa parceira." }, { status: 400 })
  }

  const alvo = await resolverEmpresaPorSlug(slug)
  // Mesma resposta para "não existe" e "está inativa", de propósito: esta rota
  // aceita texto digitado por qualquer gestor da plataforma, e distinguir os
  // dois casos a transformaria num verificador de quais empresas existem.
  if (!alvo) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 })
  if (alvo.id === organizacaoId) {
    return NextResponse.json({ error: "Uma empresa não faz parceria consigo mesma." }, { status: 400 })
  }

  // Reativação, não linha nova: o par é único nos dois sentidos, e a linha
  // guarda o histórico de quem convidou e quando.
  const existente = await prisma.parceriaOrganizacao.findFirst({
    where: {
      OR: [
        { organizacaoConvidanteId: organizacaoId, organizacaoConvidadaId: alvo.id },
        { organizacaoConvidanteId: alvo.id, organizacaoConvidadaId: organizacaoId },
      ],
    },
  })

  if (existente) {
    if (existente.status === "aceita" && !existente.encerradaEm) {
      return NextResponse.json({ error: "A parceria já está ativa.", parceriaId: existente.id }, { status: 409 })
    }
    // Só quem convidou originalmente reabre — senão a empresa que recusou
    // reabriria o convite dela mesma e passaria por cima da recusa.
    if (existente.organizacaoConvidanteId !== organizacaoId) {
      return NextResponse.json(
        { error: "Já existe um convite desta empresa para a sua. Responda a ele em vez de criar outro." },
        { status: 409 }
      )
    }
    const reaberta = await prisma.parceriaOrganizacao.update({
      where: { id: existente.id },
      data: {
        status: "pendente",
        criadoPorId: session.user.id,
        criadoEm: new Date(),
        respondidoEm: null,
        respondidoPorId: null,
        encerradaEm: null,
        encerradaPorId: null,
      },
    })
    return NextResponse.json({ parceriaId: reaberta.id, status: reaberta.status, reaberta: true })
  }

  const criada = await prisma.parceriaOrganizacao.create({
    data: {
      organizacaoConvidanteId: organizacaoId,
      organizacaoConvidadaId: alvo.id,
      // Os dois rótulos são reescritos pelo gatilho a partir de `organizacoes`.
      // Mandamos o que sabemos para o registro nascer legível mesmo se alguém
      // desligar o gatilho num banco de teste; a autoridade é o banco.
      nomeConvidante: "",
      nomeConvidada: alvo.nome,
      criadoPorId: session.user.id,
    },
  })

  return NextResponse.json({ parceriaId: criada.id, status: criada.status }, { status: 201 })
}
