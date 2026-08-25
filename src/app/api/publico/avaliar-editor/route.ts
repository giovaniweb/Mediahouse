import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { recalcularMediaEditor } from "@/lib/avaliacao"
import { z } from "zod"

// Avaliação PÚBLICA de editor via QR code — sem autenticação, espelhando o que
// /api/publico/avaliar já fazia para o videomaker.
//
// A página /avaliar-editor/[id] apontava para /api/editores/[id]/avaliar, que
// nunca esteve entre as rotas públicas do middleware: o visitante levava 401 no
// GET e no POST. O QR de avaliação de editor existia na tela de equipe e não
// funcionava. Abrir /api/editores para a internet não era opção — é lá que
// moram cadastro, salário e dados fiscais.
//
// Só o perfil público sai daqui: nome, avatar, especialidade e a nota agregada,
// que é global por desenho. Nenhum comentário é devolvido — o que uma empresa
// escreveu sobre o profissional não é assunto de quem está com o celular na mão.

const schema = z.object({
  editorId: z.string().min(1),
  nota: z.number().int().min(1).max(5),
  comentario: z.string().max(2000).optional(),
  atendeuDemandas: z.boolean().optional(),
  foiAtencioso: z.boolean().optional(),
  contratariaNovamente: z.boolean().optional(),
})

// GET /api/publico/avaliar-editor?id=... — perfil público para montar a tela
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })

  const editor = await prisma.editor.findUnique({
    where: { id },
    select: { id: true, nome: true, avatarUrl: true, avaliacao: true, especialidade: true },
  })
  if (!editor) return NextResponse.json({ error: "Editor não encontrado" }, { status: 404 })

  return NextResponse.json({ editor })
}

// POST /api/publico/avaliar-editor
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { editorId, ...dados } = parsed.data

  const editor = await prisma.editor.findUnique({ where: { id: editorId }, select: { id: true, nome: true } })
  if (!editor) return NextResponse.json({ error: "Editor não encontrado" }, { status: 404 })

  await prisma.avaliacaoEditor.create({
    data: {
      editorId,
      nota: dados.nota,
      comentario: dados.comentario ?? null,
      atendeuDemandas: dados.atendeuDemandas,
      foiAtencioso: dados.foiAtencioso,
      contratariaNovamente: dados.contratariaNovamente,
      // Sem sessão não há avaliador. `origem` é fixa aqui: rota pública não
      // aceita o cliente dizer que a avaliação foi interna.
      avaliadorId: null,
      origem: "qr_publico",
    },
  })

  await recalcularMediaEditor(editorId)
  return NextResponse.json({ ok: true, nomeEditor: editor.nome })
}
