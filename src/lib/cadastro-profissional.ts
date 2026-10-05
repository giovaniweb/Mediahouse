// O que o cadastro de profissional (área pública da empresa) e a API dele
// precisam concordar: as áreas de atuação e o link do portfólio.
// Sem dependência de servidor: roda no formulário e na rota.

export type Papel = "videomaker" | "designer"

/** Chips de "Áreas de atuação". A do videomaker é a lista que já existia. */
export const AREAS_ATUACAO: Record<Papel, readonly string[]> = {
  videomaker: ["Casamento", "Eventos Corporativos", "Clipes Musicais", "Documentário", "Publicidade", "Redes Sociais / Reels", "Institucional", "Esportes", "Gastronomia", "Moda & Beauty", "Imóveis", "Jornalismo"],
  designer: ["Post e carrossel", "Story", "Criativo de tráfego", "Identidade visual", "Motion", "Impresso", "E-mail marketing", "Apresentações", "3D"],
}

/**
 * Portfólio digitado como as pessoas digitam ("instagram.com/fulano") vira um
 * link de verdade. Só http(s): o link aparece clicável para a equipe, e
 * `javascript:` passaria no validador de URL. Vazio ou inválido = null.
 */
export function linkDePortfolio(texto: string | null | undefined): string | null {
  const t = texto?.trim()
  if (!t) return null
  const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`
  try {
    const url = new URL(comEsquema)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (!url.hostname.includes(".")) return null
    return url.toString()
  } catch {
    return null
  }
}
