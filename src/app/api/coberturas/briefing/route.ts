import { NextRequest, NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { BriefingInvalido, extrairBriefing } from "@/lib/ia-briefing"
import { PDF_MAX_BYTES } from "@/lib/briefing"
import { LimiteIA } from "@/lib/ia-orcamento"

export const maxDuration = 60
const resposta = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })

export async function POST(req: NextRequest) {
  // Destino é uma escolha de capacidade, nunca de empresa ou usuário.
  const destino = req.nextUrl.searchParams.get("destino") ?? "coberturas"
  if (!["eventos", "coberturas"].includes(destino)) return resposta({ error: "Destino inválido" }, 400)
  const acesso = await requireAcesso(destino === "eventos" ? "verEventos" : "verCoberturas")
  if (acesso instanceof NextResponse) return acesso
  try {
    // Limita a leitura real antes de materializar multipart, sem confiar em Content-Length.
    const reader = req.body?.getReader()
    if (!reader) return resposta({ error: "Envie um PDF de até 3 MB." }, 400)
    const partes: Uint8Array[] = []
    let tamanho = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        tamanho += value.byteLength
        if (tamanho > PDF_MAX_BYTES + 65536) {
          await reader.cancel()
          return resposta({ error: "PDF muito grande. O limite é 3 MB." }, 413)
        }
        partes.push(value)
      }
    } finally { reader.releaseLock() }
    let form: FormData
    try {
      form = await new Response(Buffer.concat(partes), { headers: { "Content-Type": req.headers.get("Content-Type") ?? "" } }).formData()
    } catch { return resposta({ error: "Arquivo inválido. Envie um PDF de até 3 MB." }, 400) }
    const file = form.get("file")
    if (!(file instanceof File) || file.type !== "application/pdf" || !file.size || file.size > PDF_MAX_BYTES) return resposta({ error: "Envie um PDF de até 3 MB." }, 400)
    const dados = await extrairBriefing(Buffer.from(await file.arrayBuffer()), { organizacaoId: acesso.organizacaoId, usuarioId: acesso.usuarioId, finalidade: `briefing.${destino}` })
    return resposta({ dados })
  } catch (e) {
    if (e instanceof LimiteIA) return resposta({ error: `${e.message} Você pode preencher o evento manualmente.`, tipo: "limite_ia" }, 429)
    if (e instanceof BriefingInvalido) return resposta({ error: "Não foi possível extrair dados válidos. Confira o PDF ou preencha o evento manualmente." }, 422)
    return resposta({ error: "Não foi possível concluir a importação. Confira o consumo antes de tentar novamente ou preencha manualmente.", tipo: "processamento" }, 503)
  }
}
