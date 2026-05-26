import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/admin/backfill-arquivos
// Cria registros Arquivo(tipoArquivo="final") a partir de linkFinal para demandas
// que não têm nenhum Arquivo final cadastrado.
// Necessário para que a galeria suporte múltiplos vídeos por demanda e
// para consistência do modelo de dados após a migração para Arquivo records.
// Requer sessão admin.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || (session.user as { tipo?: string }).tipo !== "admin") {
    return NextResponse.json({ error: "Apenas admins podem executar o backfill" }, { status: 401 })
  }

  // Busca demandas com linkFinal que estão finalizadas/para_postar
  const demandas = await prisma.demanda.findMany({
    where: {
      statusVisivel: { in: ["finalizado", "para_postar"] },
      linkFinal: { not: null },
    },
    select: {
      id: true,
      codigo: true,
      linkFinal: true,
      thumbnailUrl: true,
      _count: { select: { arquivos: { where: { tipoArquivo: "final" } } } },
    },
  })

  let processados = 0
  let pulados = 0
  let erros = 0
  const detalhes: { codigo: string; status: "criado" | "pulado" | "erro"; detalhe: string }[] = []

  for (const demanda of demandas) {
    try {
      // Pula se já tem pelo menos 1 Arquivo final (evita duplicatas)
      if (demanda._count.arquivos > 0) {
        pulados++
        detalhes.push({
          codigo: demanda.codigo,
          status: "pulado",
          detalhe: `Já tem ${demanda._count.arquivos} Arquivo(s) final(is)`,
        })
        continue
      }

      const url = demanda.linkFinal!
      // Extrai extensão da URL; fallback "mp4"
      const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "mp4"
      const nomeArquivo = `${demanda.codigo}_001.${ext}`

      await prisma.arquivo.create({
        data: {
          demandaId: demanda.id,
          tipoArquivo: "final",
          nomeArquivo,
          url,
          sequencia: 1,
          ...(demanda.thumbnailUrl ? { thumbnailUrl: demanda.thumbnailUrl } : {}),
        },
      })

      processados++
      detalhes.push({ codigo: demanda.codigo, status: "criado", detalhe: "Arquivo final criado (seq 1)" })
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
    total: demandas.length,
    processados,
    pulados,
    erros,
    detalhes,
  })
}
