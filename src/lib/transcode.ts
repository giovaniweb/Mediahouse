import { workerMidiaAtivo } from "@/lib/midia-worker-config"

// Integração com o worker de transcodificação (HEVC/.mov → MP4 H.264).
// O worker roda separado (Railway/Render) — ver pasta worker-transcode/.
// Se as env vars não estiverem configuradas, tudo vira no-op (degrada gracioso).

// Vídeos .mov/.qt são candidatos a conversão. O worker decide via ffprobe se
// realmente precisa (HEVC → re-encode; H.264 em .mov → remux; senão skip).
import { urlAssinadaDeLeitura, VALIDADE_MAQUINA_SEGUNDOS, BUCKET_PRIVADO } from "@/lib/midia"
import { identificarMidia, videoDaDemanda } from "@/lib/midia-identidade"
import { prisma } from "@/lib/prisma"

type FonteTranscode = { organizacaoId: string; demandaId: string; arquivoId?: string; sourceUrl: string }

/** O chamador já autorizou a operação; aqui confirmamos vínculo e origem antes da rede. */
async function fonteAutorizada(opts: FonteTranscode): Promise<string | null> {
  const identidade = identificarMidia(opts.sourceUrl)
  if (!videoDaDemanda(identidade, opts.organizacaoId, opts.demandaId) || identidade?.provedor !== "supabase") return null
  const vinculado = opts.arquivoId
    ? await prisma.arquivo.findFirst({ where: { id: opts.arquivoId, demandaId: opts.demandaId,
      demanda: { organizacaoId: opts.organizacaoId }, OR: [{ url: opts.sourceUrl }, { originalUrl: opts.sourceUrl }] }, select: { id: true } })
    : await prisma.demanda.findFirst({ where: { id: opts.demandaId, organizacaoId: opts.organizacaoId, linkFinal: opts.sourceUrl }, select: { id: true } })
  if (!vinculado) return null
  if (identidade.bucket === BUCKET_PRIVADO) return urlAssinadaDeLeitura(identidade.objectKey, VALIDADE_MAQUINA_SEGUNDOS)
  return `${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin}/storage/v1/object/public/${identidade.bucket}/${identidade.objectKey}`
}

export function precisaTranscode(url: string | null | undefined): boolean {
  if (!url) return false
  const limpa = url.split("?")[0].toLowerCase()
  return limpa.endsWith(".mov") || limpa.endsWith(".qt")
}

/** Extensões que o navegador toca sem conversão. */
const EXTENSOES_WEB = [".mp4", ".m4v", ".webm", ".ogg", ".ogv"]

/**
 * Igual à anterior, mas pergunta ao arquivo em vez de confiar no nome.
 *
 * A extensão mente: em 16/08/2026 havia 9 vídeos HEVC gravados no Supabase SEM
 * extensão nenhuma. `precisaTranscode` devolvia false para todos, ninguém
 * enfileirava conversão, e eles chegavam ao cliente como quicktime — que o
 * Chrome não reproduz. Ficaram três meses assim.
 *
 * Só vai à rede quando a extensão não decide: `.mov` já é conclusivo, e `.mp4`
 * também. Falha de rede devolve o palpite da extensão, nunca quebra o upload.
 */
export async function precisaTranscodeConferindo(url: string | null | undefined, contexto?: Omit<FonteTranscode, "sourceUrl">): Promise<boolean> {
  if (!url) return false
  const limpa = url.split("?")[0].toLowerCase()
  if (limpa.endsWith(".mov") || limpa.endsWith(".qt")) return true
  if (EXTENSOES_WEB.some((e) => limpa.endsWith(e))) return false

  try {
    // URL do bucket privado não responde a um HEAD anônimo. Assina antes.
    if (!contexto) return false
    const alvo = await fonteAutorizada({ ...contexto, sourceUrl: url })
    if (!alvo) return false
    const r = await fetch(alvo, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(8000) })
    if (!r.ok) return false
    const tipo = r.headers.get("content-type")?.toLowerCase() ?? ""
    return tipo.includes("quicktime") || tipo.includes("x-m4v")
  } catch {
    return false
  }
}

/**
 * Dispara o job no worker. Devolve se foi ACEITO — quem chama precisa saber.
 *
 * Antes devolvia void e falhava em silêncio: sem as variáveis do worker, a
 * função saía pela porta dos fundos e o arquivo ficava marcado "processing"
 * para sempre. Em 16/08/2026 havia 5 arquivos nesse estado e 15 .mov sem
 * conversão nenhuma — e nenhum arquivo jamais em "done". O transcode nunca
 * rodou em produção, e nada no sistema dizia isso.
 */
export async function enqueueTranscode(opts: FonteTranscode): Promise<boolean> {
  if (workerMidiaAtivo(opts.organizacaoId)) return false
  const worker = process.env.TRANSCODE_WORKER_URL?.replace(/\/$/, "")
  const secret = process.env.TRANSCODE_SECRET
  if (!worker || !secret) {
    console.warn("[transcode] worker NÃO configurado (TRANSCODE_WORKER_URL/TRANSCODE_SECRET) — vídeo .mov segue sem conversão:", opts.demandaId)
    return false
  }
  try {
    const sourceUrl = await fonteAutorizada(opts)
    if (!sourceUrl) return false
    const res = await fetch(`${worker}/transcode`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      // `opts` com a sourceUrl já assinada — o worker baixa direto do Supabase.
      body: JSON.stringify({ ...opts, sourceUrl }),
    })
    console.info("[transcode] enfileirado", opts.demandaId, "→", res.status)
    return res.ok
  } catch (e) {
    console.error("[transcode] falha ao enfileirar:", e instanceof Error ? e.message : e)
    return false
  }
}
