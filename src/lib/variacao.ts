// Variação de texto nas mensagens automáticas.
//
// Receber a mesma frase toda vez faz o aviso virar paisagem — a pessoa para de
// ler porque já sabe o que está escrito. Variar resolve isso, mas só onde o
// texto é celebração ou rotina.
//
// ONDE NÃO VARIAR, e o motivo:
//   • mensagem de ação ("responda SIM para confirmar") — a pessoa reconhece o
//     padrão de relance e o sistema depende da resposta exata. Variar a
//     instrução é convidar erro.
//   • impedimento e cobrança — assunto sério não combina com tom rotativo.
//
// A escolha é DETERMINÍSTICA por semente, não aleatória: a mesma demanda no
// mesmo estado devolve sempre o mesmo texto. Sem isso, reenviar ou reprocessar
// um aviso mudaria a frase e daria a impressão de duas coisas diferentes.

/** Hash estável de string — mesma semente, mesmo índice, sempre. */
function indiceDe(semente: string, total: number): number {
  let h = 0
  for (let i = 0; i < semente.length; i++) h = (h * 31 + semente.charCodeAt(i)) >>> 0
  return total > 0 ? h % total : 0
}

/** Escolhe uma variante de forma estável para a semente dada. */
export function variar(opcoes: string[], semente: string): string {
  if (opcoes.length === 0) return ""
  return opcoes[indiceDe(semente, opcoes.length)]
}

// ─── Dicas de bem-estar ──────────────────────────────────────────────────────
//
// Entram SÓ no bom-dia, uma vez por dia. Espalhar conselho por toda mensagem
// operacional é o caminho mais curto para a equipe parar de ler todas elas.
//
// Tom: quem trabalha em pé, carregando equipamento e editando de madrugada.
// Nada de frase de autoajuda — coisa prática que cabe no dia.
const DICAS_BEM_ESTAR = [
  "Bebe água antes do primeiro café ☕",
  "Levanta e alonga a cada hora de edição — as costas agradecem 🧘",
  "Olhou pra tela 20 minutos? Olha 20 segundos pra longe. Vale pros olhos 👀",
  "Almoça longe do computador hoje 🍽️",
  "Se der, dorme 15 min depois do almoço. Rende mais que o terceiro café 😴",
  "Carrega a bateria da câmera e a sua também: uma caminhada curta já conta 🚶",
  "Fone com música boa deixa a edição mais leve 🎧",
  "Fecha o notebook no fim do dia. Amanhã tem mais 🌙",
  "Ombro tenso? Solta a mandíbula, respira fundo três vezes 💆",
  "Come alguma fruta hoje, nem que seja a banana da padaria 🍌",
]

/**
 * A dica do dia — a mesma para todo mundo, muda quando o dia muda.
 *
 * A semente é a data, então quem receber dois avisos no mesmo dia vê a mesma
 * dica, e não uma coleção de conselhos diferentes.
 */
export function dicaDoDia(dia: string): string {
  return variar(DICAS_BEM_ESTAR, dia)
}

export const TOTAL_DICAS = DICAS_BEM_ESTAR.length
