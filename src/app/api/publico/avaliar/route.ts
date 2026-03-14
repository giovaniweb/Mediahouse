import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// POST /api/publico/avaliar — avaliação pública via QR code (sem autenticação)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { videomakerId, nota, comentario, checklist } = body

  if (!videomakerId || !nota || nota < 1 || nota > 5) {
    return NextResponse.json({ error: "videomakerId e nota (1-5) são obrigatórios" }, { status: 400 })
  }

  const vm = await prisma.videomaker.findUnique({ where: { id: videomakerId } })
  if (!vm) return NextResponse.json({ error: "Videomaker não encontrado" }, { status: 404 })

  // Build final comment: prepend checklist answers if provided
  let comentarioFinal = comentario ?? null
  if (checklist && typeof checklist === "object") {
    const linhas = [
      `[Checklist] Atendeu as demandas conforme o combinado? ${checklist.atendeuDemandas === "sim" ? "Sim" : "Não"}`,
      `[Checklist] Foi pontual e atencioso? ${checklist.foiPontual === "sim" ? "Sim" : "Não"}`,
      `[Checklist] Contrataria novamente? ${checklist.contratariaNovamente === "sim" ? "Sim" : "Não"}`,
    ]
    const prefixo = linhas.join("\n")
    comentarioFinal = comentario ? `${prefixo}\n\n${comentario}` : prefixo
  }

  await prisma.avaliacaoVideomaker.create({
    data: {
      videomakerId,
      nota: parseInt(nota),
      comentario: comentarioFinal,
      origem: "qr_publico",
    },
  })

  // Recalcular média
  const todas = await prisma.avaliacaoVideomaker.findMany({
    where: { videomakerId },
    select: { nota: true },
  })
  const media = todas.reduce((s, a) => s + a.nota, 0) / todas.length

  await prisma.videomaker.update({
    where: { id: videomakerId },
    data: { avaliacao: Math.round(media * 10) / 10 },
  })

  return NextResponse.json({ ok: true, nomeVideomaker: vm.nome })
}
