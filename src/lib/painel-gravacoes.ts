// O painel das Gravações Externas (Giovani, 29/10/2026: "faz um dashboard
// dessas gravações"), em regras puras: a tela conta sobre a MESMA lista que o
// quadro carregou, com os mesmos filtros. Assim o número do painel e o que se
// vê no kanban nunca discordam.
//
// O que ele responde, na ordem em que a Débora pergunta:
//   quanto há em cada etapa; o que travou; o que vem nos próximos 7 dias;
//   quem gravou no mês e de que tipo; em que pé estão as notas (só para quem
//   vê nota — sem permissão, a lista nem traz custos e o bloco some).
import { dataEmSaoPaulo, diasEntre, somarDias } from "./datas"
import { momentoDoJob, type Momento } from "./ficha-do-job"
import {
  ETAPAS,
  etapaDaGravacao,
  faltaOMaterial,
  rotuloDoTipoDeGravacao,
  situacaoDaNota,
  TIPOS_DE_GRAVACAO,
  type EtapaDaGravacao,
  type PagamentoDoCard,
} from "./etapas-da-gravacao"

export type GravacaoDoPainel = Pick<PagamentoDoCard, "custos" | "notasFiscais"> & {
  id: string
  codigo: string
  titulo: string
  clienteFinalNome?: string | null
  statusInterno: string
  videomakerId?: string | null
  videomaker?: { id?: string; nome: string } | null
  dataCaptacao?: string | Date | null
  dataEvento?: string | Date | null
  tipoGravacao?: string | null
  finalizadaEm?: string | Date | null
}

export type Contagem = { id: string; label: string; demandas: number }

export type Trava = {
  id: string
  codigo: string
  cliente: string
  /** O que travou, curto: vai no selo. */
  motivo: string
  /** sobrecarga = vermelho (age hoje); atencao = âmbar. Os nomes do painel. */
  tom: "sobrecarga" | "atencao"
  dias: number
}

export type Proxima = {
  id: string
  codigo: string
  cliente: string
  momento: Momento
  tipo: string | null
  videomaker: string | null
  /** Agendada = videomaker confirmou. */
  situacao: "sem_videomaker" | "a_confirmar" | "agendada"
}

export type Painel = {
  numeros: { aAgendar: number; proximos: number; faltaMaterial: number; paraEnviar: number }
  etapas: Contagem[]
  travas: Trava[]
  proximas: Proxima[]
  mes: { total: number; porTipo: Contagem[]; porVideomaker: { id: string; nome: string; gravacoes: number }[] }
  /** null: quem olha não vê nota (a lista veio sem custos). */
  notas: { falta: number; recebida: number; compras: number; contestada: number } | null
}

/** Rótulo curto da etapa na barra do painel (a coluna do gráfico é estreita). */
const ROTULO_CURTO: Partial<Record<EtapaDaGravacao, string>> = { para_enviar: "Para enviar" }

/** Encerrada ou expirada sem entrega: fica na coluna Concluído, mas não foi feita. */
const SEM_ENTREGA = new Set(["encerrado", "expirado"])

const cliente = (g: GravacaoDoPainel) => g.clienteFinalNome?.trim() || g.titulo

function diaDe(v: string | Date | null | undefined): string | null {
  if (!v) return null
  const d = typeof v === "string" ? new Date(v) : v
  return Number.isNaN(d.getTime()) ? null : dataEmSaoPaulo(d)
}

/** A gravação está travada? Uma trava por gravação: a mais grave. */
export function travaDaGravacao(g: GravacaoDoPainel, hoje: string): Trava | null {
  const base = { id: g.id, codigo: g.codigo, cliente: cliente(g) }
  const etapa = etapaDaGravacao(g)
  const dia = momentoDoJob(g)?.dia ?? null
  if (etapa === "a_agendar") {
    if (g.statusInterno === "videomaker_recusou") return { ...base, motivo: "Videomaker recusou", tom: "sobrecarga", dias: 0 }
    // Perto da data (ou já passou) e ninguém confirmou: é a mesma janela do
    // aviso "sem videomaker" (lib/avisos-gravacao-textos.ts).
    if (dia && diasEntre(hoje, dia) <= 2) {
      const faltam = diasEntre(hoje, dia)
      return g.videomakerId
        ? { ...base, motivo: "Sem confirmação", tom: faltam <= 1 ? "sobrecarga" : "atencao", dias: faltam }
        : { ...base, motivo: "Sem videomaker", tom: "sobrecarga", dias: faltam }
    }
    return null
  }
  if (faltaOMaterial(g, hoje)) {
    const depois = dia ? Math.max(0, diasEntre(dia, hoje)) : 0
    return { ...base, motivo: depois > 0 ? `Falta o material · ${depois} ${depois === 1 ? "dia" : "dias"}` : "Falta o material",
      tom: depois >= 3 ? "sobrecarga" : "atencao", dias: depois }
  }
  if (situacaoDaNota(g)?.etapa === "contestada") return { ...base, motivo: "Nota a refazer", tom: "atencao", dias: 0 }
  return null
}

export function painelDasGravacoes(lista: GravacaoDoPainel[], hoje: string): Painel {
  const fim = somarDias(hoje, 6)
  const mes = hoje.slice(0, 7)
  const etapaDe = new Map(lista.map((g) => [g.id, etapaDaGravacao(g)]))
  // Concluído conta o mês: a coluna inteira cresce para sempre e não diz nada.
  const concluidaNoMes = (g: GravacaoDoPainel) =>
    etapaDe.get(g.id) === "concluido" && !SEM_ENTREGA.has(g.statusInterno) && diaDe(g.finalizadaEm)?.slice(0, 7) === mes

  const etapas = ETAPAS.map((e) => ({
    id: e.id,
    label: ROTULO_CURTO[e.id] ?? e.rotulo,
    demandas: e.id === "concluido" ? lista.filter(concluidaNoMes).length : lista.filter((g) => etapaDe.get(g.id) === e.id).length,
  }))

  const travas = lista
    .map((g) => travaDaGravacao(g, hoje))
    .filter((t): t is Trava => !!t)
    .sort((a, b) => (a.tom === b.tom ? b.dias - a.dias : a.tom === "sobrecarga" ? -1 : 1))

  const proximas = lista
    .flatMap((g): Proxima[] => {
      const etapa = etapaDe.get(g.id)
      const m = momentoDoJob(g)
      if (!m || m.dia < hoje || m.dia > fim || (etapa !== "a_agendar" && etapa !== "agendado")) return []
      // Já gravou (marcou realizada antes do dia): não é mais "próxima".
      if (g.statusInterno === "captacao_realizada") return []
      return [{
        id: g.id, codigo: g.codigo, cliente: cliente(g), momento: m,
        tipo: rotuloDoTipoDeGravacao(g.tipoGravacao), videomaker: g.videomaker?.nome ?? null,
        situacao: etapa === "agendado" ? "agendada" : g.videomakerId ? "a_confirmar" : "sem_videomaker",
      }]
    })
    .sort((a, b) => (a.momento.dia + (a.momento.hora ?? "99")).localeCompare(b.momento.dia + (b.momento.hora ?? "99")))

  // O mês: o que foi (ou vai ser) gravado neste mês, com videomaker confirmado.
  const doMes = lista.filter((g) => {
    const etapa = etapaDe.get(g.id)
    return momentoDoJob(g)?.dia.slice(0, 7) === mes && etapa !== "a_agendar" && !SEM_ENTREGA.has(g.statusInterno)
  })
  const porTipo = [...TIPOS_DE_GRAVACAO.map((t) => ({ id: t.id, label: t.rotulo })), { id: "", label: "Sem tipo" }]
    .map((t) => ({ ...t, demandas: doMes.filter((g) => (g.tipoGravacao ?? "") === t.id || (t.id === "" && !rotuloDoTipoDeGravacao(g.tipoGravacao))).length }))
    .filter((t) => t.demandas > 0)
  const vms = new Map<string, { id: string; nome: string; gravacoes: number }>()
  for (const g of doMes) {
    if (!g.videomakerId || !g.videomaker) continue
    const v = vms.get(g.videomakerId) ?? { id: g.videomakerId, nome: g.videomaker.nome, gravacoes: 0 }
    v.gravacoes++
    vms.set(g.videomakerId, v)
  }

  // Nota: só existe para quem a lista trouxe custos e notas (veNotaDoVideomaker).
  const comNota = lista.some((g) => Array.isArray(g.custos) && Array.isArray(g.notasFiscais))
  const notas = comNota ? { falta: 0, recebida: 0, compras: 0, contestada: 0 } : null
  if (notas) for (const g of lista) {
    const s = situacaoDaNota(g)
    if (s && s.etapa !== "paga") notas[s.etapa]++
  }

  return {
    numeros: {
      aAgendar: etapas.find((e) => e.id === "a_agendar")!.demandas,
      proximos: proximas.length,
      faltaMaterial: lista.filter((g) => faltaOMaterial(g, hoje)).length,
      paraEnviar: etapas.find((e) => e.id === "para_enviar")!.demandas,
    },
    etapas,
    travas,
    proximas,
    mes: { total: doMes.length, porTipo, porVideomaker: [...vms.values()].sort((a, b) => b.gravacoes - a.gravacoes || a.nome.localeCompare(b.nome)) },
    notas,
  }
}
