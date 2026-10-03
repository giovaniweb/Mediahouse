import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

export const LIMITE_COPIA_DRIVE = 100 * 1024 * 1024
export class ErroCopiaDrive extends Error {
  constructor(public codigo: string, public recuperavel = false) { super(codigo) }
}
export type ProvaDrive = { sha256: string; md5: string; tamanho: number }
type Metadados = { id: string; size?: string; md5Checksum?: string; version?: string; parents?: string[]; trashed?: boolean; appProperties?: Record<string,string>; mimeType?: string; capabilities?: { canAddChildren?: boolean } }
const API = "https://www.googleapis.com/drive/v3/files"
const idValido = (id: string) => /^[a-zA-Z0-9_-]{1,200}$/.test(id)
function falhaHttp(status: number): never {
  throw new ErroCopiaDrive(status === 401 ? "reconectar_google" : status === 403 ? "permissao_google" : `google_http_${status}`, status === 429 || status >= 500)
}
/** Nunca lê corpo de erro: respostas podem conter credenciais e URLs de sessão. */
async function requisitar(url: string, init: RequestInit, signal: AbortSignal) {
  const r = await fetch(url, { ...init, signal, redirect: "error" })
  if (!r.ok) { await r.body?.cancel(); falhaHttp(r.status) }
  return r
}
export async function tokenCopiaDrive(refreshToken: string, signal: AbortSignal) {
  const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new ErroCopiaDrive("oauth_nao_configurado")
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", redirect: "error", signal,
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) })
  if (r.status === 400 || r.status === 401) { await r.body?.cancel(); throw new ErroCopiaDrive("reconectar_google") }
  if (!r.ok) { await r.body?.cancel(); falhaHttp(r.status) }
  const data = await r.json()
  if (typeof data.access_token !== "string" || !data.access_token) throw new ErroCopiaDrive("resposta_google_invalida")
  return data.access_token as string
}
export function sessaoDriveValida(valor: string, fileId: string) {
  try {
    const u = new URL(valor)
    return u.protocol === "https:" && u.host === "www.googleapis.com" && !u.username && !u.password && !u.hash &&
      u.pathname === `/upload/drive/v3/files/${fileId}` && !!u.searchParams.get("upload_id")
  } catch { return false }
}
/** Arquivo temporário privado, limite real de bytes e checksum da origem antes de qualquer escrita remota. */
export async function baixarOriginalDrive(url: string, signal: AbortSignal) {
  const dir = await mkdtemp(join(tmpdir(), "flow-drive-")), path = join(dir, "original")
  const limpar = () => rm(dir, { recursive: true, force: true })
  try {
    const r = await fetch(url, { signal, redirect: "error" })
    if (!r.ok) {
      await r.body?.cancel()
      // Uma assinatura do Storage expirada não é revogação da conta Google.
      throw new ErroCopiaDrive(`origem_http_${r.status}`, [401,403,429].includes(r.status) || r.status >= 500)
    }
    if (!r.body) throw new ErroCopiaDrive("origem_vazia")
    if (Number(r.headers.get("content-length")) > LIMITE_COPIA_DRIVE) { await r.body.cancel(); throw new ErroCopiaDrive("original_acima_100_mib") }
    const sha = createHash("sha256"), md5 = createHash("md5"); let tamanho = 0
    const medir = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      tamanho += chunk.length
      if (tamanho > LIMITE_COPIA_DRIVE) return callback(new ErroCopiaDrive("original_acima_100_mib"))
      sha.update(chunk); md5.update(chunk); callback(null, chunk)
    } })
    await pipeline(Readable.fromWeb(r.body as import("node:stream/web").ReadableStream), medir, createWriteStream(path, { mode: 0o600 }), { signal })
    if (!tamanho) throw new ErroCopiaDrive("origem_vazia")
    return { path, limpar, prova: { sha256: sha.digest("hex"), md5: md5.digest("hex"), tamanho } }
  } catch (e) { await limpar(); throw e }
}
export function provedorCopiaDrive(token: string, signal: AbortSignal) {
  const headers = { Authorization: `Bearer ${token}` }
  async function metadados(id: string): Promise<Metadados | null> {
    if (!idValido(id)) throw new ErroCopiaDrive("id_google_invalido")
    const r = await fetch(`${API}/${id}?fields=id,size,md5Checksum,version,parents,trashed,appProperties,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`, { headers, signal, redirect: "error" })
    if (r.status === 404) { await r.body?.cancel(); return null }
    if (!r.ok) { await r.body?.cancel(); falhaHttp(r.status) }
    return r.json()
  }
  function verificar(m: Metadados, id: string, pasta: string, chave: string) {
    if (m.id !== id || m.trashed || !m.parents?.includes(pasta) || m.appProperties?.flowCopyKey !== chave)
      throw new ErroCopiaDrive("destino_alterado")
  }
  return {
    async validarPasta(id: string) {
      const m = await metadados(id)
      if (!m || m.trashed || m.mimeType !== "application/vnd.google-apps.folder" || !m.capabilities?.canAddChildren)
        throw new ErroCopiaDrive("pasta_indisponivel")
    },
    async gerarId() {
      const r = await requisitar(`${API}/generateIds?count=1&space=drive&type=files`, { headers }, signal)
      const id = (await r.json()).ids?.[0]
      if (typeof id !== "string" || !idValido(id)) throw new ErroCopiaDrive("id_google_invalido")
      return id
    },
    async copiar(p: { id: string; pasta: string; chave: string; nome: string; path: string; prova: ProvaDrive; antesDeEscrever: () => Promise<void> }) {
      let m = await metadados(p.id)
      if (!m) {
        await p.antesDeEscrever()
        const r = await fetch(`${API}?supportsAllDrives=true`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, signal, redirect: "error",
          body: JSON.stringify({ id: p.id, name: p.nome, parents: [p.pasta], mimeType: "application/octet-stream", appProperties: { flowCopyKey: p.chave } }) })
        if (!r.ok && r.status !== 409) { await r.body?.cancel(); falhaHttp(r.status) }
        await r.body?.cancel()
        m = await metadados(p.id)
      }
      if (!m) throw new ErroCopiaDrive("destino_nao_confirmado", true)
      verificar(m,p.id,p.pasta,p.chave)
      // Upload anterior pode ter concluído antes da queda do worker. Reconciliar sem reenviar.
      if (m.md5Checksum !== p.prova.md5 || Number(m.size) !== p.prova.tamanho) {
        // Não sobrescrever conteúdo alterado externamente nem uma cópia de outra origem.
        if (Number(m.size) > 0) throw new ErroCopiaDrive("conteudo_destino_divergente")
        await p.antesDeEscrever()
        const r = await requisitar(`https://www.googleapis.com/upload/drive/v3/files/${p.id}?uploadType=resumable&supportsAllDrives=true`, {
          method: "PATCH", headers: { ...headers, "Content-Type": "application/json", "X-Upload-Content-Type": "application/octet-stream", "X-Upload-Content-Length": String(p.prova.tamanho) }, body: "{}",
        }, signal)
        const sessao = r.headers.get("location"); await r.body?.cancel()
        if (!sessao || !sessaoDriveValida(sessao,p.id)) throw new ErroCopiaDrive("sessao_google_invalida")
        await p.antesDeEscrever()
        const stream = createReadStream(p.path)
        try {
          const upload = await requisitar(sessao, { method: "PUT", headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(p.prova.tamanho), "Content-Range": `bytes 0-${p.prova.tamanho-1}/${p.prova.tamanho}` },
            body: Readable.toWeb(stream) as ReadableStream, duplex: "half",
          } as RequestInit, signal)
          await upload.body?.cancel()
        } finally { stream.destroy() }
        m = await metadados(p.id)
      }
      if (!m) throw new ErroCopiaDrive("destino_nao_confirmado", true)
      verificar(m,p.id,p.pasta,p.chave)
      if (m.md5Checksum !== p.prova.md5 || Number(m.size) !== p.prova.tamanho || !m.version) throw new ErroCopiaDrive("checksum_destino_divergente")
      return { version: m.version }
    },
  }
}
