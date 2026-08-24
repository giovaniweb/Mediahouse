import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId } from "@/lib/org"
import { videomakerDoUsuario, organizacoesDoVideomaker, etiquetasDeOrganizacao } from "@/lib/campo-escopo"

// GET /api/campo/agenda — próximos 7 dias.
//
// A consulta de `Evento` não tinha escopo NENHUM: o comentário dizia "agenda
// pública do time", e na prática um videomaker da Contourline enxergava a
// agenda de qualquer empresa da plataforma. Com uma empresa só isso era
// invisível; com duas, é a agenda de um cliente aparecendo para o outro.
//
// A fronteira agora é o vínculo: as empresas que contrataram esta pessoa.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const agora = new Date()
  const seteDias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000)

  const vm = await videomakerDoUsuario(session.user.id)
  const isAdmin = ["admin", "gestor"].includes((session.user as { tipo?: string }).tipo ?? "")

  // Quais empresas esta pessoa pode enxergar aqui.
  let orgs: string[]
  if (vm && !isAdmin) {
    orgs = await organizacoesDoVideomaker(vm.id)
  } else {
    const ativa = await getOrgId(session)
    orgs = ativa ? [ativa] : []
  }
  if (orgs.length === 0) return NextResponse.json({ eventos: [], coberturas: [], multiempresa: false })

  const eventos = await prisma.evento.findMany({
    where: { inicio: { gte: agora, lte: seteDias }, organizacaoId: { in: orgs } },
    select: {
      id: true, titulo: true, descricao: true, inicio: true, fim: true,
      local: true, tipo: true, organizacaoId: true,
    },
    orderBy: { inicio: "asc" },
    take: 20,
  })

  const coberturas = await prisma.eventoCobertura.findMany({
    where: {
      status: { in: ["planejamento", "em_andamento"] },
      dataInicio: { lte: seteDias },
      dataFim: { gte: agora },
      organizacaoId: { in: orgs },
      // Videomaker vê a cobertura em que ENTROU na equipe, não toda cobertura
      // da empresa.
      ...(vm && !isAdmin ? { equipe: { some: { videomakerId: vm.id } } } : {}),
    },
    select: {
      id: true, titulo: true, tipo: true, status: true, dataInicio: true,
      dataFim: true, local: true, cidade: true, slug: true, organizacaoId: true,
    },
    orderBy: { dataInicio: "asc" },
    take: 10,
  })

  const etiquetas = await etiquetasDeOrganizacao([
    ...eventos.map((e) => e.organizacaoId),
    ...coberturas.map((c) => c.organizacaoId),
  ].filter(Boolean) as string[])

  const comEmpresa = <T extends { organizacaoId: string | null }>(x: T) => ({
    ...x,
    empresa: x.organizacaoId ? etiquetas.get(x.organizacaoId) ?? null : null,
  })

  return NextResponse.json({
    eventos: eventos.map(comEmpresa),
    coberturas: coberturas.map(comEmpresa),
    multiempresa: orgs.length > 1,
  })
}
