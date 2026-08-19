// Growth — tipos de DEMANDA e seus campos condicionais.
// Os valores preenchidos vão para Demanda.detalhesEntrega (Json), sem migração por tipo.

export type CampoTipo = "text" | "textarea" | "number" | "bool" | "select"

export interface CampoCondicional {
  key: string
  label: string
  tipo: CampoTipo
  /** Opções do tipo "select". */
  opcoes?: string[]
  placeholder?: string
  /** Ocupa as duas colunas do bloco (textos longos e seletores decisivos). */
  largura?: "inteira"
  /** Só aparece quando outro campo do mesmo tipo está com este valor. */
  visivelSe?: { campo: string; valor: string }
}

export interface TipoConteudo { key: string; label: string; campos: CampoCondicional[] }

/** O campo está visível dado o que já foi preenchido? */
export function campoVisivel(campo: CampoCondicional, valores: Record<string, string>): boolean {
  if (!campo.visivelSe) return true
  return valores[campo.visivelSe.campo] === campo.visivelSe.valor
}

// Lista de tipos de demanda do Growth — em ordem alfabética (por label).
export const TIPOS_CONTEUDO: TipoConteudo[] = [
  { key: "administrativo", label: "Administrativo", campos: [] },
  { key: "anuncio", label: "Anúncio", campos: [
    { key: "canal", label: "Canal", tipo: "text", placeholder: "Meta, Google, LinkedIn..." },
    { key: "objetivo", label: "Objetivo", tipo: "text" },
    { key: "formatos", label: "Formatos necessários", tipo: "text" },
    { key: "copy", label: "Copy", tipo: "textarea", largura: "inteira" },
  ] },
  { key: "apresentacao", label: "Apresentação", campos: [] },
  { key: "atualizacao_drive", label: "Atualização de drive", campos: [] },
  { key: "atualizacao_materiais", label: "Atualização de materiais", campos: [] },
  // O carrossel perguntava "Copy pronta?" e "Precisa criar copy?" — duas perguntas
  // independentes que podiam se contradizer — e não oferecia campo nenhum para a
  // copy em si. Virou uma pergunta só, que abre o campo certo para cada resposta.
  { key: "carrossel", label: "Carrossel", campos: [
    { key: "formato", label: "Formato", tipo: "select", opcoes: ["1:1", "4:5", "9:16"] },
    { key: "slides", label: "Quantidade de slides", tipo: "number", placeholder: "Ex.: 5" },
    { key: "statusCopy", label: "Status da Copy", tipo: "select",
      opcoes: ["Pronta", "Precisa criar"], largura: "inteira" },
    { key: "copyTexto", label: "Texto da Copy (cole aqui)", tipo: "textarea", largura: "inteira",
      placeholder: "Cole o texto que vai em cada slide e na legenda.",
      visivelSe: { campo: "statusCopy", valor: "Pronta" } },
    { key: "briefingCopy", label: "Briefing / Direcionamento para o Copywriter", tipo: "textarea",
      largura: "inteira",
      placeholder: "Tema, tom de voz, o que precisa ficar claro e qual ação o público deve tomar.",
      visivelSe: { campo: "statusCopy", valor: "Precisa criar" } },
    { key: "refsVisuais", label: "Referências visuais", tipo: "textarea", largura: "inteira" },
  ] },
  { key: "design", label: "Design", campos: [] },
  { key: "email_marketing", label: "Email Marketing", campos: [
    { key: "objetivoCampanha", label: "Objetivo da campanha", tipo: "text" },
    { key: "assunto", label: "Assunto sugerido", tipo: "text" },
    { key: "segmento", label: "Público / segmento", tipo: "text" },
    { key: "cta", label: "CTA", tipo: "text" },
  ] },
  { key: "landing_page", label: "Landing Page", campos: [
    { key: "objetivo", label: "Objetivo da página", tipo: "text" },
    { key: "cta", label: "CTA principal", tipo: "text" },
    { key: "secoes", label: "Seções desejadas", tipo: "textarea", largura: "inteira" },
  ] },
  { key: "post", label: "Post", campos: [
    { key: "formato", label: "Formato", tipo: "text" },
    { key: "copy", label: "Copy / legenda", tipo: "textarea", largura: "inteira" },
  ] },
]

export function tipoConteudoDe(key: string): TipoConteudo | undefined {
  return TIPOS_CONTEUDO.find((t) => t.key === key)
}
