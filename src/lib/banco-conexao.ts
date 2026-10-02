/** Com isolamento ativo, cada papel precisa de conexão explícita. Nunca herdar a de dono. */
export function conexaoBanco(tipo: "app" | "auth" | "admin", env: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  const chave = { app: "DATABASE_URL", auth: "AUTH_DATABASE_URL", admin: "ADMIN_DATABASE_URL" }[tipo]
  if (env.RLS_ATIVO === "sim") {
    if (!env[chave]?.trim()) throw new Error(`${chave} obrigatória quando RLS_ATIVO=sim`)
    return env[chave]
  }
  return tipo === "app" ? env.DATABASE_URL : tipo === "auth"
    ? env.AUTH_DATABASE_URL || env.DATABASE_URL
    : env.ADMIN_DATABASE_URL || env.DIRECT_URL || env.DATABASE_URL
}
