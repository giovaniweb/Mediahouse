import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { filtroMinhasDemandas } from "@/lib/escopo-demanda"
import { estaAtrasada, STATUS_PRAZO_PAUSADO } from "@/lib/status"

// Painel do executor: no que a pessoa está agora e o que atacar em seguida.
//
// A sugestão é ORDENAÇÃO, não IA: atrasadas primeiro, depois prazo mais próximo,
// depois urgentes. Responde na hora, custa zero e — o que mais importa — a pessoa
// entende por que aquilo apareceu. Um palpite de modelo que ela não consegue
// explicar não ajuda a decidir.

export const dynamic = "force-dynamic"

const SELECAO = {
  id: true, codigo: true, titulo: true, statusVisivel: true, statusInterno: true,
  prioridade: true, dataLimite: true, area: true,
} as const

const PESO_PRIORIDADE: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 }

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const vinculo = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId: session.user.id, organizacaoId } },
    select: { demandaEmFocoId: true, focoDesde: true },
  })

  // O que é meu e ainda está em aberto — é o universo do painel.
  const escopo = await filtroMinhasDemandas(session.user.id, organizacaoId)
  const minhas = await prisma.demanda.findMany({
    where: { organizacaoId, statusVisivel: { not: "finalizado" }, AND: [escopo] },
    select: SELECAO,
    take: 200,
  })

  // Foco guardado que não existe mais (demanda apagada ou concluída) não deve
  // travar o painel: some da leitura e o registro é limpo na próxima escolha.
  const emFoco = vinculo?.demandaEmFocoId
    ? minhas.find((d) => d.id === vinculo.demandaEmFocoId) ?? null
    : null

  const candidatas = minhas
    .filter((d) => d.id !== emFoco?.id)
    .filter((d) => !STATUS_PRAZO_PAUSADO.includes(d.statusVisivel))

  const sugeridas = [...candidatas].sort((a, b) => {
    const atrA = estaAtrasada(a) ? 0 : 1
    const atrB = estaAtrasada(b) ? 0 : 1
    if (atrA !== atrB) return atrA - atrB
    const pa = a.dataLimite ? new Date(a.dataLimite).getTime() : Number.MAX_SAFE_INTEGER
    const pb = b.dataLimite ? new Date(b.dataLimite).getTime() : Number.MAX_SAFE_INTEGER
    if (pa !== pb) return pa - pb
    return (PESO_PRIORIDADE[a.prioridade] ?? 9) - (PESO_PRIORIDADE[b.prioridade] ?? 9)
  }).slice(0, 5)

  return NextResponse.json({
    emFoco,
    focoDesde: emFoco ? vinculo?.focoDesde : null,
    sugeridas,
    totalAbertas: minhas.length,
    atrasadas: minhas.filter(estaAtrasada).length,
  })
}

// PUT { demandaId } marca o foco; { demandaId: null } libera.
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { demandaId } = await req.json()

  if (demandaId) {
    // Só pode focar demanda da própria empresa — id de fora não entra.
    const dela = await prisma.demanda.findFirst({
      where: { id: demandaId, organizacaoId },
      select: { id: true },
    })
    if (!dela) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })
  }

  await prisma.usuarioOrganizacao.updateMany({
    where: { usuarioId: session.user.id, organizacaoId },
    data: {
      demandaEmFocoId: demandaId ?? null,
      focoDesde: demandaId ? new Date() : null,
    },
  })

  return NextResponse.json({ ok: true })
}
