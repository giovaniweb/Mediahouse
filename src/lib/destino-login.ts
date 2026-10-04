// Para onde o login devolve a pessoa (30/09/2026).
//
// Até aqui o login ia sempre para /dashboard, e todo link profundo perdia o
// destino no primeiro acesso: o link de job que chega pelo WhatsApp e a página
// de autorização do Cutflow. O middleware já manda `callbackUrl` para /login;
// faltava o login respeitar.
//
// Só caminho do PRÓPRIO NuFlow: começa com "/", não com "//" nem "/\" (que o
// navegador trata como outro site), sem esquema e sem quebra de linha. Qualquer
// outra coisa vira /dashboard — o login não pode virar porta para mandar alguém
// a um site falso depois de digitar a senha.
export function destinoDoLogin(bruto: unknown): string {
  if (typeof bruto !== "string" || bruto.length > 2000) return "/dashboard"
  if (!bruto.startsWith("/") || bruto.startsWith("//") || bruto.startsWith("/\\")) return "/dashboard"
  if (/[\u0000-\u001f\\]/.test(bruto)) return "/dashboard"
  try {
    const u = new URL(bruto, "https://nuflow.invalid")
    if (u.origin !== "https://nuflow.invalid") return "/dashboard"
    if (u.pathname === "/login" || u.pathname.startsWith("/api/")) return "/dashboard"
    return u.pathname + u.search + u.hash
  } catch {
    return "/dashboard"
  }
}
