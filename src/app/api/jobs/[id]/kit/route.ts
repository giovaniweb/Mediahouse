import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { acessoAoKit } from "@/lib/kit-videomaker-server"
import { materiaisDaGravacao } from "@/lib/kit-videomaker"
import { dadosDaGravacao, enfileirarAvisos } from "@/lib/avisos-gravacao"
import { processarSaidas } from "@/lib/whatsapp-outbox"

type Params = { params: Promise<{ id: string }> }

// POST /api/jobs/[id]/kit — manda no WhatsApp do videomaker o link da página
// dele (o convite), onde estão o guia, as referências e a colinha do dia.
export async function POST(_req: NextRequest, { params }: Params) {
  const acesso = await acessoAoKit(true)
  if (acesso instanceof NextResponse) return acesso
  const { id } = await params
  const { organizacaoId } = acesso
  const r = await comOrg(organizacaoId, () => prisma.$transaction(async (tx) => {
    const g = await dadosDaGravacao(tx, organizacaoId, id)
    if (!g) return { erro: "Gravação não encontrada.", status: 404 }
    if (!g.videomakerId || !g.videomakerTelefone) return { erro: "A gravação precisa de um videomaker com WhatsApp.", status: 409 }
    if (!g.linkEntrega) return { erro: "Mande o convite ao videomaker antes: as instruções ficam na página dele.", status: 409 }
    const kit = materiaisDaGravacao(await tx.materialVideomaker.findMany({ where: { organizacaoId }, select: { id: true, titulo: true, tipo: true, tipoGravacao: true, ordem: true } }), g.tipoGravacao)
    if (!kit.length) return { erro: "O kit do videomaker está vazio. Monte o kit em Gravações Externas.", status: 409 }
    const cliente = g.clienteFinalNome?.trim() || g.titulo
    const texto = [
      `📘 Instruções e referências da gravação ${cliente} (${g.codigo}):`,
      kit.map((m) => `• ${m.titulo}`).join("\n"),
      `Está tudo no seu link:\n${g.linkEntrega}`,
    ].join("\n\n")
    const n = await enfileirarAvisos(tx, { organizacaoId, gravacao: g, motivo: "kit", mensagens: { videomaker: texto } })
    return { n }
  }))
  if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  if (r.n > 0) {
    try { after(async () => { await processarSaidas(organizacaoId).catch(() => undefined) }) } catch { /* o consumidor da fila retoma */ }
  }
  return NextResponse.json({ mensagem: r.n > 0 ? "Instruções enviadas ao videomaker." : "Já foi enviado hoje para este videomaker." })
}
