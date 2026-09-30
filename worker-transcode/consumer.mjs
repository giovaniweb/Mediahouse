import { mkdir, readdir, readFile, rename, unlink, open } from "node:fs/promises"
import { join, isAbsolute } from "node:path"
import { criarConversor } from "./converter.mjs"
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const idSeguro = s => typeof s === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(s)

/** API de controle fixa, sem redirects. Segredo nunca vai ao storage ou ao log. */
export function criarApi({ apiUrl, secret }) {
  const u = new URL(apiUrl)
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || u.pathname !== "/api/transcode/worker" || !secret) throw new Error("configuracao_invalida")
  return async body => {
    const r = await fetch(u.href, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    if (r.status === 409) return { ok: false }
    if (!r.ok) throw new Error("api_indisponivel")
    return r.json()
  }
}

/** `api`/`converter` injetáveis só para ensaio local. Loop externo chama executarUma sequencialmente. */
export function criarConsumidor({ api, converter, stateDir, renewMs = 20000, retryMs = 1000 }) {
  let ocupado = false
  async function arquivoRecibo(r) {
    if (!idSeguro(r.jobId) || !idSeguro(r.leaseToken)) throw new Error("recibo_invalido")
    return join(stateDir, `${r.jobId}-${r.leaseToken}.json`)
  }
  async function salvar(r) {
    const path = await arquivoRecibo(r), temp = `${path}.tmp`
    const f = await open(temp, "w", 0o600)
    try { await f.writeFile(JSON.stringify(r)); await f.sync() } finally { await f.close() }
    await rename(temp, path)
    return path
  }
  async function confirmar(r, path) {
    for (let i = 0; i < 3; i++) {
      try {
        const resposta = await api({ acao: "concluir", resultado: r })
        // 409 significa tentativa obsoleta: nunca promover a saída nem repetir callback indefinidamente.
        await unlink(path)
        return resposta.ok ? "concluido" : "obsoleto"
      } catch { if (i < 2) await pause(retryMs) }
    }
    return "confirmacao_pendente" // mantém recibo; não repete conversão
  }
  async function recuperar() {
    for (const name of (await readdir(stateDir)).filter(n => /^[a-zA-Z0-9_-]+\.json$/.test(n)).sort().slice(0, 100)) {
      const path = join(stateDir, name), texto = await readFile(path, "utf8")
      if (Buffer.byteLength(texto) > 8192) throw new Error("recibo_invalido")
      const r = JSON.parse(texto)
      if (await arquivoRecibo(r) !== path) throw new Error("recibo_invalido")
      if (await confirmar(r, path) === "confirmacao_pendente") return false
    }
    return !(await readdir(stateDir)).some(n => n.endsWith(".json"))
  }
  return async function executarUma({ signal = new AbortController().signal } = {}) {
    if (ocupado) return "ocupado"
    ocupado = true
    let timer, renovando, control
    try {
      await mkdir(stateDir, { recursive: true, mode: 0o700 })
      if (!await recuperar()) return "confirmacao_pendente"
      if (signal.aborted) return "cancelado"
      const { job } = await api({ acao: "reivindicar" })
      if (!job) return "vazio"
      control = new AbortController()
      const combinado = AbortSignal.any([signal, control.signal])
      const renovar = () => {
        renovando = (async () => {
          try { if (!(await api({ acao: "renovar", jobId: job.jobId, leaseToken: job.leaseToken })).ok) control.abort() }
          catch { control.abort() } // falha fechada, em vez de continuar com lease incerto
          if (!combinado.aborted) timer = setTimeout(renovar, renewMs)
        })()
      }
      timer = setTimeout(renovar, renewMs)
      try {
        const resultado = await converter(job, { signal: combinado })
        const { jobId, leaseToken, fonteVersao, perfil, objectKey, sha256, tamanho, mime, codec, codecAudio, largura, altura, duracao } = resultado
        const r = { jobId, leaseToken, fonteVersao, perfil, objectKey, sha256, tamanho, mime, codec, codecAudio, largura, altura, duracao }
        const path = await salvar(r)
        return await confirmar(r, path)
      } catch (e) {
        if (!combinado.aborted) {
          const permanentes = ["contrato_invalido", "fonte_invalida", "url_nao_autorizada", "checksum_divergente", "midia_invalida", "duracao_excedida", "tamanho_excedido", "dimensao_excedida", "codec_nao_suportado", "preview_invalida", "saida_excedida", "proporcao_nao_suportada", "rotacao_nao_suportada"]
          await api({ acao: "falhar", jobId: job.jobId, leaseToken: job.leaseToken, recuperavel: !permanentes.includes(e.codigo) }).catch(() => {})
        }
        return combinado.aborted ? "cancelado" : "falhou"
      }
    } finally {
      control?.abort(); clearTimeout(timer)
      await renovando?.catch(() => {})
      clearTimeout(timer); ocupado = false
    }
  }
}
export function consumidorConfigurado(env = process.env) {
  if (!env.MIDIA_WORKER_STATE_DIR || !isAbsolute(env.MIDIA_WORKER_STATE_DIR)) throw new Error("diretorio_de_recibos_obrigatorio")
  try {
    const storage = new URL(env.SUPABASE_URL)
    if (storage.protocol !== "https:" || storage.username || storage.password || storage.pathname !== "/" || storage.search || storage.hash) throw new Error()
  } catch { throw new Error("storage_invalido") }
  return criarConsumidor({ api: criarApi({ apiUrl: env.MIDIA_WORKER_API_URL, secret: env.MIDIA_WORKER_SECRET }),
    converter: criarConversor({ storageOrigin: env.SUPABASE_URL }), stateDir: env.MIDIA_WORKER_STATE_DIR })
}
