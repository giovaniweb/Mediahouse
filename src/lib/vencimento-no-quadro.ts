// A ordem dos cards em cada coluna do quadro de Gravações Externas.
//
// Giovani, 05/11/2026: "organizar os card de acordo com vencimento, por exemplo
// card A vence hoje e Card B vence amanha. O card A fica em cima do card B".
//
// Cada card tem uma data que manda, a mesma que ele mostra:
//   - antes da gravação (A agendar, Agendado): o dia E a hora da gravação —
//     hoje às 9h acima de hoje às 14h, acima de amanhã. No mesmo dia, sem hora
//     vai depois das que têm hora;
//   - depois dela (Em edição, Para enviar): o prazo do card.
//
// A ordem:
//   1. atrasado (prazo vencido, lib/status.ts) no topo, do que venceu primeiro;
//   2. depois a data que manda, da mais cedo para a mais tarde;
//   3. sem data, no fim;
//   4. empate: urgente na frente, depois o prazo, depois quem gravou primeiro
//      (sem prazo, é quem espera há mais tempo), depois o código.
//
// Concluído não vence: ali fica a gravação mais recente em cima. Pela regra do
// prazo, a coluna abriria com cards de março.
//
// Urgente só desempata (decisão de 05/11): a data é um fato, e a marca de
// urgente é posta na criação e fica — um urgente da semana que vem passaria na
// frente do que vence hoje, que é o contrário do pedido.
//
// Sem import de runtime do Prisma: este módulo vai para o navegador.
import { dataCalendario } from "./datas"
import { momentoDoJob } from "./ficha-do-job"
import { estaAtrasada } from "./status"
import type { EtapaDaGravacao } from "./etapas-da-gravacao"

type Valor = string | Date | null | undefined

export type CardParaOrdenar = {
  codigo?: string | null
  prioridade?: string | null
  dataLimite?: Valor
  statusVisivel?: string | null
  dataCaptacao?: Valor
  dataEvento?: Valor
}

/** As colunas em que a gravação ainda vai acontecer: vale a data dela. */
export const PELA_GRAVACAO: EtapaDaGravacao[] = ["a_agendar", "agendado"]

const prazoDe = (c: CardParaOrdenar) => (c.dataLimite ? dataCalendario(c.dataLimite) : null)
const gravacaoDe = (c: CardParaOrdenar) => {
  const m = momentoDoJob(c)
  return m ? `${m.dia}T${m.hora ?? "24:00"}` : null
}

/**
 * A data que manda neste card, nesta coluna, numa chave que ordena como texto:
 * "AAAA-MM-DDTHH:MM". Sem hora, "T24:00" (depois das horas do dia). null = sem data.
 */
export function vencimentoNoQuadro(card: CardParaOrdenar, etapa: EtapaDaGravacao): string | null {
  if (PELA_GRAVACAO.includes(etapa)) return gravacaoDe(card)
  const prazo = prazoDe(card)
  return prazo ? `${prazo}T24:00` : null
}

const antes = (a: string | null, b: string | null) => {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a < b ? -1 : 1
}

/** Compara dois cards da mesma coluna: negativo, o primeiro fica em cima. */
export function compararNaColuna(etapa: EtapaDaGravacao) {
  if (etapa === "concluido") return (a: CardParaOrdenar, b: CardParaOrdenar): number => {
    const ga = gravacaoDe(a), gb = gravacaoDe(b)
    if (ga !== gb) return ga === null ? 1 : gb === null ? -1 : ga < gb ? 1 : -1
    return (a.codigo ?? "").localeCompare(b.codigo ?? "")
  }
  return (a: CardParaOrdenar, b: CardParaOrdenar): number => {
    const atrA = estaAtrasada(a), atrB = estaAtrasada(b)
    if (atrA !== atrB) return atrA ? -1 : 1
    if (atrA) {
      const p = antes(prazoDe(a), prazoDe(b))
      if (p) return p
    }
    const v = antes(vencimentoNoQuadro(a, etapa), vencimentoNoQuadro(b, etapa))
    if (v) return v
    const urgA = a.prioridade === "urgente", urgB = b.prioridade === "urgente"
    if (urgA !== urgB) return urgA ? -1 : 1
    const p = antes(prazoDe(a), prazoDe(b))
    if (p) return p
    const g = antes(gravacaoDe(a), gravacaoDe(b))
    if (g) return g
    return (a.codigo ?? "").localeCompare(b.codigo ?? "")
  }
}

/** Os cards da coluna, na ordem do vencimento. Não muda a lista recebida. */
export function ordenarColuna<T extends CardParaOrdenar>(cards: readonly T[], etapa: EtapaDaGravacao): T[] {
  return [...cards].sort(compararNaColuna(etapa))
}
