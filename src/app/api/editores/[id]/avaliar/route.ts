import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  nota: z.number().min(1).max(5),
  comentario: z.string().optional(),
  atendeuDemandas: z.boolean().optional(),
  foiAtencioso: z.boolean().optional(),
  contratariaNovamente: z.boolean().optional(),
  avaliadorId: z.string().optional(),
  demandaId: z.string().optional(),
  origem: z.enum(["interno", "qr_publico"]).default("qr_publico"),
})

// POST /api/editores/[id]/avaliar — avaliação pública ou interna do editor (Videomaker Int)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: editorId } = await params
  const body = await req.json()

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const editor = await prisma.editor.findUnique({ where: { id: editorId }, select: { id: true, nome: true, avaliacao: true } })
  if (!editor) return NextResponse.json({ error: "Editor não encontrado" }, { status: 404 })

  const avaliacao = await prisma.avaliacaoEditor.create({
    data: {
      editorId,
      nota: parsed.data.nota,
      comentario: parsed.data.comentario,
      atendeuDemandas: parsed.data.atendeuDemandas,
      foiAtencioso: parsed.data.foiAtencioso,
      contratariaNovamente: parsed.data.contratariaNovamente,
      avaliadorId: parsed.data.avaliadorId,
      demandaId: parsed.data.demandaId,
      origem: parsed.data.origem,
    },
  })

  // Recalcular nota média
  const todasAvaliacoes = await prisma.avaliacaoEditor.findMany({
    where: { editorId },
    select: { nota: true },
  })
  const media = todasAvaliacoes.reduce((s, a) => s + a.nota, 0) / todasAvaliacoes.length

  await prisma.editor.update({
    where: { id: editorId },
    data: { avaliacao: Math.round(media * 10) / 10 },
  })

  return NextResponse.json({ ok: true, avaliacao })
}

// GET /api/editores/[id]/avaliar — info pública para a página de avaliação
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: editorId } = await params

  const editor = await prisma.editor.findUnique({
    where: { id: editorId },
    select: { id: true, nome: true, avatarUrl: true, avaliacao: true, especialidade: true },
  })

  if (!editor) return NextResponse.json({ error: "Editor não encontrado" }, { status: 404 })

  return NextResponse.json({ editor })
}
