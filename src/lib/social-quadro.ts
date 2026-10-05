// Regras do quadro da social media (/social), sem banco: servem à rota e à tela.
//
// O quadro é DELA, não da produção. Cada card é uma ideia do banco de ideias
// (IdeiaVideo) da linha dela; a coluna sai do estado da ideia e, depois do
// pedido, do estado da demanda que ela gerou.

import { ANO_MAXIMO, dataEmSaoPaulo, hojeEmSaoPaulo } from "@/lib/datas"

/** Marca, em IdeiaVideo.tags, o que chegou como pedido ("Solicitação") e não como ideia. */
export const TAG_SOLICITACAO = "solicitacao"

/** Pedido com a equipe sem mudança registrada há este tanto de dias está parado. */
export const DIAS_PARADO = 3

export type ColunaSocial = "ideia" | "plano" | "equipe" | "pronto"

export const COLUNAS_SOCIAL: { id: ColunaSocial; nome: string; dica: string }[] = [
  { id: "ideia", nome: "Ideias", dica: "Referências e ideias soltas, sem data." },
  { id: "plano", nome: "No plano", dica: "Já tem data de postagem. Ainda não foi pedido." },
  { id: "equipe", nome: "Com a equipe", dica: "Pedido feito. Você acompanha e cobra." },
  { id: "pronto", nome: "Pronto", dica: "Entregue. Falta postar ou já postou." },
]

// As seis colunas da produção viram quatro palavras para ela. "Recusado" é a
// exceção: a equipe recusou o pedido na entrada (statusInterno encerrado sem
// ter saído da Entrada), e mostrar "Pronto" ali seria mentira.
export type EtapaSocial = "recebido" | "produzindo" | "revisar" | "pronto" | "recusado"

export const ETAPA_NOME: Record<EtapaSocial, string> = {
  recebido: "Recebido",
  produzindo: "Produzindo",
  revisar: "Revisar",
  pronto: "Pronto",
  recusado: "Recusado",
}

/** Posição na trilha de quatro passos do card (recusado não anda). */
export const ETAPA_PASSO: Record<EtapaSocial, number> = {
  recebido: 0, produzindo: 1, revisar: 2, pronto: 3, recusado: -1,
}

export function etapaDoPedido(statusVisivel: string, statusInterno?: string | null): EtapaSocial {
  if (statusInterno === "encerrado" && statusVisivel === "entrada") return "recusado"
  switch (statusVisivel) {
    case "entrada": return "recebido"
    case "producao":
    case "edicao": return "produzindo"
    case "aprovacao": return "revisar"
    default: return "pronto" // para_postar, finalizado
  }
}

export function colunaDoCard(c: {
  dataPostagem: string | Date | null
  demanda: { statusVisivel: string; statusInterno?: string | null } | null
}): ColunaSocial {
  if (c.demanda) return etapaDoPedido(c.demanda.statusVisivel, c.demanda.statusInterno) === "pronto" ? "pronto" : "equipe"
  return c.dataPostagem ? "plano" : "ideia"
}

/**
 * Cobrar vale uma vez por dia por pedido. "Dia" é o de Brasília: cobrar às 22h
 * e de novo às 8h da manhã seguinte são dois dias, não o mesmo dia UTC.
 */
export function jaCobrouHoje(cobradoEm: string | Date | null | undefined, agora: Date = new Date()): boolean {
  if (!cobradoEm) return false
  return dataEmSaoPaulo(new Date(cobradoEm)) === dataEmSaoPaulo(agora)
}

/** "YYYY-MM-DD" do valor guardado em coluna DATE (vem como meia-noite UTC). */
export function diaDaPostagem(v: string | Date | null | undefined): string | null {
  if (!v) return null
  const iso = typeof v === "string" ? v : v.toISOString()
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null
}

/**
 * Data de postagem vinda do formulário ("YYYY-MM-DD"). Postar é no futuro: um
 * dia que já passou é engano de digitação, como no prazo de entrega.
 */
export function lerDataPostagem(
  valor: unknown,
  hoje: string = hojeEmSaoPaulo(),
): { ok: true; dia: string } | { ok: false; motivo: string } {
  const dia = typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim()) ? valor.trim() : null
  if (!dia || Number.isNaN(Date.parse(`${dia}T00:00:00Z`))) return { ok: false, motivo: "Escolha a data da postagem." }
  if (Number(dia.slice(0, 4)) > ANO_MAXIMO) return { ok: false, motivo: "Confira o ano da data de postagem." }
  if (dia < hoje) return { ok: false, motivo: "A data de postagem não pode ser antes de hoje." }
  return { ok: true, dia }
}

/** Coluna DATE: o dia vai como meia-noite UTC, e volta igual. */
export const diaParaBanco = (dia: string) => new Date(`${dia}T00:00:00.000Z`)

export type DadosIdeiaSocial = {
  titulo: string
  descricao: string | null
  linkReferencia: string | null
  area: "audiovisual" | "design"
  dataPostagem: Date | null
  formulario?: Record<string, unknown>
}

const LIMITE_FORMULARIO = 20_000 // caracteres do JSON — um briefing longo cabe com folga

/**
 * Corpo do "Salvar como ideia". Validação leve de propósito: ideia é anotação,
 * só precisa de título e área. A validação completa é a do envio à equipe.
 * `dataAtual` deixa regravar uma data que já passou sem ela ter mudado — o
 * post atrasou, mas editar o resto da ideia não pode ser bloqueado por isso.
 */
export function lerIdeiaSocial(
  body: Record<string, unknown>,
  opcoes: { dataAtual?: string | null; hoje?: string } = {},
): { ok: true; dados: DadosIdeiaSocial } | { ok: false; motivo: string } {
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  const titulo = texto(body.titulo)
  if (!titulo || titulo.length < 3) return { ok: false, motivo: "Dê um título à ideia (pelo menos 3 letras)." }
  if (body.area !== "audiovisual" && body.area !== "design") return { ok: false, motivo: "Escolha Vídeo ou Arte." }

  let dataPostagem: Date | null = null
  const bruta = texto(body.dataPostagem)
  if (bruta) {
    const lida = bruta === opcoes.dataAtual ? { ok: true as const, dia: bruta } : lerDataPostagem(bruta, opcoes.hoje)
    if (!lida.ok) return lida
    dataPostagem = diaParaBanco(lida.dia)
  }

  let formulario: Record<string, unknown> | undefined
  if (body.formulario !== undefined && body.formulario !== null) {
    if (typeof body.formulario !== "object" || Array.isArray(body.formulario)) return { ok: false, motivo: "Formulário inválido." }
    if (JSON.stringify(body.formulario).length > LIMITE_FORMULARIO) return { ok: false, motivo: "O texto da ideia ficou grande demais." }
    formulario = body.formulario as Record<string, unknown>
  }

  return {
    ok: true,
    dados: {
      titulo: titulo.slice(0, 300),
      descricao: texto(body.descricao),
      linkReferencia: texto(body.linkReferencia),
      area: body.area,
      dataPostagem,
      ...(formulario ? { formulario } : {}),
    },
  }
}

export type Sugestao = {
  solicitacao: boolean
  linhaProjetoId: string
  titulo: string
  descricao: string | null
  linkReferencia: string | null
  area: "audiovisual" | "design" | null
}

/**
 * "Mandar para a social": o formulário curto de quem não é a social, com ou sem
 * login. Cai em Ideias da linha escolhida; quem decide o que vira pedido é ela.
 */
export function lerSugestao(body: Record<string, unknown>): { ok: true; dados: Sugestao } | { ok: false; motivo: string } {
  const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
  if (body.tipo !== "ideia" && body.tipo !== "solicitacao") return { ok: false, motivo: "Escolha Ideia ou Solicitação." }
  const linhaProjetoId = texto(body.linhaProjetoId, 64)
  if (!linhaProjetoId) return { ok: false, motivo: "Escolha a linha de produto." }
  const oQue = texto(body.titulo, 2000)
  if (!oQue || oQue.length < 3) return { ok: false, motivo: "Conte em poucas palavras o que é." }
  const area = body.area === "audiovisual" || body.area === "design" ? body.area : null
  // O texto longo vira descrição; o título do card é a primeira linha, curta.
  const titulo = oQue.split("\n")[0].slice(0, 120)
  return {
    ok: true,
    dados: {
      solicitacao: body.tipo === "solicitacao",
      linhaProjetoId,
      titulo,
      descricao: oQue.length > titulo.length ? oQue : null,
      linkReferencia: texto(body.linkReferencia, 500),
      area,
    },
  }
}
