// "Meus Pedidos": o andamento do que a pessoa pediu, sem quadro (Giovani,
// 29/10/2026: "o Lucas é do sucesso do cliente, gostaria de acompanhar a
// solicitação dele… só o status mesmo").
//
// Função pura: a rota (/api/meus-pedidos) busca, isto traduz. As palavras são
// as de quem acompanha de fora, as mesmas da página pública /d/<token>; a
// gravação externa usa a frase e a linha do tempo de acompanhamentoDaGravacao.
import { AGUARDANDO_APROVACAO } from "./job-fase"
import { estaAtrasada } from "./status"
import { acompanhamentoDaGravacao, type GravacaoParaAcompanhar } from "./acompanhamento-gravacao"
import type { StatusInterno } from "@prisma/client"

export const ETAPAS_DO_PEDIDO = [
  { id: "entrada", rotulo: "Recebido" },
  { id: "producao", rotulo: "Em produção" },
  { id: "edicao", rotulo: "Em edição" },
  { id: "aprovacao", rotulo: "Em aprovação" },
  { id: "para_postar", rotulo: "Aprovado" },
  { id: "finalizado", rotulo: "Entregue" },
] as const

export type PassoDoPedido = { rotulo: string; estado: "feito" | "agora" | "depois" | "pulado" }

export type ResumoDoPedido = {
  /** A frase que a pessoa veio buscar. */
  situacao: string
  /** `voce`: a próxima jogada é de quem pediu (aprovar a entrega). */
  tom: "andamento" | "ok" | "alerta" | "voce"
  passos: PassoDoPedido[]
  aberto: boolean
  esperandoVoce: boolean
  atrasada: boolean
  /** Só na gravação externa: quando e onde, já em texto. */
  quando: string | null
  onde: string | null
}

export type PedidoParaResumir = GravacaoParaAcompanhar & {
  statusVisivel: string
  dataLimite?: string | Date | null
  /** A gravação externa mora no quadro de Jobs (lib/quadro-do-card.ts). */
  ehGravacao: boolean
  /** Quem pediu pode aprovar esta entrega (lib/quem-aprova.ts). */
  podeAprovar: boolean
  /** Há uma versão com aprovação pendente — o que responder-entrega aprova. */
  entregaPendente: boolean
}

export function resumoDoPedido(p: PedidoParaResumir, hoje: string): ResumoDoPedido {
  const encerrado = p.statusInterno === "encerrado" || p.statusInterno === "expirado"
  const aberto = p.statusVisivel !== "finalizado" && !encerrado
  // A coluna sozinha não basta: ajuste pedido e impedimento também moram em
  // "aprovacao", e aí a próxima jogada é de quem edita, não de quem pediu.
  const esperandoVoce = aberto && p.podeAprovar && p.entregaPendente
  const atrasada = aberto && estaAtrasada(p)

  if (p.ehGravacao) {
    const g = acompanhamentoDaGravacao(p, hoje)
    const passos = (g.trilha ?? []).map(({ rotulo, estado }) => ({ rotulo, estado }))
    return {
      situacao: esperandoVoce ? "Vídeo pronto, esperando sua aprovação" : g.situacao,
      tom: esperandoVoce ? "voce" : g.tom,
      passos, aberto, esperandoVoce, atrasada, quando: g.quando, onde: g.onde,
    }
  }

  const base = { aberto, esperandoVoce, atrasada, quando: null, onde: null }
  // Recusado na aprovação: encerrado sem nunca sair da entrada.
  if (encerrado && p.statusVisivel === "entrada") return { ...base, situacao: "Pedido não aprovado", tom: "alerta", passos: [] }
  if (encerrado && p.statusInterno === "expirado") return { ...base, situacao: "Pedido encerrado", tom: "alerta", passos: [] }

  const atual = Math.max(0, ETAPAS_DO_PEDIDO.findIndex((e) => e.id === p.statusVisivel))
  const passos: PassoDoPedido[] = ETAPAS_DO_PEDIDO.map((e, i) => ({
    rotulo: e.rotulo,
    // Entregue é ponto final: não fica "agora" para sempre.
    estado: i < atual || p.statusVisivel === "finalizado" ? "feito" : i === atual ? "agora" : "depois",
  }))

  if (AGUARDANDO_APROVACAO.includes(p.statusInterno as StatusInterno)) {
    return { ...base, situacao: "Pedido em análise", tom: "andamento", passos }
  }
  if (esperandoVoce) return { ...base, situacao: "Vídeo pronto, esperando sua aprovação", tom: "voce", passos }
  if (p.statusInterno === "ajuste_solicitado") return { ...base, situacao: "Ajuste pedido, em correção", tom: "andamento", passos }
  if (p.statusVisivel === "finalizado") return { ...base, situacao: "Entregue", tom: "ok", passos }
  return { ...base, situacao: ETAPAS_DO_PEDIDO[atual].rotulo, tom: "andamento", passos }
}
