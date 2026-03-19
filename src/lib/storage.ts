/**
 * Supabase Storage — upload de arquivos recebidos via WhatsApp
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js"

let _supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

const BUCKET = "whatsapp-media"

/**
 * Garante que o bucket existe (cria se não existir)
 */
async function ensureBucket() {
  const sb = getSupabase()
  const { data } = await sb.storage.getBucket(BUCKET)
  if (!data) {
    await sb.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024, // 50MB
    })
  }
}

/**
 * Faz upload de um buffer para o Supabase Storage
 * @returns URL pública do arquivo
 */
export async function uploadMedia(
  buffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string | null> {
  try {
    await ensureBucket()

    const sb = getSupabase()
    const path = `${Date.now()}-${fileName}`

    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      })

    if (error) {
      console.error("[Storage] Erro no upload:", error)
      return null
    }

    const { data: urlData } = sb.storage
      .from(BUCKET)
      .getPublicUrl(path)

    console.log(`[Storage] Upload OK: ${path} (${contentType})`)
    return urlData.publicUrl
  } catch (e) {
    console.error("[Storage] Erro:", e)
    return null
  }
}

/**
 * Baixa mídia da Evolution API via base64
 */
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
