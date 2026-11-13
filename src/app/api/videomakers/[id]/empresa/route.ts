// "Empresa dele": a empresa pela qual este videomaker trabalha para a empresa
// ativa (o Gabriel trabalha para a Contourline pela GH Produção), 12/11/2026.
//
// Gravar é da gestão da empresa ativa (a dona dos cards). Com parceria aceita
// entre as duas, os cards abertos dele vão para lá na hora; sem parceria, a
// rota manda o convite e os cards vão quando a outra empresa aceitar
// (src/app/api/parcerias/[id]/route.ts). Tirar ou trocar a empresa revoga os
// espelhos dos cards abertos — isso é do gatilho do banco.
//
// O banco exige que ele seja admin ou gestor na empresa dele: sem isso, os cards
// iriam para uma empresa onde ele não escolhe nada.
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { getOrgId, semOrg } from "@/lib/org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { ehGestaoDaEmpresa, resolverEmpresaPorSlug } from "@/lib/parceria"
import { espelharGravacoesAbertas } from "@/lib/espelho-do-videomaker"

type Params = { params: Promise<{ id: string }> }

const naoEncontrado = () => NextResponse.json({ error: "Não encontrado" }, { status: 404 })

async function estado(organizacaoId: string, videomakerId: string) {
  const vinculo = await prisma.videomakerOrganizacao.findUnique({
    where: { organizacaoId_videomakerId: { organizacaoId, videomakerId } },
    select: { organizacaoExecutoraId: true },
  })
  const executoraId = vinculo?.organizacaoExecutoraId ?? null
  if (!executoraId) return { empresa: null, parceria: null, cardsLa: 0 }
  // `organizacoes` só mostra a própria empresa ao cliente normal; o nome e o
  // slug da outra saem pelo cliente de autenticação, só leitura (como em
  // resolverEmpresaPorSlug).
  const [org, parceria, cardsLa] = await Promise.all([
    prismaAuth.organizacao.findUnique({ where: { id: executoraId }, select: { nome: true, slug: true } }),
    prisma.parceriaOrganizacao.findFirst({
      where: { OR: [
        { organizacaoConvidanteId: organizacaoId, organizacaoConvidadaId: executoraId },
        { organizacaoConvidanteId: executoraId, organizacaoConvidadaId: organizacaoId },
      ] },
      select: { status: true, organizacaoConvidanteId: true },
    }),
    prisma.demandaCompartilhamento.count({
      where: { organizacaoOrigemId: organizacaoId, organizacaoDestinoId: executoraId, porVideomakerId: videomakerId, revogadoEm: null },
    }),
  ])
  return {
    empresa: { organizacaoId: executoraId, nome: org?.nome ?? "Empresa", slug: org?.slug ?? null },
    parceria: parceria ? { status: parceria.status, convidouFoiEsta: parceria.organizacaoConvidanteId === organizacaoId } : null,
    cardsLa,
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const { id } = await params

  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  if (!ehGestaoDaEmpresa(vinculo?.papel)) return naoEncontrado()
  const tem = await prisma.videomakerOrganizacao.count({ where: { organizacaoId, videomakerId: id } })
  if (!tem) return naoEncontrado()

  return NextResponse.json({ ...(await estado(organizacaoId, id)), podeEditar: true })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const { id } = await params

  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  if (!ehGestaoDaEmpresa(vinculo?.papel)) {
    // A outra empresa (ou quem não é gestão) não fica sabendo que o cadastro existe.
    return naoEncontrado()
  }
  const vo = await prisma.videomakerOrganizacao.findUnique({
    where: { organizacaoId_videomakerId: { organizacaoId, videomakerId: id } },
    select: { id: true, organizacaoExecutoraId: true },
  })
  if (!vo) return naoEncontrado()

  const corpo = (await req.json().catch(() => ({}))) as { slug?: string | null }
  if (corpo.slug === undefined) return NextResponse.json({ error: "Informe a empresa (ou vazio para tirar)." }, { status: 400 })

  // Tirar: os cards abertos saem da empresa dele (gatilho do banco).
  if (corpo.slug === null || corpo.slug.trim() === "") {
    await prisma.videomakerOrganizacao.update({ where: { id: vo.id }, data: { organizacaoExecutoraId: null } })
    return NextResponse.json({ ...(await estado(organizacaoId, id)), espelhados: 0 })
  }

  const alvo = await resolverEmpresaPorSlug(corpo.slug)
  if (!alvo) return NextResponse.json({ error: "Empresa não encontrada. Confira o endereço dela no NuFlow." }, { status: 404 })
  if (alvo.id === organizacaoId) return NextResponse.json({ error: "A empresa dele não pode ser esta mesma." }, { status: 400 })

  try {
    await prisma.videomakerOrganizacao.update({ where: { id: vo.id }, data: { organizacaoExecutoraId: alvo.id } })
  } catch (e) {
    if (e instanceof Error && /admin ou gestor/.test(e.message)) {
      return NextResponse.json(
        { error: `Para os cards irem para ${alvo.nome}, ele precisa ter login lá como admin ou gestor.` },
        { status: 400 }
      )
    }
    throw e
  }

  // Parceria: aceita → os cards vão agora. Sem parceria → convite (os cards vão no aceite).
  const parceria = await prisma.parceriaOrganizacao.findFirst({
    where: { OR: [
      { organizacaoConvidanteId: organizacaoId, organizacaoConvidadaId: alvo.id },
      { organizacaoConvidanteId: alvo.id, organizacaoConvidadaId: organizacaoId },
    ] },
  })
  let espelhados = 0
  if (parceria?.status === "aceita" && !parceria.encerradaEm) {
    espelhados = (await espelharGravacoesAbertas(organizacaoId, id)).length
  } else if (!parceria) {
    await prisma.parceriaOrganizacao.create({ data: {
      organizacaoConvidanteId: organizacaoId, organizacaoConvidadaId: alvo.id,
      nomeConvidante: "", nomeConvidada: alvo.nome, criadoPorId: session.user.id,
    } })
  } else if (parceria.organizacaoConvidanteId === organizacaoId && parceria.status !== "pendente") {
    // Recusada ou encerrada antes: o convite é refeito, como em POST /api/parcerias.
    await prisma.parceriaOrganizacao.update({ where: { id: parceria.id }, data: {
      status: "pendente", criadoPorId: session.user.id, criadoEm: new Date(),
      respondidoEm: null, respondidoPorId: null, encerradaEm: null, encerradaPorId: null,
    } })
  }
  return NextResponse.json({ ...(await estado(organizacaoId, id)), espelhados })
}
