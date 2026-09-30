// Motor v2: recebe referências assinadas emitidas pelo servidor após validar o lease.
// Não é servidor HTTP nem fila em memória. O consumidor durável deve renovar o lease
// e abortar este motor ao perdê-lo; ativação depende do contrato M02 de callback.
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

export const PERFIL = "h264-720p-v1"
export const LIMITES = Object.freeze({ bytes: 100 * 1024 * 1024, segundos: 600, dimensao: 8192, pixels: 33_554_432 })
export class ErroConversao extends Error {
  constructor(codigo) { super(codigo); this.name = "ErroConversao"; this.codigo = codigo }
}
const erro = codigo => { throw new ErroConversao(codigo) }
const segmento = s => typeof s === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(s)
const partesSeguras = key => typeof key === "string" && key.split("/").every(s => /^[a-zA-Z0-9_.-]+$/.test(s) && s !== "." && s !== "..")

export function chavePreview(j) {
  if (![j.organizacaoId, j.demandaId, j.arquivoId, j.jobId, j.leaseToken].every(segmento) ||
    !Number.isSafeInteger(j.fonteVersao) || j.fonteVersao < 1 || j.perfil !== PERFIL) erro("contrato_invalido")
  // Um objeto por tentativa: um worker obsoleto nunca sobrescreve outra saída.
  return `org/${j.organizacaoId}/videos/${j.demandaId}/previews/${j.arquivoId}/${j.fonteVersao}/${PERFIL}/${j.jobId}-${j.leaseToken}.mp4`
}

function urlStorage(valor, origem, caminho) {
  try {
    if (typeof valor !== "string" || /[\\\s]/.test(valor) || valor.split("?")[0].includes("%") || /\/\.{1,2}(?:\/|$)/.test(valor)) erro("url_nao_autorizada")
    const u = new URL(valor)
    if (u.origin !== origem || u.username || u.password || u.hash || u.pathname !== caminho) erro("url_nao_autorizada")
    return u.href
  } catch { erro("url_nao_autorizada") }
}

export function validarContrato(j, config) {
  const destino = chavePreview(j)
  const origem = new URL(config.storageOrigin)
  const local = config.permitirHttpLocal === true && origem.protocol === "http:" && origem.hostname === "127.0.0.1"
  if ((!local && origem.protocol !== "https:") || origem.username || origem.password || origem.pathname !== "/" || origem.search || origem.hash) erro("storage_invalido")
  if (!["midia", "uploads"].includes(j.bucket) || !partesSeguras(j.objectKey)) erro("fonte_invalida")
  const p = j.objectKey.split("/")
  if (j.bucket === "midia" ? p[0] !== "org" || p[1] !== j.organizacaoId || p[2] !== "videos" || p[3] !== j.demandaId || p.length < 5
    : p[0] !== "videos" || p[1] !== j.demandaId || p.length < 3) erro("fonte_invalida")
  const sourceUrl = urlStorage(j.sourceUrl, origem.origin, `/storage/v1/object/${j.bucket === "midia" ? "sign" : "public"}/${j.bucket}/${j.objectKey}`)
  const uploadUrl = urlStorage(j.uploadUrl, origem.origin, `/storage/v1/object/upload/sign/midia/${destino}`)
  if (j.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(j.sha256)) erro("checksum_invalido")
  return { sourceUrl, uploadUrl, destino }
}

async function executar(bin, args, signal, timeoutMs) {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    let stdout = "", tamanho = 0, limite = false, expirou = false
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "ignore"], signal, killSignal: "SIGKILL" })
    const timer = setTimeout(() => { expirou = true; child.kill("SIGKILL") }, timeoutMs)
    // Em aborto, aguarda close (processo terminou) antes de limpar o diretório.
    child.on("error", () => {})
    child.stdout.on("data", chunk => {
      tamanho += chunk.length
      if (tamanho > 1024 * 1024) { limite = true; child.kill("SIGKILL") }
      else stdout += chunk.toString()
    })
    child.on("close", code => {
      clearTimeout(timer)
      if (signal.aborted) return reject(new ErroConversao("cancelado"))
      if (expirou || limite || code !== 0) return reject(new ErroConversao(expirou ? "processamento_timeout" : "midia_invalida"))
      resolve(stdout)
    })
  })
}
const INPUT_SEGURO = ["-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,avi,ogg"]
async function inspecionar(path, signal) {
  let json
  try { json = JSON.parse(await executar("ffprobe", ["-v", "error", ...INPUT_SEGURO, "-show_streams", "-show_format", "-of", "json", path], signal, 30_000)) }
  catch (e) { if (e instanceof ErroConversao) throw e; erro("midia_invalida") }
  const video = json.streams?.find(s => s.codec_type === "video" && !s.disposition?.attached_pic)
  const audio = json.streams?.find(s => s.codec_type === "audio")
  const duracao = Number(json.format?.duration)
  if (!video || !Number.isFinite(duracao) || duracao <= 0) erro("midia_invalida")
  if (duracao > LIMITES.segundos) erro("duracao_excedida")
  if (![video.width, video.height].every(n => Number.isInteger(n) && n >= 2 && n <= LIMITES.dimensao) || video.width * video.height > LIMITES.pixels) erro("dimensao_excedida")
  if (video.sample_aspect_ratio && !["1:1", "0:1", "N/A"].includes(video.sample_aspect_ratio)) erro("proporcao_nao_suportada")
  if (!["h264", "hevc", "vp8", "vp9", "av1", "mpeg4", "mjpeg", "theora"].includes(video.codec_name)) erro("codec_nao_suportado")
  const rotacao = Number(video.side_data_list?.find(d => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0)
  if (!Number.isFinite(rotacao) || rotacao % 90 !== 0) erro("rotacao_nao_suportada")
  return { video, audio, duracao, largura: Math.abs(rotacao % 180) === 90 ? video.height : video.width, altura: Math.abs(rotacao % 180) === 90 ? video.width : video.height }
}
async function baixar(url, path, signal) {
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) })
  if (!res.ok || !res.body) erro("storage_indisponivel")
  if (Number(res.headers.get("content-length")) > LIMITES.bytes) { await res.body.cancel(); erro("tamanho_excedido") }
  let tamanho = 0
  const hash = createHash("sha256")
  await pipeline(Readable.fromWeb(res.body), new Transform({ transform(chunk, _enc, cb) {
    tamanho += chunk.length
    if (tamanho > LIMITES.bytes) return cb(new ErroConversao("tamanho_excedido"))
    hash.update(chunk); cb(null, chunk)
  } }), createWriteStream(path, { flags: "wx" }), { signal })
  if (!tamanho) erro("midia_invalida")
  return { tamanho, sha256: hash.digest("hex") }
}
async function hashArquivo(path) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

/** Uma conversão por instância. Ocupação não é aceite durável; o consumidor deve tentar depois. */
export function criarConversor(config) {
  let ocupado = false
  return async function converter(job, { signal = new AbortController().signal } = {}) {
    if (ocupado) erro("worker_ocupado")
    const contrato = validarContrato(job, config)
    signal.throwIfAborted()
    ocupado = true
    let dir
    const inicio = Date.now()
    try {
      dir = await mkdtemp(join(config.tempRoot ?? tmpdir(), "nuflow-preview-"))
      const input = join(dir, "original.bin"), output = join(dir, "preview.mp4")
      const fonte = await baixar(contrato.sourceUrl, input, signal)
      if (job.sha256 && job.sha256 !== fonte.sha256) erro("checksum_divergente")
      const original = await inspecionar(input, signal)
      await executar("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", "2", ...INPUT_SEGURO, "-i", input,
        "-map", `0:${original.video.index}`, ...(original.audio ? ["-map", `0:${original.audio.index}`] : []),
        "-map_metadata", "-1", "-map_chapters", "-1", "-sn", "-dn",
        "-vf", "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-fs", String(LIMITES.bytes + 1), output], signal, 15 * 60_000)
      const tamanho = (await stat(output)).size
      if (tamanho > LIMITES.bytes) erro("saida_excedida")
      const previa = await inspecionar(output, signal)
      if (previa.video.codec_name !== "h264" || (previa.audio && previa.audio.codec_name !== "aac") ||
        (!!previa.audio !== !!original.audio) || previa.largura > 1280 || previa.altura > 1280 ||
        previa.largura > original.largura || previa.altura > original.altura ||
        Math.abs(previa.duracao - original.duracao) > Math.max(0.5, original.duracao * 0.03) ||
        Math.abs(previa.largura / previa.altura - original.largura / original.altura) > 0.02) erro("preview_invalida")
      const sha256 = await hashArquivo(output)
      signal.throwIfAborted()
      const corpo = createReadStream(output)
      try {
        const r = await fetch(contrato.uploadUrl, { method: "PUT", redirect: "error", duplex: "half",
          headers: { "Content-Type": "video/mp4", "Content-Length": String(tamanho) }, body: corpo,
          signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) })
        if (!r.ok) { await r.body?.cancel(); erro("storage_indisponivel") }
        await r.body?.cancel()
      } finally { corpo.destroy() }
      signal.throwIfAborted()
      return { jobId: job.jobId, leaseToken: job.leaseToken, fonteVersao: job.fonteVersao, perfil: PERFIL,
        bucket: "midia", objectKey: contrato.destino, tamanho, sha256, mime: "video/mp4", codec: "h264", codecAudio: previa.audio ? "aac" : null,
        largura: previa.largura, altura: previa.altura, duracao: previa.duracao, fonte, tempoMs: Date.now() - inicio }
    } catch (e) {
      if (signal.aborted) erro("cancelado")
      if (e instanceof ErroConversao) throw e
      erro("falha_processamento") // Nunca devolve URL assinada, stderr ou segredo.
    } finally {
      try { if (dir) await rm(dir, { recursive: true, force: true }) } catch { erro("falha_limpeza") } finally { ocupado = false }
    }
  }
}
