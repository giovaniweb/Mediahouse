// Growth — tipos de conteúdo e seus campos condicionais (item 3).
// Os valores preenchidos vão para Demanda.detalhesEntrega (Json), sem migração por tipo.

export type CampoTipo = "text" | "textarea" | "number" | "bool"
export interface CampoCondicional { key: string; label: string; tipo: CampoTipo }
export interface TipoConteudo { key: string; label: string; campos: CampoCondicional[] }

export const TIPOS_CONTEUDO: TipoConteudo[] = [
  { key: "post", label: "Post feed", campos: [
    { key: "formato", label: "Formato", tipo: "text" },
    { key: "copy", label: "Copy / legenda", tipo: "textarea" },
  ] },
  { key: "story", label: "Story", campos: [
    { key: "qtd", label: "Quantidade de stories", tipo: "number" },
    { key: "interacao", label: "Tem interação (enquete/link)?", tipo: "text" },
  ] },
  { key: "reels", label: "Reels", campos: [
    { key: "duracao", label: "Duração estimada (s)", tipo: "number" },
    { key: "roteiro", label: "Roteiro / ideia", tipo: "textarea" },
    { key: "trilha", label: "Trilha / áudio de referência", tipo: "text" },
  ] },
  { key: "carrossel", label: "Carrossel", campos: [
    { key: "slides", label: "Quantidade de slides", tipo: "number" },
    { key: "copyPronta", label: "Copy pronta?", tipo: "bool" },
    { key: "precisaCopy", label: "Precisa criar copy?", tipo: "bool" },
    { key: "formato", label: "Formato", tipo: "text" },
    { key: "refsVisuais", label: "Referências visuais", tipo: "textarea" },
  ] },
  { key: "email_marketing", label: "E-mail marketing", campos: [
    { key: "assunto", label: "Assunto sugerido", tipo: "text" },
    { key: "cta", label: "CTA", tipo: "text" },
    { key: "objetivoCampanha", label: "Objetivo da campanha", tipo: "text" },
    { key: "segmento", label: "Público / segmento", tipo: "text" },
  ] },
  { key: "criativo_trafego", label: "Criativo para tráfego", campos: [
    { key: "canal", label: "Canal", tipo: "text" },
    { key: "objetivo", label: "Objetivo", tipo: "text" },
    { key: "formatos", label: "Formatos necessários", tipo: "text" },
    { key: "copy", label: "Copy", tipo: "textarea" },
  ] },
  { key: "landing_copy", label: "Landing page / copy", campos: [
    { key: "objetivo", label: "Objetivo da página", tipo: "text" },
    { key: "secoes", label: "Seções desejadas", tipo: "textarea" },
    { key: "cta", label: "CTA principal", tipo: "text" },
  ] },
  { key: "material_grafico", label: "Material gráfico", campos: [
    { key: "tipoPeca", label: "Tipo de peça", tipo: "text" },
    { key: "dimensoes", label: "Dimensões / formato", tipo: "text" },
  ] },
]

export function tipoConteudoDe(key: string): TipoConteudo | undefined {
  return TIPOS_CONTEUDO.find((t) => t.key === key)
}
