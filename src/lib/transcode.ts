// Integração com o worker de transcodificação (HEVC/.mov → MP4 H.264).
// O worker roda separado (Railway/Render) — ver pasta worker-transcode/.
// Se as env vars não estiverem configuradas, tudo vira no-op (degrada gracioso).

// Vídeos .mov/.qt são candidatos a conversão. O worker decide via ffprobe se
// realmente precisa (HEVC → re-encode; H.264 em .mov → remux; senão skip).
export function precisaTranscode(url: string | null | undefined): boolean {
  if (!url) return false
  const limpa = url.split("?")[0].toLowerCase()
  return limpa.endsWith(".mov") || limpa.endsWith(".qt")
}

// Dispara o job no worker (fire-and-forget). Não lança — falha silenciosa.
export async function enqueueTranscode(opts: {
  arquivoId?: string
  demandaId: string
  sourceUrl: string
}): Promise<void> {
  const worker = process.env.TRANSCODE_WORKER_URL?.replace(/\/$/, "")
  const secret = process.env.TRANSCODE_SECRET
  if (!worker || !secret) {
    console.info("[transcode] worker não configurado — pulando", opts.demandaId)
    return
  }
  try {
    const res = await fetch(`${worker}/transcode`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    })
    console.info("[transcode] enfileirado", opts.demandaId, "→", res.status)
  } catch (e) {
    console.error("[transcode] falha ao enfileirar:", e instanceof Error ? e.message : e)
  }
}
