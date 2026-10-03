import { createClient } from "@supabase/supabase-js"
export function criarListadorStorage({ origem, key, organizacaoId, signal = undefined, permitirHttpLocal = false, fetchImpl = fetch }) {
  const u = new URL(origem)
  const local = permitirHttpLocal && u.protocol === "http:" && u.hostname === "127.0.0.1"
  if ((!local && u.protocol !== "https:") || u.username || u.password || u.pathname !== "/" || u.search || u.hash || !key || !/^[a-zA-Z0-9_-]{1,128}$/.test(organizacaoId)) throw new Error("configuracao_invalida")
  const cliente = createClient(u.origin, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => {
    if (new URL(url).origin !== u.origin) throw new Error("origem_recusada")
    return fetchImpl(url, { ...init, redirect: "error", signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) })
  } } })
  const raiz = `org/${organizacaoId}/videos`
  return async (prefixo, { offset, limit }) => {
    if (!(prefixo === raiz || prefixo.startsWith(`${raiz}/`)) || prefixo.split("/").some(p => !/^[a-zA-Z0-9_.-]+$/.test(p) || p === "." || p === "..")) throw new Error("prefixo_recusado")
    const { data, error } = await cliente.storage.from("midia").list(prefixo, { offset, limit, sortBy: { column: "name", order: "asc" } })
    if (error) throw new Error("storage_indisponivel")
    return data
  }
}
