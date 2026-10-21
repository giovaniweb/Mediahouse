import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { LIMITE_COMENTARIO_AVALIACAO } from "@/lib/avaliacao-limite"
import { prisma } from "@/lib/prisma"
import { recalcularMediaVideomaker } from "@/lib/avaliacao"
import { lerConvite, MSG_CONVITE } from "@/lib/convite-avaliacao"
import { barrarAvaliacao, servicoJaAvaliado } from "@/lib/avaliacao-publica"

// Avaliação pública de videomaker pelo convite (QR ou link) — sem login.
//
// Até 07/10/2026 bastava o id do videomaker: qualquer um dava quantas notas
// quisesse e mexia na média que a rede inteira vê. Agora exige o convite
// assinado (lib/convite-avaliacao), que diz o serviço e vale uma avaliação.

const schema = z.object({
  convite: z.string().max(600).optional(),
  nota: z.coerce.number().int().min(1).max(5),
  comentario: z.string().max(LIMITE_COMENTARIO_AVALIACAO).optional().nullable(),
  checklist: z.object({
    atendeuDemandas: z.string().optional(),
    foiPontual: z.string().optional(),
    contratariaNovamente: z.string().optional(),
  }).optional().nullable(),
})

// GET /api/publico/avaliar?c=<convite> — a tela confere o convite antes de mostrar o formulário.
export async function GET(req: NextRequest) {
  const leitura = lerConvite(req.nextUrl.searchParams.get("c"), "videomaker")
  if (!leitura.ok) return NextResponse.json({ error: MSG_CONVITE[leitura.motivo] }, { status: 410 })
  const { profissionalId, demandaId } = leitura.convite
  if (await servicoJaAvaliado("videomaker", profissionalId, demandaId)) {
    return NextResponse.json({ error: MSG_CONVITE.usado, usado: true }, { status: 410 })
  }
  const vm = await prisma.videomaker.findUnique({ where: { id: profissionalId }, select: { nome: true, cidade: true, estado: true } })
  if (!vm) return NextResponse.json({ error: MSG_CONVITE.invalido }, { status: 410 })
  return NextResponse.json({ videomaker: vm })
}

// POST /api/publico/avaliar
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Escolha uma nota de 1 a 5." }, { status: 400 })
  const { convite, nota, comentario, checklist } = parsed.data

  const leitura = lerConvite(convite, "videomaker")
  if (!leitura.ok) return NextResponse.json({ error: MSG_CONVITE[leitura.motivo] }, { status: 403 })
  const { profissionalId: videomakerId, demandaId } = leitura.convite

  const barrado = await barrarAvaliacao(req.headers, "videomaker", videomakerId, demandaId)
  if (barrado) return barrado

  const vm = await prisma.videomaker.findUnique({ where: { id: videomakerId }, select: { nome: true } })
  if (!vm) return NextResponse.json({ error: MSG_CONVITE.invalido }, { status: 403 })

  // As respostas do checklist entram no começo do comentário.
  let comentarioFinal = comentario ?? null
  if (checklist) {
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
      nota,
      comentario: comentarioFinal,
      origem: "qr_publico",
      // O serviço do convite: é o que faz valer uma avaliação por serviço.
      demandaId,
      // Sem dono na linha: a rota é pública e não declara empresa. A empresa
      // é a do serviço do convite (demandaId), e é só ela — com o profissional
      // — que lê o comentário (Política de Avaliações, seção 3; lib/rede). A
      // nota entra na média da rede.
      organizacaoId: null,
    },
  })

  // A média é global e entra pela função do banco, igual à avaliação de editor
  // por QR. Calculada aqui, ela só enxergaria as avaliações sem dono — sob RLS,
  // sem empresa declarada — e o UPDATE no perfil nem passaria: a rota gravava a
  // avaliação e respondia 500. Ver src/lib/avaliacao.ts.
  await recalcularMediaVideomaker(videomakerId)

  return NextResponse.json({ ok: true, nomeVideomaker: vm.nome })
}
