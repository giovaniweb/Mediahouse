// Ativação coordenada com a empresa configurada no app. Default preserva o legado.
if (process.env.MIDIA_WORKER_V2_ATIVO !== "sim") {
  await import("./index.mjs")
} else {
  const { consumidorConfigurado } = await import("./consumer.mjs")
  const executar = consumidorConfigurado(), controller = new AbortController()
  const parar = () => controller.abort()
  process.once("SIGTERM", parar); process.once("SIGINT", parar)
  while (!controller.signal.aborted) {
    let intervalo = 30000
    try { const estado = await executar({ signal: controller.signal }); if (estado !== "vazio") console.info("[midia-v2]", estado); if (estado === "concluido") intervalo = 1000 }
    catch { console.error("[midia-v2] falha_temporaria") }
    if (!controller.signal.aborted) await new Promise(resolve => {
      const sair = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", sair); resolve() }
      const timer = setTimeout(sair, intervalo)
      controller.signal.addEventListener("abort", sair, { once: true })
    })
  }
}
