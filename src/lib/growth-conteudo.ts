// Growth — tipos de DEMANDA e seus campos condicionais.
// Os valores preenchidos vão para Demanda.detalhesEntrega (Json), sem migração por tipo.
//
// Regra do catálogo: aqui só entra o que é ESPECÍFICO daquele tipo de entrega.
// Título, prioridade e prazo já estão no topo do formulário; arquivo, link de
// referência e link dos brutos já estão no rodapé fixo. Repetir qualquer um
// deles aqui é pedir a mesma coisa duas vezes — foi o que aconteceu com
// "Referências visuais" no carrossel, que competia com o campo de links logo
// abaixo e ninguém sabia qual dos dois preencher.
//
// A descrição é a exceção, e é deliberada: em vez de um "Observação / Objetivo"
// genérico no topo, cada tipo pergunta o que precisa saber, com o exemplo certo
// no placeholder. Quem responde "o que precisa ser atualizado no drive" escreve
// melhor do que quem responde "observação". O valor continua indo para a MESMA
// coluna `Demanda.descricao` — ver `mapeiaPara`.

export type CampoTipo = "text" | "textarea" | "number" | "bool" | "select" | "radio-visual"

/** Ícone de uma opção visual. String, não componente: este arquivo não importa React. */
export type IconeVisual = "quadrado" | "retrato" | "celular"

export interface OpcaoVisual {
  valor: string
  /** Linha de apoio embaixo do valor — no formato, o tamanho em pixels. */
  rotulo: string
  icone: IconeVisual
}

export interface CampoCondicional {
  key: string
  label: string
  tipo: CampoTipo
  /** Opções do tipo "select". */
  opcoes?: string[]
  /** Opções do tipo "radio-visual" (cartões com ícone). */
  opcoesVisuais?: OpcaoVisual[]
  placeholder?: string
  /** Ocupa as duas colunas do bloco (textos longos e seletores decisivos). */
  largura?: "inteira"
  /** Só aparece quando outro campo do mesmo tipo está com este valor. */
  visivelSe?: { campo: string; valor: string }
  /**
   * Este campo não é um detalhe: é a descrição da demanda, e vai para a coluna
   * `Demanda.descricao`. Exatamente um campo por tipo carrega esta marca — a
   * coluna é NOT NULL e alimenta a triagem por IA, a tela de campo e o fallback
   * da aprovação, então nenhum tipo pode ficar sem ela.
   */
  mapeiaPara?: "descricao"
}

export interface TipoConteudo { key: string; label: string; campos: CampoCondicional[] }

/** O campo está visível dado o que já foi preenchido? */
export function campoVisivel(campo: CampoCondicional, valores: Record<string, string>): boolean {
  if (!campo.visivelSe) return true
  return valores[campo.visivelSe.campo] === campo.visivelSe.valor
}

/** O campo cujo valor vira `Demanda.descricao`. */
export function campoDescricaoDe(tipo?: TipoConteudo): CampoCondicional | undefined {
  return tipo?.campos.find((c) => c.mapeiaPara === "descricao")
}

// A chave é a MESMA nos oito tipos de propósito: trocar o tipo de demanda no
// meio do preenchimento não pode apagar o briefing que a pessoa acabou de
// escrever. É o único valor que sobrevive à troca.
export const CHAVE_DESCRICAO = "descricao"

/** Cartões de formato. O valor é a proporção; o tamanho em pixels é o apoio. */
const FORMATOS_VISUAIS: OpcaoVisual[] = [
  { valor: "1:1", rotulo: "1080 × 1080", icone: "quadrado" },
  { valor: "4:5", rotulo: "1080 × 1350", icone: "retrato" },
  { valor: "9:16", rotulo: "1080 × 1920", icone: "celular" },
]

const campoFormato: CampoCondicional = {
  key: "formato", label: "Formato", tipo: "radio-visual",
  opcoesVisuais: FORMATOS_VISUAIS, largura: "inteira",
}

/** Atalho para o campo de descrição, que muda só de rótulo e exemplo. */
function descricao(label: string, placeholder: string): CampoCondicional {
  return {
    key: CHAVE_DESCRICAO, label, tipo: "textarea", largura: "inteira",
    placeholder, mapeiaPara: "descricao",
  }
}

// Lista de tipos de demanda do Growth — em ordem alfabética (por label).
export const TIPOS_CONTEUDO: TipoConteudo[] = [
  { key: "administrativo", label: "Administrativo", campos: [
    descricao("Descrição da tarefa", "O que precisa ser feito, para quem e o que conta como pronto."),
  ] },

  // Estava vago: "Canal", "Objetivo" e "Formatos necessários" em campo de texto
  // livre devolviam resposta de uma palavra que não ajudava quem produz. Agora
  // a plataforma é escolha fechada, e o que o anúncio precisa de verdade —
  // para quem fala, o que promete e o texto que vai no ar — tem onde ser escrito.
  { key: "anuncio", label: "Anúncio", campos: [
    descricao("Descrição / Direcionamento", "Que resultado o anúncio precisa trazer, para qual oferta e em qual campanha ele entra."),
    { key: "plataforma", label: "Plataforma", tipo: "select",
      opcoes: ["Meta Ads", "Google Ads", "TikTok", "LinkedIn", "Outro"] },
    { key: "publico", label: "Público-alvo / Avatar", tipo: "textarea",
      placeholder: "Idade, momento de vida, o que já tentou antes." },
    { key: "dor", label: "Dor principal / Promessa", tipo: "textarea",
      placeholder: "O incômodo que faz parar o scroll, e o que o anúncio promete resolver." },
    { key: "copyTexto", label: "Texto da Copy (cole aqui)", tipo: "textarea", largura: "inteira",
      placeholder: "O texto que vai no ar. Deixe em branco se ainda vai ser escrito." },
  ] },

  { key: "apresentacao", label: "Apresentação", campos: [
    descricao("Sobre o que é a apresentação", "Público, contexto de uso e quantos slides, mais ou menos."),
  ] },

  { key: "atualizacao_drive", label: "Atualização de drive", campos: [
    descricao("O que precisa ser atualizado", "Quais pastas ou arquivos, e o que muda em cada um."),
  ] },

  { key: "atualizacao_materiais", label: "Atualização de materiais", campos: [
    descricao("O que precisa ser atualizado", "Quais materiais, o que mudou neles e onde são usados."),
  ] },

  // O carrossel perguntava "Copy pronta?" e "Precisa criar copy?" — duas perguntas
  // independentes que podiam se contradizer — e não oferecia campo nenhum para a
  // copy em si. Virou uma pergunta só, que abre o campo certo para cada resposta.
  //
  // "Quantidade de slides" saiu: pedir o número antes de existir texto inverte a
  // ordem do trabalho — quem escreve a copy é que descobre em quantos slides ela
  // cabe. Fixar 5 na abertura só cria um número para desobedecer depois.
  { key: "carrossel", label: "Carrossel", campos: [
    descricao("Tema e objetivo do carrossel", "Sobre o que é, para quem, e o que o público deve fazer depois de ler."),
    campoFormato,
    { key: "statusCopy", label: "Status da Copy", tipo: "select",
      opcoes: ["Pronta", "Precisa criar"] },
    { key: "copyTexto", label: "Texto da Copy (cole aqui)", tipo: "textarea", largura: "inteira",
      placeholder: "Cole o texto que vai em cada slide e na legenda.",
      visivelSe: { campo: "statusCopy", valor: "Pronta" } },
    { key: "briefingCopy", label: "Briefing / Direcionamento para o Copywriter", tipo: "textarea",
      largura: "inteira",
      placeholder: "Tom de voz, o que precisa ficar claro e qual ação o público deve tomar.",
      visivelSe: { campo: "statusCopy", valor: "Precisa criar" } },
  ] },

  { key: "design", label: "Design", campos: [
    descricao("Descrição / Direcionamento", "O que precisa ser criado, onde vai ser usado e qual a referência de estilo."),
  ] },

  // "Objetivo da campanha" é a própria descrição aqui — não faz sentido perguntar
  // objetivo e descrição em campos separados no mesmo bloco.
  { key: "email_marketing", label: "Email Marketing", campos: [
    descricao("Objetivo da campanha", "Ex.: reativar quem não compra há 90 dias, com desconto de retorno."),
    { key: "segmento", label: "Público / segmento", tipo: "text",
      placeholder: "Ex.: base de leads do webinar de julho" },
    { key: "assunto", label: "Assunto sugerido", tipo: "text",
      placeholder: "A linha que aparece na caixa de entrada" },
    { key: "cta", label: "CTA", tipo: "text", placeholder: "Ex.: Agendar avaliação" },
  ] },

  { key: "landing_page", label: "Landing Page", campos: [
    descricao("Objetivo da página", "Que ação a página precisa gerar, e de quem."),
    { key: "cta", label: "CTA principal", tipo: "text" },
    { key: "secoes", label: "Seções desejadas", tipo: "textarea", largura: "inteira" },
  ] },

  { key: "post", label: "Post", campos: [
    descricao("Descrição / Direcionamento", "Sobre o que é o post, para quem e qual ação você espera."),
    campoFormato,
    { key: "copy", label: "Copy / legenda", tipo: "textarea", largura: "inteira" },
  ] },
]

export function tipoConteudoDe(key: string): TipoConteudo | undefined {
  return TIPOS_CONTEUDO.find((t) => t.key === key)
}

// ── Que tipo entrega uma PEÇA para o cliente aprovar olhando? ───────────────
//
// Nem toda demanda de Growth termina num arquivo. Campanha de e-mail vive no
// RD, landing page é uma URL, tarefa administrativa não tem entregável nenhum.
// Exigir "arte final" desses tipos para mandar para aprovação trava trabalho
// legítimo — medido em 24/08/2026: 8 demandas ativas presas assim, entre elas
// "CRIAÇÃO DE NOVO CRM", "Campanha de Reativação de Leads – HIPRO" e quatro
// landing pages. Na história inteira da base, `email_marketing` (9 aprovações),
// `landing_page` (4), `landing_copy` (4) e `administrativo` (3) NUNCA tiveram
// uma arte final anexada — não é descuido da equipe, é a natureza do trabalho.
//
// O mapa é explícito e fechado de propósito. Tipo novo no catálogo sem entrada
// aqui quebra o teste em `tests/unit/growth-peca.spec.ts`, obrigando quem
// adiciona a decidir — em vez de herdar um default que trava ou libera calado.
const ENTREGA_PECA: Record<string, boolean> = {
  // Entregam peça: o cliente aprova olhando o arquivo.
  post:                   true,
  carrossel:              true,
  anuncio:                true,
  // Legado ainda vivo na base (não estão em TIPOS_CONTEUDO, mas existem em
  // demandas antigas): material_grafico são 34 demandas, story 1.
  material_grafico:       true,
  story:                  true,

  // Não entregam peça: a entrega é um link, um disparo ou uma configuração.
  email_marketing:        false,
  landing_page:           false,
  landing_copy:           false,
  administrativo:         false,
  atualizacao_drive:      false,
  atualizacao_materiais:  false,
  // Apresentação e design saem por link do Canva ou do Drive, não por arquivo
  // subido aqui. Na base havia arte em parte deles (design 4 de 9, apresentação
  // 1 de 1), o que faria a leitura ingênua colocá-los do outro lado — mas o dado
  // mostra o que às vezes acontece, não o que o processo exige. Quem opera
  // decidiu, em 24/08/2026: o entregável é o link. Anexar continua permitido;
  // o que sai é a obrigação.
  apresentacao:           false,
  design:                 false,
}

/** O tipo tem decisão registrada acima? Usado pelo teste que impede tipo novo
 *  de nascer sem alguém dizer de que lado ele fica. */
export function temDecisaoDePeca(tipo: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENTREGA_PECA, tipo)
}

/**
 * A demanda entrega uma peça visual que o cliente aprova olhando?
 *
 * Só para esses tipos faz sentido exigir a arte antes de "Para aprovação".
 * Tipo desconhecido devolve `false` — na dúvida, não travar: uma peça que passa
 * sem arte é um card que alguém corrige, e um trabalho travado sem explicação é
 * alguém parado sem saber por quê.
 */
export function entregaPecaVisual(tipo: string | null | undefined): boolean {
  return ENTREGA_PECA[tipo ?? ""] ?? false
}
