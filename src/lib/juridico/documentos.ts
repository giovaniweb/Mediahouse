// Os documentos jurídicos do NuFlow: nome, endereço e versão.
//
// Este arquivo NÃO carrega o texto (fica em ./textos, lido só pelas páginas
// públicas), porque a caixa de aceite e o layout do painel importam isto aqui,
// e cinco contratos inteiros não têm por que ir para o navegador de cada pessoa.
//
// Versão nova = mudar `versao` e `data` do documento. Quem precisa daquele
// documento (ver documentosExigidos) volta a ver a tela de aceite no próximo
// acesso. Correção de vírgula que não muda direito nem dever não pede versão nova.

export type SlugDocumento = "termos" | "privacidade" | "dpa" | "profissionais" | "avaliacoes"

export type DocumentoJuridico = {
  slug: SlugDocumento
  titulo: string
  /** Nome curto para link de rodapé e para a caixa de aceite. */
  curto: string
  caminho: string
  versao: string
  /** AAAA-MM-DD da redação desta versão. */
  data: string
}

export const DOCUMENTOS: Record<SlugDocumento, DocumentoJuridico> = {
  termos: { slug: "termos", titulo: "Termos de Uso e Contrato de Assinatura", curto: "Termos de Uso", caminho: "/termos", versao: "1.0", data: "2026-10-07" },
  privacidade: { slug: "privacidade", titulo: "Política de Privacidade", curto: "Política de Privacidade", caminho: "/privacidade", versao: "1.0", data: "2026-10-07" },
  dpa: { slug: "dpa", titulo: "Acordo de Tratamento de Dados", curto: "Acordo de Tratamento de Dados", caminho: "/dpa", versao: "1.0", data: "2026-10-07" },
  profissionais: { slug: "profissionais", titulo: "Termos do Profissional", curto: "Termos do Profissional", caminho: "/profissionais/termos", versao: "1.0", data: "2026-10-07" },
  avaliacoes: { slug: "avaliacoes", titulo: "Política de Avaliações da Rede", curto: "Política de Avaliações", caminho: "/profissionais/avaliacoes", versao: "1.0", data: "2026-10-07" },
}

/** Ordem de leitura nos rodapés e no índice de cada documento. */
export const ORDEM_DOCUMENTOS: SlugDocumento[] = ["termos", "privacidade", "dpa", "profissionais", "avaliacoes"]

/**
 * true = rascunho: toda página jurídica abre com a faixa de minuta e sai dos
 * buscadores. Desligada em 07/10/2026, com os [PREENCHER] resolvidos e a decisão
 * do Giovani de publicar sem revisão de advogado (revisão crítica interna feita).
 * Um teste impede MINUTA=false com qualquer [PREENCHER] sobrando.
 */
export const MINUTA = false

export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number)
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
  return `${d} de ${meses[m - 1]} de ${a}`
}

/** "termos@1.0" — como o aceite guarda cada documento. */
export function marcaDeVersao(slug: SlugDocumento): string {
  return `${slug}@${DOCUMENTOS[slug].versao}`
}
