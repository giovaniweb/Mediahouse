import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { workerMidiaAtivo } from "@/lib/midia-worker-config"
import { reivindicarConversao, renovarConversao, falharConversao, concluirConversao, leaseSchema, resultadoMidiaSchema } from "@/lib/midia-worker"

const entrada = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("reivindicar") }).strict(),
  leaseSchema.extend({ acao: z.literal("renovar") }).strict(),
  leaseSchema.extend({ acao: z.literal("falhar"), recuperavel: z.boolean() }).strict(),
  z.object({ acao: z.literal("concluir"), resultado: resultadoMidiaSchema }).strict(),
])
export async function POST(req: NextRequest) {
  const organizacaoId = process.env.MIDIA_WORKER_ORGANIZACAO_ID ?? ""
  const headers = { "Cache-Control": "no-store" }
  if (!workerMidiaAtivo(organizacaoId)) return NextResponse.json({ error: "worker_inativo" }, { status: 503, headers })
  const esperado = Buffer.from(`Bearer ${process.env.MIDIA_WORKER_SECRET}`), recebido = Buffer.from(req.headers.get("authorization") ?? "")
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return NextResponse.json({ error: "nao_autorizado" }, { status: 401, headers })
  const partes: Uint8Array[] = []
  let tamanho = 0
  const reader = req.body?.getReader()
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        tamanho += value.byteLength
        if (tamanho > 8192) { await reader.cancel(); return NextResponse.json({ error: "corpo_excedido" }, { status: 413, headers }) }
        partes.push(value)
      }
    } finally { reader.releaseLock() }
  }
  const texto = Buffer.concat(partes).toString("utf8")
  let body
  try { body = entrada.parse(JSON.parse(texto)) } catch { return NextResponse.json({ error: "contrato_invalido" }, { status: 400, headers }) }
  try {
    if (body.acao === "reivindicar") return NextResponse.json({ job: await reivindicarConversao(organizacaoId) }, { headers })
    const ok = body.acao === "renovar" ? await renovarConversao(organizacaoId, body)
      : body.acao === "falhar" ? await falharConversao(organizacaoId, body, body.recuperavel)
        : await concluirConversao(organizacaoId, body.resultado)
    return NextResponse.json({ ok }, { status: ok ? 200 : 409, headers })
  } catch { return NextResponse.json({ error: "falha_temporaria" }, { status: 503, headers }) }
}
