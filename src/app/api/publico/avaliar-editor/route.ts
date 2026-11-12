import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { recalcularMediaEditor } from "@/lib/avaliacao"
import { z } from "zod"
import { LIMITE_COMENTARIO_AVALIACAO } from "@/lib/avaliacao-limite"
import { lerConvite, MSG_CONVITE } from "@/lib/convite-avaliacao"
import { barrarAvaliacao, servicoJaAvaliado } from "@/lib/avaliacao-publica"

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
//
// Desde 07/10/2026 a nota exige o convite assinado do serviço (QR ou link
// gerado na página do profissional): uma avaliação por serviço, com validade.
// Antes bastava o id do editor. Ver lib/convite-avaliacao.

const schema = z.object({
  convite: z.string().max(600).optional(),
  nota: z.number().int().min(1).max(5),
  comentario: z.string().max(LIMITE_COMENTARIO_AVALIACAO).optional(),
  atendeuDemandas: z.boolean().optional(),
  foiAtencioso: z.boolean().optional(),
  contratariaNovamente: z.boolean().optional(),
})

// GET /api/publico/avaliar-editor?c=<convite> — confere o convite e devolve o perfil público
export async function GET(req: NextRequest) {
  const leitura = lerConvite(req.nextUrl.searchParams.get("c"), "editor")
  if (!leitura.ok) return NextResponse.json({ error: MSG_CONVITE[leitura.motivo] }, { status: 410 })
  const { profissionalId, demandaId } = leitura.convite
  if (await servicoJaAvaliado("editor", profissionalId, demandaId)) {
    return NextResponse.json({ error: MSG_CONVITE.usado, usado: true }, { status: 410 })
  }

  const editor = await prisma.editor.findUnique({
    where: { id: profissionalId },
    select: { id: true, nome: true, avatarUrl: true, avaliacao: true, especialidade: true },
  })
  if (!editor) return NextResponse.json({ error: MSG_CONVITE.invalido }, { status: 410 })

  return NextResponse.json({ editor })
}

// POST /api/publico/avaliar-editor
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { convite, ...dados } = parsed.data
  const leitura = lerConvite(convite, "editor")
  if (!leitura.ok) return NextResponse.json({ error: MSG_CONVITE[leitura.motivo] }, { status: 403 })
  const { profissionalId: editorId, demandaId } = leitura.convite

  const barrado = await barrarAvaliacao(req.headers, "editor", editorId, demandaId)
  if (barrado) return barrado

  const editor = await prisma.editor.findUnique({ where: { id: editorId }, select: { id: true, nome: true } })
  if (!editor) return NextResponse.json({ error: MSG_CONVITE.invalido }, { status: 403 })

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
      // O serviço do convite: é o que faz valer uma avaliação por serviço.
      demandaId,
      // Sem dono, e de propósito: quem avalia aqui é o cliente final com o
      // celular na mão, não a empresa que contratou. O comentário vale para a
      // rede inteira — é a reputação pública do profissional — e é a única
      // avaliação que toda empresa enxerga.
      organizacaoId: null,
    },
  })

  await recalcularMediaEditor(editorId)
  return NextResponse.json({ ok: true, nomeEditor: editor.nome })
}
