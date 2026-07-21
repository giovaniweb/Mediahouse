// Growth — tipos de DEMANDA e seus campos condicionais.
// Os valores preenchidos vão para Demanda.detalhesEntrega (Json), sem migração por tipo.

export type CampoTipo = "text" | "textarea" | "number" | "bool"
export interface CampoCondicional { key: string; label: string; tipo: CampoTipo }
export interface TipoConteudo { key: string; label: string; campos: CampoCondicional[] }

// Lista de tipos de demanda do Growth — em ordem alfabética (por label).
export const TIPOS_CONTEUDO: TipoConteudo[] = [
  { key: "administrativo", label: "Administrativo", campos: [] },
  { key: "anuncio", label: "Anúncio", campos: [
    { key: "canal", label: "Canal", tipo: "text" },
    { key: "objetivo", label: "Objetivo", tipo: "text" },
    { key: "formatos", label: "Formatos necessários", tipo: "text" },
    { key: "copy", label: "Copy", tipo: "textarea" },
  ] },
  { key: "apresentacao", label: "Apresentação", campos: [] },
  { key: "atualizacao_drive", label: "Atualização de drive", campos: [] },
  { key: "atualizacao_materiais", label: "Atualização de materiais", campos: [] },
  { key: "carrossel", label: "Carrossel", campos: [
    { key: "slides", label: "Quantidade de slides", tipo: "number" },
    { key: "copyPronta", label: "Copy pronta?", tipo: "bool" },
    { key: "precisaCopy", label: "Precisa criar copy?", tipo: "bool" },
    { key: "formato", label: "Formato", tipo: "text" },
    { key: "refsVisuais", label: "Referências visuais", tipo: "textarea" },
  ] },
  { key: "design", label: "Design", campos: [] },
  { key: "email_marketing", label: "Email Marketing", campos: [
    { key: "assunto", label: "Assunto sugerido", tipo: "text" },
    { key: "cta", label: "CTA", tipo: "text" },
    { key: "objetivoCampanha", label: "Objetivo da campanha", tipo: "text" },
    { key: "segmento", label: "Público / segmento", tipo: "text" },
  ] },
  { key: "landing_page", label: "Landing Page", campos: [
    { key: "objetivo", label: "Objetivo da página", tipo: "text" },
    { key: "secoes", label: "Seções desejadas", tipo: "textarea" },
    { key: "cta", label: "CTA principal", tipo: "text" },
  ] },
  { key: "post", label: "Post", campos: [
    { key: "formato", label: "Formato", tipo: "text" },
    { key: "copy", label: "Copy / legenda", tipo: "textarea" },
  ] },
]

export function tipoConteudoDe(key: string): TipoConteudo | undefined {
  return TIPOS_CONTEUDO.find((t) => t.key === key)
}
