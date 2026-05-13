import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/admin/backfill-custos
// Cria CustoVideomaker retroativamente para demandas finalizadas sem custo vinculado.
// Requer sessão admin.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.tipo !== "admin") {
    return NextResponse.json({ error: "Apenas admins podem executar o backfill" }, { status: 401 })
  }

  // Busca demandas finalizadas com videomakerId, sem custo com demandaId
  const demandasFinalizadas = await prisma.demanda.findMany({
    where: {
      statusVisivel: "finalizado",
      videomakerId: { not: null },
    },
    select: {
      id: true,
      codigo: true,
      titulo: true,
      videomakerId: true,
      videomaker: { select: { valorDiaria: true } },
      finalizadaEm: true,
      updatedAt: true,
    },
  })

  let processados = 0
  let pulados = 0
  let erros = 0
  const detalhes: { codigo: string; status: "criado" | "pulado" | "erro"; detalhe: string }[] = []

  for (const demanda of demandasFinalizadas) {
    try {
      // Verificar se já existe custo vinculado a esta demanda
      const jaExiste = await prisma.custoVideomaker.findFirst({
        where: { demandaId: demanda.id, videomakerId: demanda.videomakerId! },
      })

      if (jaExiste) {
        pulados++
        detalhes.push({ codigo: demanda.codigo, status: "pulado", detalhe: "Custo já existia" })
        continue
      }

      const valor = demanda.videomaker?.valorDiaria ?? 0
      const dataRef = demanda.finalizadaEm ?? demanda.updatedAt

      await prisma.custoVideomaker.create({
        data: {
          videomakerId: demanda.videomakerId!,
          demandaId: demanda.id,
          tipo: "projeto",
          valor,
          descricao: `Serviço (backfill): ${demanda.codigo} — ${demanda.titulo}`,
          dataReferencia: dataRef,
          pago: false,
          statusPagamento: "pendente_nf",
        },
      })

      processados++
      detalhes.push({ codigo: demanda.codigo, status: "criado", detalhe: `Custo R$${valor} criado` })
    } catch (e) {
      erros++
      detalhes.push({
        codigo: demanda.codigo,
        status: "erro",
        detalhe: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({
    ok: true,
    total: demandasFinalizadas.length,
    processados,
    pulados,
    erros,
    detalhes,
  })
}
