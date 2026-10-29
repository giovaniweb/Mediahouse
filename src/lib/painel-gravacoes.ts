// O painel das Gravações Externas, em regras puras: alertas do que precisa ser
// feito (Giovani, 29/10/2026: "bater o olho e falar: tem que despachar isso").
// Nada de gráfico para encher: cada alerta é uma ação, com a contagem e as
// gravações para abrir na hora. Depois ele vai sofisticando.
//
// Conta sobre a lista do quadro inteira (sem os recortes de Hoje, Minhas…): o
// painel responde "o que está pendente", não "o que este filtro mostra". Os
// alertas de nota e pagamento só existem para quem vê nota — sem a permissão,
// a lista nem traz custos (veNotaDoVideomaker).
import { diasEntre } from "./datas"
import { momentoDoJob, rotuloDoMomento } from "./ficha-do-job"
import { diasDeAtraso, estaAtrasada } from "./status"
import { etapaDaGravacao, faltaOMaterial, situacaoDaNota, type PagamentoDoCard } from "./etapas-da-gravacao"

export type GravacaoDoPainel = Pick<PagamentoDoCard, "custos" | "notasFiscais"> & {
  id: string
  codigo: string
  titulo: string
  clienteFinalNome?: string | null
  statusInterno: string
  statusVisivel?: string | null
  videomakerId?: string | null
  videomaker?: { nome: string } | null
  dataCaptacao?: string | Date | null
  dataEvento?: string | Date | null
  dataLimite?: string | Date | null
}

export type IdDoAlerta =
  | "sem_videomaker" | "sem_confirmacao" | "material_atrasado" | "edicao_atrasada" | "para_enviar"
  | "nota_falta" | "nota_compras" | "nota_refazer" | "pagamento"

export type ItemDoAlerta = { id: string; codigo: string; cliente: string; detalhe: string | null }

export type Alerta = {
  id: IdDoAlerta
  titulo: string
  /** O que fazer, numa frase. */
  acao: string
  /** urgente = vermelho; atencao = âmbar. */
  tom: "urgente" | "atencao"
  itens: ItemDoAlerta[]
}

const cliente = (g: GravacaoDoPainel) => g.clienteFinalNome?.trim() || g.titulo
const quando = (g: GravacaoDoPainel) => {
  const m = momentoDoJob(g)
  return m ? rotuloDoMomento(m) : "sem data"
}
const vm = (g: GravacaoDoPainel) => g.videomaker?.nome?.trim() || "videomaker"
const junta = (...partes: (string | null | false | undefined)[]) => partes.filter(Boolean).join(" · ") || null
/** A gravação mais perto da data vem primeiro; sem data, por último. */
const porData = (a: GravacaoDoPainel, b: GravacaoDoPainel) =>
  (momentoDoJob(a)?.dia ?? "9999").localeCompare(momentoDoJob(b)?.dia ?? "9999")

export function alertasDasGravacoes(lista: GravacaoDoPainel[], hoje: string): Alerta[] {
  const item = (g: GravacaoDoPainel, detalhe: string | null): ItemDoAlerta => ({ id: g.id, codigo: g.codigo, cliente: cliente(g), detalhe })
  const naEtapa = (e: ReturnType<typeof etapaDaGravacao>) => lista.filter((g) => etapaDaGravacao(g) === e)
  const aAgendar = naEtapa("a_agendar").sort(porData)
  const recusou = (g: GravacaoDoPainel) => g.statusInterno === "videomaker_recusou"

  const alertas: Alerta[] = [
    {
      id: "sem_videomaker", titulo: "Sem videomaker", acao: "Escalar quem vai gravar.", tom: "urgente",
      itens: aAgendar.filter((g) => !g.videomakerId || recusou(g)).map((g) => item(g, junta(recusou(g) && `${vm(g)} recusou`, quando(g)))),
    },
    {
      id: "sem_confirmacao", titulo: "Esperando o videomaker confirmar", acao: "Cobrar a resposta do convite.", tom: "atencao",
      itens: aAgendar.filter((g) => g.videomakerId && !recusou(g)).map((g) => item(g, junta(vm(g), quando(g)))),
    },
    {
      id: "material_atrasado", titulo: "Material atrasado", acao: "Cobrar os brutos do videomaker.", tom: "urgente",
      itens: lista.filter((g) => faltaOMaterial(g, hoje)).sort(porData).map((g) => {
        const dia = momentoDoJob(g)?.dia
        const depois = dia ? diasEntre(dia, hoje) : 0
        return item(g, junta(vm(g), depois > 0 ? `gravou há ${depois} ${depois === 1 ? "dia" : "dias"}` : "gravou hoje"))
      }),
    },
    {
      id: "edicao_atrasada", titulo: "Edição atrasada", acao: "Ver com quem está editando.", tom: "urgente",
      itens: naEtapa("em_edicao").filter(estaAtrasada).map((g) => {
        const dias = diasDeAtraso(g)
        return item(g, dias ? `${dias} ${dias === 1 ? "dia" : "dias"} de atraso` : "prazo vencido")
      }),
    },
    {
      id: "para_enviar", titulo: "Para enviar ao cliente", acao: "Mandar o vídeo e marcar como enviado.", tom: "atencao",
      itens: naEtapa("para_enviar").sort(porData).map((g) => item(g, `gravado ${quando(g)}`)),
    },
  ]

  // Nota e pagamento: só quando a lista trouxe custos e notas.
  if (lista.some((g) => Array.isArray(g.custos) && Array.isArray(g.notasFiscais))) {
    const naNota = (etapa: string) => lista.filter((g) => situacaoDaNota(g)?.etapa === etapa).sort(porData)
    alertas.push(
      { id: "nota_compras", titulo: "Nota para enviar a compras", acao: "Encaminhar a nota ao setor de compras.", tom: "urgente",
        itens: naNota("recebida").map((g) => item(g, vm(g))) },
      { id: "nota_refazer", titulo: "Nota a refazer", acao: "Pedir a nota corrigida ao videomaker.", tom: "urgente",
        itens: naNota("contestada").map((g) => item(g, vm(g))) },
      { id: "nota_falta", titulo: "Falta a nota do videomaker", acao: "Cobrar a nota do videomaker.", tom: "atencao",
        itens: naNota("falta").map((g) => item(g, vm(g))) },
      { id: "pagamento", titulo: "Pagamento a fazer", acao: "Compras ainda não pagou: marcar como paga quando pagar.", tom: "atencao",
        itens: naNota("compras").map((g) => item(g, vm(g))) },
    )
  }
  return alertas
}
