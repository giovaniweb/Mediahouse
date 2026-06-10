// NuFlow — Worker de transcodificação de vídeo (HEVC/.mov → MP4 H.264)
// Sem dependências externas: usa apenas módulos nativos do Node 20 + ffmpeg/ffprobe do sistema.
import http from "node:http"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { readFile, unlink, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

const PORT = process.env.PORT || 8080
const SECRET = process.env.TRANSCODE_SECRET
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "")
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CALLBACK_URL = process.env.NUFLOW_CALLBACK_URL

function log(...a) { console.log(new Date().toISOString(), ...a) }

// Roda um comando e resolve com stdout; rejeita se exit != 0.
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args)
    let out = "", err = ""
    p.stdout.on("data", (d) => (out += d))
    p.stderr.on("data", (d) => (err += d))
    p.on("error", reject)
    p.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} exit ${code}: ${err.slice(-500)}`)))
    )
  })
}

// Extrai o object path depois de "/uploads/" e gera o novo nome _h264.mp4
function novoObjectPath(sourceUrl) {
  const semQuery = sourceUrl.split("?")[0]
  const idx = semQuery.indexOf("/uploads/")
  if (idx === -1) throw new Error("URL não é do bucket 'uploads'")
  const objPath = semQuery.slice(idx + "/uploads/".length) // ex: videos/<id>/final/<ts>.mov
  return objPath.replace(/\.[^./]+$/, "") + "_h264.mp4"
}

async function baixar(url, destino) {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`download falhou: HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destino))
}

async function codecDeVideo(arquivo) {
  // retorna ex: "hevc", "h264", "vp9"...
  const out = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=codec_name",
    "-of", "default=nw=1:nk=1", arquivo,
  ])
  return out.split("\n")[0].trim().toLowerCase()
}

async function uploadSupabase(localPath, objectPath) {
  const buf = await readFile(localPath)
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/uploads/${objectPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "video/mp4",
      "x-upsert": "true",
    },
    body: buf,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw new Error(`upload Supabase HTTP ${res.status}: ${t.slice(0, 300)}`)
  }
  return `${SUPABASE_URL}/storage/v1/object/public/uploads/${objectPath}`
}

async function callback(payload) {
  if (!CALLBACK_URL) { log("⚠️ NUFLOW_CALLBACK_URL ausente — pulando callback"); return }
  try {
    const res = await fetch(CALLBACK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    log("callback →", res.status, JSON.stringify(payload))
  } catch (e) {
    log("❌ callback falhou:", e.message)
  }
}

async function processar({ arquivoId, demandaId, sourceUrl }) {
  const id = randomUUID().slice(0, 8)
  const ext = (sourceUrl.split("?")[0].split(".").pop() || "mov").toLowerCase()
  const input = join(tmpdir(), `in_${id}.${ext}`)
  const output = join(tmpdir(), `out_${id}.mp4`)
  const limpar = async () => { for (const f of [input, output]) await unlink(f).catch(() => {}) }

  try {
    log(`[${id}] baixando ${sourceUrl}`)
    await baixar(sourceUrl, input)
    const codec = await codecDeVideo(input)
    const ehMov = ext === "mov" || ext === "qt"
    log(`[${id}] codec=${codec} ext=${ext}`)

    if (codec === "hevc" || codec === "h265") {
      // Re-encoda HEVC → H.264 (yuv420p p/ compatibilidade total, inclusive iPhone 10-bit)
      log(`[${id}] re-encodando HEVC → H.264`)
      await run("ffmpeg", [
        "-y", "-i", input,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart", output,
      ])
    } else if (codec === "h264" && ehMov) {
      // H.264 dentro de .mov: só reembala pra MP4 (rápido, sem perda)
      log(`[${id}] remux H.264 .mov → .mp4`)
      await run("ffmpeg", ["-y", "-i", input, "-c", "copy", "-movflags", "+faststart", output])
    } else {
      // Já é web-friendly (mp4 h264, webm, etc.) — nada a fazer
      log(`[${id}] skip (codec=${codec})`)
      await callback({ arquivoId, demandaId, status: "skipped" })
      await limpar()
      return
    }

    const objectPath = novoObjectPath(sourceUrl)
    const mp4Url = await uploadSupabase(output, objectPath)
    const tamanho = (await stat(output)).size
    log(`[${id}] ✅ pronto: ${mp4Url} (${(tamanho / 1024 / 1024).toFixed(1)} MB)`)
    await callback({ arquivoId, demandaId, status: "done", mp4Url })
  } catch (e) {
    log(`[${id}] ❌ erro:`, e.message)
    await callback({ arquivoId, demandaId, status: "failed", error: e.message })
  } finally {
    await limpar()
  }
}

function lerBody(req) {
  return new Promise((resolve) => {
    let data = ""
    req.on("data", (c) => (data += c))
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")) } catch { resolve({}) } })
  })
}

const server = http.createServer(async (req, res) => {
  const send = (status, obj) => {
    res.writeHead(status, { "Content-Type": "application/json" })
    res.end(JSON.stringify(obj))
  }

  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true })

  if (req.method === "POST" && req.url === "/transcode") {
    const auth = req.headers.authorization || ""
    if (!SECRET || auth !== `Bearer ${SECRET}`) return send(401, { error: "não autorizado" })

    const body = await lerBody(req)
    const { arquivoId, demandaId, sourceUrl } = body
    if (!sourceUrl) return send(400, { error: "sourceUrl obrigatório" })

    // Responde já e processa em background (evita timeout HTTP)
    send(202, { ok: true, accepted: true })
    processar({ arquivoId, demandaId, sourceUrl })
    return
  }

  send(404, { error: "rota não encontrada" })
})

server.listen(PORT, () => log(`🎬 worker de transcodificação ouvindo na porta ${PORT}`))
