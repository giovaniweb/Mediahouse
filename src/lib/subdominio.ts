// A área pública de cada empresa no próprio endereço: <slug>.nuflow.space.
//
// As páginas continuam morando em src/app/c/[slug]; o proxy só traduz o
// endereço. Quem abre contourline.nuflow.space/pedido recebe a página de
// /c/contourline/pedido, e a barra do navegador fica como a pessoa digitou.
//
// Este arquivo roda nos três lugares — proxy (edge), servidor e navegador —,
// então não importa nada de Node nem de banco. O domínio raiz e a chave do
// redirecionamento são NEXT_PUBLIC_ para valerem também no navegador; mudar
// qualquer um dos dois na Vercel pede um novo deploy.
//
//   NEXT_PUBLIC_DOMINIO_RAIZ        nuflow.space (padrão). No teste local use
//                                   "nuflow.localhost" (área em contourline.nuflow.localhost):
//                                   com "localhost" puro o Next trata localhost e
//                                   127.0.0.1 como o mesmo host, encurta o
//                                   redirecionamento para o login e ele entra em laço.
//   NEXT_PUBLIC_AREA_POR_SUBDOMINIO "1" liga o 301 de /c/<slug> para o subdomínio
//                                   e faz Configurações divulgar o endereço novo.
//                                   Só ligar depois que *.nuflow.space responder.

/** Mesmo formato que o cadastro de empresa aceita: minúsculas, números e hífen. */
export const SLUG_PUBLICO = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export const DOMINIO_RAIZ = (process.env.NEXT_PUBLIC_DOMINIO_RAIZ || "nuflow.space").trim().toLowerCase()

export const AREA_POR_SUBDOMINIO = process.env.NEXT_PUBLIC_AREA_POR_SUBDOMINIO === "1"

/**
 * Nomes que nunca viram área de empresa, mesmo que alguém cadastre o slug.
 * São endereços do próprio NuFlow (ou que podem vir a ser) e nomes que
 * enganariam quem recebe o link.
 */
export const SUBDOMINIOS_RESERVADOS = new Set([
  "www", "app", "api", "admin", "painel", "dashboard", "login", "entrar", "conta", "auth",
  "mail", "email", "smtp", "imap", "pop", "webmail", "ftp", "cdn", "static", "assets", "img", "midia", "media",
  "status", "docs", "ajuda", "help", "suporte", "support", "blog", "dev", "staging", "teste", "test", "preview",
  "nuflow", "cutflow", "c", "ns1", "ns2",
])

/** Páginas da área que precisam da sessão do domínio principal (o cookie do login é por host). */
const SO_NO_PRINCIPAL = ["/entrar", "/painel"]

function semPorta(host: string) {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
}

/** O slug quando o host é <slug>.<domínio raiz>; null para o domínio principal e o resto. */
export function slugDoHost(host: string | null | undefined, raiz = DOMINIO_RAIZ): string | null {
  if (!host) return null
  const nome = semPorta(host)
  const sufixo = `.${raiz}`
  if (!nome.endsWith(sufixo)) return null
  const slug = nome.slice(0, -sufixo.length)
  // Um nível só: a.b.nuflow.space não é área de ninguém.
  if (!slug || slug.includes(".") || !SLUG_PUBLICO.test(slug) || SUBDOMINIOS_RESERVADOS.has(slug)) return null
  return slug
}

/** O host é o domínio principal (com ou sem www)? Previews da Vercel e afins não são. */
export function ehDominioPrincipal(host: string | null | undefined, raiz = DOMINIO_RAIZ): boolean {
  if (!host) return false
  const nome = semPorta(host)
  return nome === raiz || nome === `www.${raiz}`
}

/** Origem (protocolo + host + porta) do subdomínio da empresa, a partir do endereço atual. */
export function origemDaArea(slug: string, protocolo: string, porta = "", raiz = DOMINIO_RAIZ): string {
  return `${protocolo.replace(/:?$/, ":")}//${slug}.${raiz}${porta ? `:${porta}` : ""}`
}

/** Origem do domínio principal, a partir do endereço atual. */
export function origemPrincipal(protocolo: string, porta = "", raiz = DOMINIO_RAIZ): string {
  return `${protocolo.replace(/:?$/, ":")}//${raiz}${porta ? `:${porta}` : ""}`
}

function portaDoHost(host: string | null | undefined) {
  return /:(\d+)$/.exec(host?.trim() ?? "")?.[1] ?? ""
}

export type LinksDaArea = {
  /** Prefixo dos links: "" no subdomínio, "/c/<slug>" no endereço antigo. Use `${base}/pedido`. */
  base: string
  /** O início da área (nunca vazio). */
  inicio: string
  /** O login da área, sempre no domínio principal: o cookie da sessão é por host. */
  entrar: string
  noSubdominio: boolean
}

/**
 * Os links de dentro da área para quem está em `host`. Os mesmos nos dois
 * endereços: contourline.nuflow.space/pedido e nuflow.space/c/contourline/pedido.
 */
export function linksDaArea(
  slug: string,
  host: string | null | undefined,
  protocolo: string,
  opcoes: { ligado?: boolean; raiz?: string } = {},
): LinksDaArea {
  const raiz = opcoes.raiz ?? DOMINIO_RAIZ
  const ligado = opcoes.ligado ?? AREA_POR_SUBDOMINIO
  const porta = portaDoHost(host)
  if (slugDoHost(host, raiz) === slug) {
    return { base: "", inicio: "/", entrar: `${origemPrincipal(protocolo, porta, raiz)}/c/${slug}/entrar`, noSubdominio: true }
  }
  const base = `/c/${slug}`
  // No domínio principal com a chave ligada, o "voltar" já vai ao endereço novo
  // (sem passar pelo 301). Fora dele — preview da Vercel, 127.0.0.1 — fica /c/.
  const inicio = ligado && ehDominioPrincipal(host, raiz) ? `${origemDaArea(slug, protocolo, porta, raiz)}/` : base
  return { base, inicio, entrar: `${base}/entrar`, noSubdominio: false }
}

/** Arquivo estático (tem extensão no último trecho): não passa pela área. */
function ehArquivo(caminho: string) {
  return /\.[a-z0-9]+$/i.test(caminho.slice(caminho.lastIndexOf("/") + 1))
}

export type Desvio =
  | { tipo: "reescrever"; caminho: string }
  | { tipo: "redirecionar"; url: string; status: 301 | 307 | 308 }

type Pedido = { host: string | null; caminho: string; busca: string; protocolo: string }

/**
 * O que o proxy faz com o pedido, ou null para seguir o fluxo normal (login).
 *
 * No subdomínio:
 *   /api, /_next e arquivos      → seguem como estão (a API é a mesma)
 *   /entrar, /painel             → 307 para nuflow.space/c/<slug>/... (sessão é do principal;
 *                                  também com o prefixo /c/<slug> na frente)
 *   /c/<slug>/x (link velho)     → 308 para /x no próprio subdomínio
 *   /x                           → reescreve para /c/<slug>/x
 *
 * No domínio principal, com a chave ligada:
 *   /c/<slug>/x                  → 301 para <slug>.nuflow.space/x (menos entrar e painel)
 */
export function desvioDoSubdominio(p: Pedido, opcoes: { ligado?: boolean; raiz?: string } = {}): Desvio | null {
  const raiz = opcoes.raiz ?? DOMINIO_RAIZ
  const ligado = opcoes.ligado ?? AREA_POR_SUBDOMINIO
  const slug = slugDoHost(p.host, raiz)
  const porta = portaDoHost(p.host)

  if (slug) {
    if (p.caminho === "/api" || p.caminho.startsWith("/api/") || p.caminho.startsWith("/_next/") || ehArquivo(p.caminho)) return null
    const prefixo = `/c/${slug}`
    const comPrefixo = p.caminho === prefixo || p.caminho.startsWith(`${prefixo}/`)
    const caminho = comPrefixo ? p.caminho.slice(prefixo.length) || "/" : p.caminho
    if (SO_NO_PRINCIPAL.some(t => caminho === t || caminho.startsWith(`${t}/`))) {
      return { tipo: "redirecionar", url: `${origemPrincipal(p.protocolo, porta, raiz)}${prefixo}${caminho}${p.busca}`, status: 307 }
    }
    if (comPrefixo) {
      return { tipo: "redirecionar", url: `${origemDaArea(slug, p.protocolo, porta, raiz)}${caminho}${p.busca}`, status: 308 }
    }
    return { tipo: "reescrever", caminho: `${prefixo}${caminho === "/" ? "" : caminho}` }
  }

  if (ligado && ehDominioPrincipal(p.host, raiz)) {
    const m = /^\/c\/([^/]+)(\/.*)?$/.exec(p.caminho)
    if (!m) return null
    const alvo = m[1].toLowerCase()
    const resto = m[2] ?? ""
    if (!SLUG_PUBLICO.test(alvo) || SUBDOMINIOS_RESERVADOS.has(alvo)) return null
    if (SO_NO_PRINCIPAL.some(t => resto === t || resto.startsWith(`${t}/`))) return null
    return { tipo: "redirecionar", url: `${origemDaArea(alvo, p.protocolo, porta, raiz)}${resto || "/"}${p.busca}`, status: 301 }
  }

  return null
}
