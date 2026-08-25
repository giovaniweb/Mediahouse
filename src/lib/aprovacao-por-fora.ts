// A saída para quando a aprovação já aconteceu (ou vai acontecer) fora do NuFlow.
//
// A regra que exige a arte antes de "Para aprovação" existe para o card não
// mentir: um card naquela coluna deveria significar "o cliente está olhando".
// Só que nem sempre o caminho é o do sistema — o cliente aprovou por WhatsApp, a
// peça foi por e-mail, alguém mostrou na reunião. Nesses casos travar não
// protege ninguém: só empurra o trabalho para fora do NuFlow, que é o oposto do
// que ele existe para fazer.
//
// Por que MOTIVO e não uma caixa de "continuar mesmo assim": um "ok" não carrega
// informação e não deixa rastro — depois de clicado o card fica idêntico a um
// que foi enviado de verdade, que é exatamente a falha de 16/08/2026. Escolher
// entre quatro opções custa quase o mesmo e responde "qual é o caso", que é o
// que alguém vai querer saber daqui a duas semanas.
//
// O uso disto é medição, não só permissão: se a maioria dos movimentos passar
// por aqui, a regra está errada e deve cair — não ser contornada todo dia.

export interface MotivoAprovacaoPorFora {
  valor: string
  label: string
  /** Exige o texto livre: "outro" sem explicação é a caixa de continuar de novo. */
  exigeDetalhe?: boolean
}

export const MOTIVOS_APROVACAO_POR_FORA: MotivoAprovacaoPorFora[] = [
  { valor: "aprovado_whatsapp", label: "O cliente já aprovou por WhatsApp" },
  { valor: "enviado_email",     label: "A peça foi enviada por e-mail" },
  { valor: "aprovado_reuniao",  label: "Aprovado em reunião ou pessoalmente" },
  { valor: "outro",             label: "Outro motivo", exigeDetalhe: true },
]

export function motivoDe(valor: string): MotivoAprovacaoPorFora | undefined {
  return MOTIVOS_APROVACAO_POR_FORA.find((m) => m.valor === valor)
}

/**
 * O motivo está completo o bastante para dispensar a arte?
 *
 * Motivo desconhecido NÃO passa: aqui o default é o contrário do
 * `entregaPecaVisual` porque o risco é outro — lá o excesso de rigor prendia
 * trabalho legítimo, aqui o excesso de frouxidão devolve o card que mente.
 */
export function motivoAceitavel(valor: unknown, detalhe?: unknown): boolean {
  if (typeof valor !== "string") return false
  const motivo = motivoDe(valor)
  if (!motivo) return false
  if (!motivo.exigeDetalhe) return true
  return typeof detalhe === "string" && detalhe.trim().length >= 3
}

/** A frase que fica no histórico da demanda — quem ler daqui a um mês entende. */
export function descreverMotivo(valor: string, detalhe?: string | null): string {
  const motivo = motivoDe(valor)
  const base = motivo?.label ?? "Aprovação combinada fora do sistema"
  const extra = detalhe?.trim()
  return extra ? `Aprovação por fora — ${base}: ${extra}` : `Aprovação por fora — ${base}`
}
