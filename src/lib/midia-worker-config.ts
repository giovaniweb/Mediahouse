/** Ativação coordenada por empresa-piloto; permanece desligada por padrão. */
export function workerMidiaAtivo(organizacaoId: string) {
  return !!organizacaoId && process.env.MIDIA_WORKER_V2_ATIVO === "sim" && !!process.env.MIDIA_WORKER_SECRET &&
    process.env.MIDIA_WORKER_ORGANIZACAO_ID === organizacaoId
}
