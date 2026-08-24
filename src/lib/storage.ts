/**
 * Upload de mídia recebida por WhatsApp e de anexo público.
 *
 * Reescrito em 24/08/2026 para usar o bucket PRIVADO. O código anterior criava
 * um bucket `whatsapp-media` com `public: true` — mais uma porta aberta, além do
 * `uploads`.
 *
 * Vale registrar um bug que veio junto: ele lia `process.env.SUPABASE_URL`, e a
 * variável que existe é `NEXT_PUBLIC_SUPABASE_URL`. O bucket nunca foi criado e
 * este caminho estava quebrado em silêncio — mídia de WhatsApp não era salva.
 * Corrigido aqui de passagem; conferir em produção se o recebimento volta.
 */
import { caminhoMidia, subirArquivo } from "@/lib/midia"

/**
 * Sobe um buffer e devolve a URL do nosso app (`/api/midia/...`).
 *
 * Precisa de `organizacaoId`: sem ele não há como decidir de quem é o arquivo,
 * e o caminho privado é escopado por empresa. Sem organização, não sobe —
 * mesma regra de falha fechada dos outros canais.
 */
export async function uploadMedia(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  organizacaoId?: string | null
): Promise<string | null> {
  if (!organizacaoId) {
    console.error("[storage] uploadMedia sem organização — upload cancelado:", fileName)
    return null
  }
  const ext = fileName.includes(".") ? fileName.split(".").pop()! : "bin"
  const caminho = caminhoMidia({ organizacaoId, tipo: "docs", id: "whatsapp", ext })
  return subirArquivo(caminho, buffer, contentType)
}

/** Baixa a mídia da Evolution API. Inalterada — só mudou onde o arquivo é salvo. */
export async function downloadEvolutionMedia(
  instanceUrl: string,
  instanceId: string,
  apiKey: string,
  messageData: { key: { id: string; remoteJid: string } }
): Promise<{ buffer: Buffer; mimetype: string; fileName: string } | null> {
  try {
    const res = await fetch(
      `${instanceUrl}/chat/getBase64FromMediaMessage/${instanceId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ message: messageData }),
        signal: AbortSignal.timeout(30000),
      }
    )

    if (!res.ok) {
      console.error(`[Storage] Evolution media download falhou: ${res.status}`)
      return null
    }

    const json = await res.json()
    const base64 = json.base64 as string | undefined
    const mimetype = (json.mimetype as string) || "application/octet-stream"

    if (!base64) {
      console.error("[Storage] Sem base64 na resposta")
      return null
    }

    const buffer = Buffer.from(base64, "base64")
    const ext = mimetype.split("/")[1]?.split(";")[0] || "bin"
    const fileName = `wa-${messageData.key.id}.${ext}`

    return { buffer, mimetype, fileName }
  } catch (e) {
    console.error("[Storage] Erro ao baixar mídia:", e)
    return null
  }
}
