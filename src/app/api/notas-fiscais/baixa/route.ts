import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAcesso } from "@/lib/acesso"
import { darBaixaNasNotas, LIMITE_DA_BAIXA } from "@/lib/baixa-de-notas"

// POST /api/notas-fiscais/baixa — dá baixa nas notas marcadas na página Notas
// fiscais: ficam pagas, sem aviso a ninguém (lib/baixa-de-notas.ts). O mesmo
// acesso da página: admin e gestor pelo papel, os outros com `verCustos`.
export async function POST(req: Request) {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  if (!["admin", "gestor"].includes(acesso.papel) && !acesso.permissoes.verCustos) {
    return NextResponse.json({ error: "Só a gestão e o financeiro dão baixa nas notas." }, { status: 403 })
  }
  const corpo = z.object({ demandaIds: z.array(z.string().min(1).max(128)).min(1).max(LIMITE_DA_BAIXA) }).strict()
    .safeParse(await req.json().catch(() => null))
  if (!corpo.success) return NextResponse.json({ error: `Marque de 1 a ${LIMITE_DA_BAIXA} gravações.` }, { status: 400 })

  const r = await darBaixaNasNotas({ organizacaoId: acesso.organizacaoId, usuarioId: acesso.usuarioId }, corpo.data.demandaIds)
  const partes = [
    r.baixadas.length && `${r.baixadas.length} ${r.baixadas.length === 1 ? "nota baixada" : "notas baixadas"}`,
    r.jaPagas.length && `${r.jaPagas.length} já ${r.jaPagas.length === 1 ? "estava paga" : "estavam pagas"}`,
    r.recusadas.length && `${r.recusadas.length} não ${r.recusadas.length === 1 ? "deu" : "deram"} (${r.recusadas.map((x) => `${x.codigo}: ${x.motivo}`).join("; ")})`,
  ].filter(Boolean)
  return NextResponse.json({ ...r, mensagem: `${partes.join(", ")}. Ninguém foi avisado.` }, { headers: { "Cache-Control": "private, no-store" } })
}
