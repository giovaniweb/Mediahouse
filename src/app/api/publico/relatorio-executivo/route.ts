import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const VALOR_POR_VIDEO = 200

// GET /api/publico/relatorio-executivo?mes=YYYY-MM&area=audiovisual  (sem auth)
// Resumo executivo do mês: produção (lançada + NuFlow), total e frentes presenciais.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const area = sp.get("area") === "design" ? "design" : "audiovisual"
  const mesParam = sp.get("mes") // "YYYY-MM"
  const hoje = new Date()
  let ano = hoje.getFullYear()
  let mes = hoje.getMonth() + 1
  if (mesParam && /^\d{4}-\d{2}$/.test(mesParam)) {
    const [y, m] = mesParam.split("-").map(Number)
    ano = y; mes = m
  }
  const de = new Date(Date.UTC(ano, mes - 1, 1))
  const ate = new Date(Date.UTC(ano, mes, 0, 23, 59, 59))
  const competencia = ano * 100 + mes

  // ── Produção manual (lançada) por grupo ──
  const lancamentos = await prisma.producaoManual.findMany({ where: { area, competencia } })
  const producaoPorCategoria: Record<string, number> = {}
  const presencialPorCategoria: Record<string, number> = {}
  for (const l of lancamentos) {
    const alvo = l.grupo === "presencial" ? presencialPorCategoria : producaoPorCategoria
    alvo[l.categoria] = (alvo[l.categoria] ?? 0) + l.quantidade
  }
  const totalManual = Object.values(producaoPorCategoria).reduce((a, b) => a + b, 0)

  // ── Vídeos NuFlow entregues no mês (Arquivo final + legado linkFinal) ──
  const finalizadas = await prisma.demanda.findMany({
    where: {
      area,
      OR: [
        { finalizadaEm: { gte: de, lte: ate } },
        { statusVisivel: "finalizado", finalizadaEm: null, updatedAt: { gte: de, lte: ate } },
      ],
    },
    select: { id: true, linkFinal: true },
  })
  const ids = finalizadas.map((d) => d.id)
  const arquivos = ids.length
    ? await prisma.arquivo.groupBy({ by: ["demandaId"], where: { demandaId: { in: ids }, tipoArquivo: "final" }, _count: { id: true } })
    : []
  const arqMap = new Map(arquivos.map((a) => [a.demandaId, a._count.id]))
  let nuflowVideos = 0
  for (const d of finalizadas) nuflowVideos += arqMap.get(d.id) ?? (d.linkFinal ? 1 : 0)

  const totalGeral = totalManual + nuflowVideos

  return NextResponse.json({
    mes: `${ano}-${String(mes).padStart(2, "0")}`,
    area,
    producaoPorCategoria,
    nuflowVideos,
    totalManual,
    totalGeral,
    presencialPorCategoria,
    producaoRS: totalGeral * VALOR_POR_VIDEO,
    valorPorVideo: VALOR_POR_VIDEO,
  })
}
