// Usado exclusivamente pelo ensaio: impede fetch acidental para provedores reais.
const original = globalThis.fetch
if (original) globalThis.fetch = (input, init) => {
  const u = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  if (!["127.0.0.1", "[::1]", "localhost"].includes(u.hostname)) throw new Error("ensaio_rede_externa_bloqueada")
  return original(input, init)
}
