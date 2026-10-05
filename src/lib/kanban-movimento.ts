// O que o quadro precisa saber para mover um card sem bater na guarda do servidor.
//
// Arrastar para "Impedimento" no Growth dava o toast "Motivo do impedimento
// obrigatório." e nenhum lugar para escrever o motivo: a guarda
// (lib/job-transicoes.ts, código "precondicao") exige o texto e o quadro mandava
// só o status. Agora a coluna que pede texto abre um pedido curto antes de mover.
//
// O teste em tests/unit/kanban-movimento.spec.ts passa cada coluna dos dois
// quadros pela guarda: coluna nova cujo status exija algo do usuário quebra o
// teste até alguém decidir o que o quadro pergunta.
import type { StatusInterno } from "@prisma/client"

/** Quadro do Audiovisual: coluna (statusVisivel) → statusInterno aplicado ao soltar o card. */
export const AUDIOVISUAL_COLUNA_PARA_STATUS: Record<string, StatusInterno> = {
  entrada: "aguardando_triagem",
  producao: "planejamento",
  edicao: "editando",
  aprovacao: "revisao_pendente",
  para_postar: "postagem_pendente",
  finalizado: "entregue_cliente",
}

export type PedidoDeTexto = {
  titulo: string
  explicacao: string
  placeholder: string
  confirmar: string
}

/**
 * Status que só entram com um texto junto, enviado como `observacao` no PATCH
 * de status. A guarda grava esse texto (motivoImpedimento + histórico) e o
 * aviso de WhatsApp o leva adiante.
 */
export const PEDE_TEXTO: Partial<Record<StatusInterno, PedidoDeTexto>> = {
  impedimento: {
    titulo: "O que está impedindo?",
    explicacao: "O motivo fica no card e vai no aviso para a equipe.",
    placeholder: "Ex.: falta a logo em alta do cliente",
    confirmar: "Mover para Impedimento",
  },
}

export const LIMITE_MOTIVO = 500
