import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { syncDemandaTrello } from "@/lib/trello"
import { configTrelloDaOrg } from "@/lib/trello-config"

export async function POST() {
  const session = await auth()
  if (!session || !ehGestor(session)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  // O lote 1 escopou a CONSULTA de demandas, mas o destino continuava sendo o
  // board único das variáveis de ambiente: as demandas certas iam para o quadro
  // errado. O board tem dono, e só ele sincroniza.
  const conf = await configTrelloDaOrg(organizacaoId)
  if (!conf.ok) return NextResponse.json({ ok: false, error: conf.erro }, { status: conf.status })

  const cfg = conf.cfg

  const demandas = await prisma.demanda.findMany({
    where: { organizacaoId, statusInterno: { notIn: ["encerrado", "expirado"] } },
    select: { id: true, codigo: true, titulo: true, descricao: true, statusVisivel: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  let count = 0
  const errors: string[] = []

  for (const d of demandas) {
    try {
      await syncDemandaTrello(cfg, d)
      count++
    } catch (e) {
      errors.push(`${d.codigo}: ${e instanceof Error ? e.message : "Erro"}`)
    }
  }

  return NextResponse.json({ ok: true, count, errors })
}
