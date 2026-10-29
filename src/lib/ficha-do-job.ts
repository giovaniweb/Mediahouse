// A ficha do Job: o que se precisa saber de relance — quando, onde, quem vai e
// para quem. Os dados já estavam no registro, mas espalhados (a data em "Datas",
// o local só no modo de edição, o videomaker lá embaixo em "Equipe e contexto")
// ou nem apareciam: o pedido público grava `dataEvento` e `localEvento`, que a
// tela do Job não lia.
//
// Regras puras, sem import de runtime do servidor: este módulo vai para o
// navegador (card, quadro, detalhe e Aprovações).
import type { StatusInterno } from "@prisma/client"
import { dataEmSaoPaulo, diasEntre, hojeEmSaoPaulo } from "@/lib/datas"
import { faseDoJob } from "@/lib/job-fase"

type Valor = string | Date | null | undefined

/** Dia ("AAAA-MM-DD") e hora ("HH:MM", Brasília) — a hora pode não existir. */
export type Momento = { dia: string; hora: string | null }

const HORA_SP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/**
 * Lê um campo de data do Job. Dois formatos convivem no banco:
 *  - só o dia, gravado como meia-noite UTC (o campo "Captação" do detalhe e as
 *    datas antigas). O dia é a parte UTC e não há hora: converter para São
 *    Paulo daria o dia anterior às 21:00;
 *  - instante, com hora de verdade (o pedido de gravação manda com -03:00). Dia
 *    e hora saem do fuso de São Paulo.
 */
export function lerMomento(valor: Valor): Momento | null {
  if (!valor) return null
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return null
  const iso = d.toISOString()
  if (iso.endsWith("T00:00:00.000Z")) return { dia: iso.slice(0, 10), hora: null }
  return { dia: dataEmSaoPaulo(d), hora: HORA_SP.format(d) }
}

/**
 * Quando é a gravação. `dataCaptacao` é o campo da operação e vence; o pedido
 * público só grava `dataEvento`. Se a captação tem só o dia e o evento cai nesse
 * mesmo dia com hora, a hora do evento completa — trocar a data pelo campo de
 * dia não pode apagar o horário que o cliente informou.
 */
export function momentoDoJob(j: { dataCaptacao?: Valor; dataEvento?: Valor }): Momento | null {
  const captacao = lerMomento(j.dataCaptacao)
  const evento = lerMomento(j.dataEvento)
  if (!captacao) return evento
  if (!captacao.hora && evento?.hora && evento.dia === captacao.dia) return evento
  return captacao
}

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

/** "Sex, 31/10 · 14:00" — ou "Sex, 31/10" quando não há hora. */
export function rotuloDoMomento(m: Momento): string {
  const [ano, mes, dia] = m.dia.split("-").map(Number)
  const semana = SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()]
  const data = `${semana}, ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`
  return m.hora ? `${data} · ${m.hora}` : data
}

/** "hoje", "amanhã", "em 3 dias", "ontem", "há 5 dias". */
export function distanciaDoMomento(m: Momento, hoje: string = hojeEmSaoPaulo()): string {
  const n = diasEntre(hoje, m.dia)
  if (n === 0) return "hoje"
  if (n === 1) return "amanhã"
  if (n === -1) return "ontem"
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`
}

/** Valor do `<input type="datetime-local">`. Sem hora, abre às 00:00. */
export function paraCampoDataHora(m: Momento | null): string {
  return m ? `${m.dia}T${m.hora ?? "00:00"}` : ""
}

/** O que o `<input type="datetime-local">` devolve, como instante de Brasília. */
export function deCampoDataHora(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null
  return new Date(`${valor}:00-03:00`).toISOString()
}

/** "N/A" e "—" são o que os formulários gravam quando não sabem a cidade. */
function textoUtil(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t && t !== "N/A" && t !== "—" && t !== "-" ? t : null
}

/** Onde: o endereço da gravação; a cidade só quando o endereço não a traz. */
export function ondeDoJob(j: {
  localGravacao?: string | null
  localEvento?: string | null
  cidade?: string | null
}): { endereco: string | null; cidade: string | null } {
  const endereco = textoUtil(j.localGravacao) ?? textoUtil(j.localEvento)
  const cidade = textoUtil(j.cidade)
  const repetida = !!endereco && !!cidade && endereco.toLowerCase().includes(cidade.toLowerCase())
  return { endereco, cidade: repetida ? null : cidade }
}

export type SituacaoDaEquipe = {
  texto: string
  /** alerta = falta alguém; espera = convite sem resposta; ok = confirmado. */
  tom: "alerta" | "espera" | "ok" | "neutro"
}

/** Em que pé está quem vai gravar. */
export function situacaoDaEquipe(statusInterno: StatusInterno, temVideomaker: boolean): SituacaoDaEquipe {
  if (!temVideomaker) {
    return statusInterno === "videomaker_recusou"
      ? { texto: "O videomaker recusou — escale outro", tom: "alerta" }
      : { texto: "Ninguém escalado ainda", tom: "alerta" }
  }
  if (statusInterno === "videomaker_notificado") return { texto: "Convite enviado, aguardando aceite", tom: "espera" }
  if (statusInterno === "captacao_realizada") return { texto: "Gravou", tom: "neutro" }
  const fase = faseDoJob(statusInterno)
  if (fase === "in_progress") return { texto: "Confirmado", tom: "ok" }
  if (fase === "pending_assignment") return { texto: "Escalado", tom: "ok" }
  return { texto: "Gravou", tom: "neutro" }
}

/** "5541998765432" → "(41) 99876-5432". Fora do formato, devolve como veio. */
export function telefoneLegivel(telefone: string | null | undefined): string | null {
  if (!telefone?.trim()) return null
  let n = telefone.replace(/\D/g, "")
  if (n.length >= 12 && n.startsWith("55")) n = n.slice(2)
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return telefone.trim()
}

/** Link do WhatsApp; número brasileiro sem DDI ganha o 55. */
export function linkWhatsapp(telefone: string | null | undefined): string | null {
  const n = telefone?.replace(/\D/g, "") ?? ""
  if (n.length < 10) return null
  return `https://wa.me/${n.length <= 11 ? `55${n}` : n}`
}

// ── A volta de uma conversão ─────────────────────────────────────────────────
// Aprovar "como Job" e "Converter em Job" trocam departamento e tipo pela marca
// de cobertura e guardam os de antes no histórico (`descricaoDaConversao`, em
// job-fase.ts): "Convertido em Job — cobertura (antes: growth / edicao)". Ao
// devolver o card para Demandas, é dali que se sabe como ele foi pedido.

const ANTES = /^Convertido em Job — cobertura \(antes: (.+) \/ (.+)\)$/

export function origemDaConversao(observacao: string | null | undefined): { departamento: string; tipoVideo: string } | null {
  const m = observacao ? ANTES.exec(observacao.trim()) : null
  if (!m) return null
  const departamento = m[1].trim(), tipoVideo = m[2].trim()
  if (departamento === "—" || tipoVideo === "—") return null
  return { departamento, tipoVideo }
}
