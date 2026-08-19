// Growth — tipos de DEMANDA e seus campos condicionais.
// Os valores preenchidos vão para Demanda.detalhesEntrega (Json), sem migração por tipo.
//
// Regra do catálogo: aqui só entra o que é ESPECÍFICO daquele tipo de entrega.
// Título, objetivo e prazo já estão no topo do formulário; arquivo, link de
// referência e link dos brutos já estão no rodapé fixo. Repetir qualquer um
// deles aqui é pedir a mesma coisa duas vezes — foi o que aconteceu com
// "Referências visuais" no carrossel, que competia com o campo de links logo
// abaixo e ninguém sabia qual dos dois preencher.
//
// Tipo sem campo específico fica com o array vazio, e o formulário esconde o
// bloco inteiro (com o divisor). Bloco vazio é pior que bloco ausente: parece
// que a tela quebrou.

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

// A proporção vem com o tamanho em pixels porque é isso que o designer abre no
// arquivo. "4:5" sozinho ainda obriga alguém a converter de cabeça.
const FORMATOS_PECA = ["4:5 (1080x1350)", "9:16 (1080x1920)", "1:1 (1080x1080)"]

// Lista de tipos de demanda do Growth — em ordem alfabética (por label).
export const TIPOS_CONTEUDO: TipoConteudo[] = [
  { key: "administrativo", label: "Administrativo", campos: [] },

  // Estava vago: "Canal", "Objetivo" e "Formatos necessários" em campo de texto
  // livre devolviam resposta de uma palavra que não ajudava quem produz. Agora
  // a plataforma é escolha fechada, e o que o anúncio precisa de verdade —
  // para quem fala e o que promete — tem espaço para ser escrito.
  { key: "anuncio", label: "Anúncio", campos: [
    { key: "plataforma", label: "Plataforma", tipo: "select",
      opcoes: ["Meta Ads", "Google Ads", "TikTok", "LinkedIn", "Outro"] },
    { key: "publico", label: "Público-alvo / Avatar", tipo: "textarea", largura: "inteira",
      placeholder: "Quem é essa pessoa: idade, momento de vida, o que já tentou antes." },
    { key: "dor", label: "Dor principal / Promessa", tipo: "textarea", largura: "inteira",
      placeholder: "O incômodo que faz essa pessoa parar o scroll, e o que o anúncio promete resolver." },
  ] },

  { key: "apresentacao", label: "Apresentação", campos: [] },
  { key: "atualizacao_drive", label: "Atualização de drive", campos: [] },
  { key: "atualizacao_materiais", label: "Atualização de materiais", campos: [] },

  // O carrossel perguntava "Copy pronta?" e "Precisa criar copy?" — duas perguntas
  // independentes que podiam se contradizer — e não oferecia campo nenhum para a
  // copy em si. Virou uma pergunta só, que abre o campo certo para cada resposta.
  //
  // "Quantidade de slides" saiu: pedir o número antes de existir texto inverte a
  // ordem do trabalho — quem escreve a copy é que descobre em quantos slides ela
  // cabe. Fixar 5 na abertura só cria um número para desobedecer depois.
  { key: "carrossel", label: "Carrossel", campos: [
    { key: "formato", label: "Formato", tipo: "select", opcoes: FORMATOS_PECA },
    { key: "statusCopy", label: "Status da Copy", tipo: "select",
      opcoes: ["Pronta", "Precisa criar"] },
    { key: "copyTexto", label: "Texto da Copy (cole aqui)", tipo: "textarea", largura: "inteira",
      placeholder: "Cole o texto que vai em cada slide e na legenda.",
      visivelSe: { campo: "statusCopy", valor: "Pronta" } },
    { key: "briefingCopy", label: "Briefing / Direcionamento para o Copywriter", tipo: "textarea",
      largura: "inteira",
      placeholder: "Tema, tom de voz, o que precisa ficar claro e qual ação o público deve tomar.",
      visivelSe: { campo: "statusCopy", valor: "Precisa criar" } },
  ] },

  { key: "design", label: "Design", campos: [] },

  // Quatro campos curtos em duas linhas de duas colunas: a estratégia em cima
  // (para quem e para quê), a execução embaixo (o que a pessoa lê e o que clica).
  { key: "email_marketing", label: "Email Marketing", campos: [
    { key: "objetivoCampanha", label: "Objetivo da campanha", tipo: "text",
      placeholder: "Ex.: reativar quem não compra há 90 dias" },
    { key: "segmento", label: "Público / segmento", tipo: "text",
      placeholder: "Ex.: base de leads do webinar de julho" },
    { key: "assunto", label: "Assunto sugerido", tipo: "text",
      placeholder: "A linha que aparece na caixa de entrada" },
    { key: "cta", label: "CTA", tipo: "text", placeholder: "Ex.: Agendar avaliação" },
  ] },

  { key: "landing_page", label: "Landing Page", campos: [
    { key: "objetivo", label: "Objetivo da página", tipo: "text" },
    { key: "cta", label: "CTA principal", tipo: "text" },
    { key: "secoes", label: "Seções desejadas", tipo: "textarea", largura: "inteira" },
  ] },

  { key: "post", label: "Post", campos: [
    { key: "formato", label: "Formato", tipo: "select", opcoes: FORMATOS_PECA },
    { key: "copy", label: "Copy / legenda", tipo: "textarea", largura: "inteira" },
  ] },
]

export function tipoConteudoDe(key: string): TipoConteudo | undefined {
  return TIPOS_CONTEUDO.find((t) => t.key === key)
}
