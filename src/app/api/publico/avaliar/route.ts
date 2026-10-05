import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { recalcularMediaVideomaker } from "@/lib/avaliacao"

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
      // Sem dono, e de propósito: quem avalia aqui é o cliente final com o
      // celular na mão, não a empresa que contratou. O comentário vale para a
      // rede inteira — é a reputação pública do profissional — e é a única
      // avaliação que toda empresa enxerga.
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
