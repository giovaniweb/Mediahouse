/** Não há fallback para DATABASE_URL ou arquivos .env. */
export function validarBancoTeste(valor) {
  if (!valor) throw new Error("Defina DATABASE_URL_TEST explicitamente para o Postgres descartável local.")
  const url = new URL(valor)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || !url.port
      || !/^\/nuflow_test(?:_[a-z0-9]+)?$/.test(url.pathname)
      || url.search || url.hash) {
    throw new Error("Banco de teste recusado: use IP loopback, porta explícita e banco nuflow_test (sem parâmetros).")
  }
  return url.toString()
}
