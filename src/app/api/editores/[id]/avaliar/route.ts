import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recalcularMediaEditor } from "@/lib/avaliacao"
import { getOrgId, semOrg } from "@/lib/org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { z } from "zod"
import { LIMITE_COMENTARIO_AVALIACAO } from "@/lib/avaliacao-limite"

// Avaliação INTERNA de editor — quem trabalhou com ele dando a nota.
//
// Esta rota atendia dois públicos ao mesmo tempo: o painel logado e a página de
// QR code `/avaliar-editor/[id]`. Só que ela nunca esteve na lista de rotas
// públicas do middleware, então a página de QR levava 401 no GET e no POST — o
// visitante via "erro ao carregar dados" e, se insistisse, "erro ao enviar".
// A avaliação por QR de editor nunca funcionou.
//
// O conserto não é abrir `/api/editores` para a internet (são as rotas de
// cadastro, salário e dados fiscais do editor). É dar ao público a rota dele:
// /api/publico/avaliar-editor, espelhando o que o videomaker já tinha.
//
// Aqui fica só o interno, e com sessão obrigatória no handler — não apenas no
// middleware.
const schema = z.object({
  nota: z.number().min(1).max(5),
  comentario: z.string().max(LIMITE_COMENTARIO_AVALIACAO).optional(),
  atendeuDemandas: z.boolean().optional(),
  foiAtencioso: z.boolean().optional(),
  contratariaNovamente: z.boolean().optional(),
  demandaId: z.string().optional(),
})

// POST /api/editores/[id]/avaliar
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id: editorId } = await params
  const body = await req.json()

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const editor = await prisma.editor.findUnique({ where: { id: editorId }, select: { id: true } })
  if (!editor) return NextResponse.json({ error: "Editor não encontrado" }, { status: 404 })

  const avaliacao = await prisma.avaliacaoEditor.create({
    data: {
      editorId,
      nota: parsed.data.nota,
      comentario: parsed.data.comentario,
      atendeuDemandas: parsed.data.atendeuDemandas,
      foiAtencioso: parsed.data.foiAtencioso,
      contratariaNovamente: parsed.data.contratariaNovamente,
      demandaId: parsed.data.demandaId,
      // `avaliadorId` e `origem` vinham do CORPO. O corpo é do cliente: dava
      // para assinar a avaliação com o id de outra pessoa e ainda marcá-la como
      // interna. Ambos saem da sessão agora, e `avaliadorId` deixou o schema.
      avaliadorId: session.user.id,
      origem: "interno",
      organizacaoId,
    },
  })

  await recalcularMediaEditor(editorId)
  return NextResponse.json({ ok: true, avaliacao })
}

// GET /api/editores/[id]/avaliar — listar avaliações + info do editor
//
// Mesma separação da avaliação de videomaker: a NOTA agregada é da rede, o
// COMENTÁRIO é de quem contratou. A lista traz o desta empresa mais o que veio
// por QR público, que não tem dono.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  // Quem vê a lista é quem gerencia a equipe (a tela /equipe pede o mesmo).
  // Sem isso, qualquer pessoa logada — o próprio editor inclusive — lia as
  // avaliações por este endereço. A página de avaliação promete "o editor não
  // vê quem avaliou" (Onda 3, 11/11/2026).
  const acesso = await permissoesEfetivas(session.user.id, organizacaoId)
  if (!acesso?.permissoes.verEquipe) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

  const { id: editorId } = await params

  const editor = await prisma.editor.findUnique({
    where: { id: editorId },
    select: { id: true, nome: true, avatarUrl: true, avaliacao: true, especialidade: true },
  })
  if (!editor) return NextResponse.json({ error: "Editor não encontrado" }, { status: 404 })

  const [avaliacoes, { _avg, _count }] = await Promise.all([
    prisma.avaliacaoEditor.findMany({
      where: {
        editorId,
        OR: [{ organizacaoId }, { organizacaoId: null }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      // Sem avaliadorId nem demandaId: a lista não diz quem avaliou.
      select: {
        id: true, nota: true, comentario: true, atendeuDemandas: true, foiAtencioso: true,
        contratariaNovamente: true, origem: true, createdAt: true,
      },
    }),
    prisma.avaliacaoEditor.aggregate({ where: { editorId }, _avg: { nota: true }, _count: true }),
  ])

  // Média sobre todas, não sobre as 50 listadas.
  return NextResponse.json({
    editor,
    avaliacoes,
    media: Math.round((_avg.nota ?? 0) * 10) / 10,
    total: _count,
  })
}
