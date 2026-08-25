import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { syncDemandaTrello } from "@/lib/trello"

export async function POST() {
  const session = await auth()
  if (!session || !ehGestor(session)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const apiKey = process.env.TRELLO_API_KEY
  const token = process.env.TRELLO_TOKEN
  const boardId = process.env.TRELLO_BOARD_ID

  if (!apiKey || !token || !boardId) {
    return NextResponse.json({ ok: false, error: "Credenciais Trello não configuradas nas variáveis de ambiente" })
  }

  const cfg = { apiKey, token, boardId }

  // O board do Trello é de uma empresa; a consulta trazia demanda de todas.
  // Sincronizar assim publica o pipeline de um cliente no quadro de outro.
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

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
