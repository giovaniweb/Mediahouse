/**
 * Transcrição de áudio via OpenAI Whisper API
 */

import OpenAI from "openai"

let _openai: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _openai
}

/**
 * Transcreve um buffer de áudio usando Whisper
 * @returns Texto transcrito ou null em caso de erro
 */
export async function transcreverAudio(
  buffer: Buffer,
  fileName: string = "audio.ogg",
  language: string = "pt"
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[Transcription] OPENAI_API_KEY não configurada")
    return null
  }

  try {
    const uint8 = new Uint8Array(buffer)
    const blob = new Blob([uint8], {
      type: fileName.endsWith(".ogg") ? "audio/ogg" : "audio/mpeg",
    })
    const file = new File([blob], fileName, { type: blob.type })

    const response = await getOpenAI().audio.transcriptions.create({
      model: "whisper-1",
      file,
      language,
      response_format: "text",
    })

    const texto = typeof response === "string" ? response : (response as unknown as { text: string }).text
    console.log(`[Transcription] Áudio transcrito (${buffer.length} bytes): "${texto?.slice(0, 100)}..."`)
    return texto || null
  } catch (e) {
    console.error("[Transcription] Erro:", e)
    return null
  }
}
