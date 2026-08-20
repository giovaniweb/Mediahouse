import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { diariaDaEmpresa } from "@/lib/videomaker-vinculo"

// POST /api/admin/backfill-custos
// Cria CustoVideomaker retroativamente para demandas finalizadas sem custo vinculado.
// Requer sessão admin.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.tipo !== "admin") {
    return NextResponse.json({ error: "Apenas admins podem executar o backfill" }, { status: 401 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  // Busca demandas finalizadas com videomakerId, sem custo com demandaId (apenas da org do admin)
  const demandasFinalizadas = await prisma.demanda.findMany({
    where: {
      organizacaoId,
      statusVisivel: "finalizado",
      videomakerId: { not: null },
    },
    select: {
      id: true,
      codigo: true,
      titulo: true,
      videomakerId: true,
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

      // Quarto lugar que cria custo, mesma regra dos outros três: a diária é
      // do vínculo desta empresa. Sem valor combinado o backfill NÃO inventa
      // zero — pula e diz por quê, porque é exatamente esse zero silencioso que
      // encheu a base de custos R$ 0.
      const diaria = await diariaDaEmpresa(demanda.videomakerId!, organizacaoId)
      if (diaria === null) {
        pulados++
        detalhes.push({ codigo: demanda.codigo, status: "pulado", detalhe: "Sem diária no vínculo — precisa de valor manual" })
        continue
      }
      const valor = diaria
      const dataRef = demanda.finalizadaEm ?? demanda.updatedAt

      await prisma.custoVideomaker.create({
        data: {
          organizacaoId,
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
