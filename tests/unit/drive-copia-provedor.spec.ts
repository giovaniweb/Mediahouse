import { afterEach, expect, it, vi } from "vitest"
import { access, readFile } from "node:fs/promises"
import { baixarOriginalDrive, LIMITE_COPIA_DRIVE, provedorCopiaDrive, sessaoDriveValida } from "@/lib/drive-copia-provedor"
afterEach(() => vi.unstubAllGlobals())
it.each([
  "https://www.googleapis.com.evil.test/upload/drive/v3/files/abc?upload_id=x",
  "http://www.googleapis.com/upload/drive/v3/files/abc?upload_id=x",
  "https://user@www.googleapis.com/upload/drive/v3/files/abc?upload_id=x",
  "https://www.googleapis.com/upload/drive/v3/files/outro?upload_id=x",
  "https://www.googleapis.com/upload/drive/v3/files/abc",
])("recusa sessão fora do destino exato: %s", url => expect(sessaoDriveValida(url,"abc")).toBe(false))
it("aceita sessão HTTPS do mesmo ID", () => expect(sessaoDriveValida("https://www.googleapis.com/upload/drive/v3/files/abc?upload_id=x","abc")).toBe(true))
it("download mede bytes, calcula hashes e oferece limpeza do temporário", async () => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => { expect(init.redirect).toBe("error"); return new Response("abc") }); vi.stubGlobal("fetch",fetch)
  const arquivo = await baixarOriginalDrive("https://storage.test/original",AbortSignal.timeout(1000))
  try { expect(await readFile(arquivo.path,"utf8")).toBe("abc"); expect(arquivo.prova).toEqual({ tamanho: 3, sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", md5: "900150983cd24fb0d6963f7d28e17f72" }) }
  finally { await arquivo.limpar() }
  await expect(access(arquivo.path)).rejects.toThrow()
})
it("recusa arquivo acima do limite declarado sem ler corpo", async () => {
  vi.stubGlobal("fetch",async () => new Response("x",{ headers: { "Content-Length": String(LIMITE_COPIA_DRIVE+1) } }))
  await expect(baixarOriginalDrive("https://storage.test/original",AbortSignal.timeout(1000))).rejects.toThrow("original_acima_100_mib")
})
it("limite de streaming independe de Content-Length", async () => {
  let total = 0
  vi.stubGlobal("fetch",async () => new Response(new ReadableStream({ pull(controller) { if (total++ < 101) controller.enqueue(new Uint8Array(1024*1024)); else controller.close() } })))
  await expect(baixarOriginalDrive("https://storage.test/original",AbortSignal.timeout(5000))).rejects.toThrow("original_acima_100_mib")
})
it("destino alterado não é sobrescrito", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "abc", size: "3", parents: ["outra"], appProperties: { flowCopyKey: "chave" } }))); vi.stubGlobal("fetch",fetch)
  await expect(provedorCopiaDrive("token",AbortSignal.timeout(1000)).copiar({ id: "abc", pasta: "pasta", chave: "chave", nome: "original", path: "nao-ler", prova: { tamanho: 3, md5: "hash", sha256: "sha" }, antesDeEscrever: async () => {} })).rejects.toThrow("destino_alterado")
  expect(fetch).toHaveBeenCalledTimes(1)
})
it("recusa sessão redirecionada sem enviar conteúdo ou token", async () => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => init.method === "PATCH" ? new Response(null,{ headers: { Location: "https://evil.test/upload?upload_id=x" } }) : new Response(JSON.stringify({ id: "abc", size: "0", parents: ["pasta"], appProperties: { flowCopyKey: "chave" } })))
  vi.stubGlobal("fetch",fetch)
  await expect(provedorCopiaDrive("token",AbortSignal.timeout(1000)).copiar({ id: "abc", pasta: "pasta", chave: "chave", nome: "original", path: "nao-ler", prova: { tamanho: 3, md5: "hash", sha256: "sha" }, antesDeEscrever: async () => {} })).rejects.toThrow("sessao_google_invalida")
  expect(fetch).toHaveBeenCalledTimes(2)
})

it.each([403,404])("falha %s da origem não acusa revogação do Google", async status => {
  vi.stubGlobal("fetch",async () => new Response("erro privado",{ status }))
  await expect(baixarOriginalDrive("https://storage.test/original",AbortSignal.timeout(1000))).rejects.toMatchObject({ codigo: `origem_http_${status}`, recuperavel: status === 403 })
})
