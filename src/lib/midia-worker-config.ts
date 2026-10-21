/**
 * Conversor de vídeo v2 ligado na plataforma (worker do Railway + esta app).
 *
 * Até a Onda 2A (21/10/2026) valia para UMA empresa, escolhida por
 * MIDIA_WORKER_ORGANIZACAO_ID. Agora vale para todas: cada job carrega a
 * própria empresa, e quem decide se ela converte é o módulo "conversao" e a
 * franquia de armazenamento dela (src/lib/midia-worker.ts). A variável da
 * empresa deixou de ser lida.
 */
export function workerMidiaLigado() {
  return process.env.MIDIA_WORKER_V2_ATIVO === "sim" && !!process.env.MIDIA_WORKER_SECRET
}

/** A conversão desta empresa é da fila v2 (e não do caminho legado)? */
export function workerMidiaAtivo(organizacaoId: string) {
  return !!organizacaoId && workerMidiaLigado()
}
