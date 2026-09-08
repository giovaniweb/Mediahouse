"use client"

import { cn } from "@/lib/utils"

/**
 * A marca de que este card é executado por outra empresa.
 *
 * Um chip, um lugar, três visões (card, lista, tabela). Se cada visão tivesse a
 * sua cópia, elas divergiriam — foi o que aconteceu com o `iniciais` e com o
 * fetcher do SWR, e as duas viraram consolidação depois.
 *
 * SEM COR NOVA, de propósito. O §52 do documento de Jobs pede o contrário de
 * mais badge colorido, e o card já carrega prioridade, departamento, tipo,
 * atraso, evento, produto e postagem. A borda TRACEJADA é o sinal — ela diz
 * "este card não vive inteiro aqui" sem disputar atenção com o atraso em
 * vermelho, que é o que realmente precisa ser visto primeiro.
 */
export type EspelhoDoCard = {
  papel: "origem" | "destino"
  contraparte: string
  escopo: "acompanhar" | "executar"
}

export function TagEspelho({ espelho, className }: { espelho?: EspelhoDoCard | null; className?: string }) {
  if (!espelho) return null

  const daOrigem = espelho.papel === "origem"
  const soAcompanha = espelho.escopo === "acompanhar"

  // Da origem: "quem está fazendo isto por mim". Do destino: "de quem é isto".
  // São perguntas diferentes, e por isso o rótulo não é o mesmo dos dois lados.
  const texto = daOrigem ? `Terceirizado · ${espelho.contraparte}` : `Origem: ${espelho.contraparte}`

  const titulo = daOrigem
    ? soAcompanha
      ? `${espelho.contraparte} acompanha este card. A execução continua sua.`
      : `Executado por ${espelho.contraparte}. Você continua dona do card: aprovação, publicação e prazo são seus.`
    : soAcompanha
      ? `Card de ${espelho.contraparte}. Você acompanha; nada aqui é editável.`
      : `Card de ${espelho.contraparte}. Você executa a produção; aprovação e entrega são da origem.`

  return (
    <span
      title={titulo}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded",
        "border border-dashed border-zinc-500/70 bg-zinc-800/60 text-zinc-300",
        "max-w-[170px] truncate",
        soAcompanha && "opacity-70",
        className
      )}
    >
      <span aria-hidden>🤝</span>
      {soAcompanha && <span aria-hidden>🔒</span>}
      <span className="truncate">{texto}</span>
    </span>
  )
}


/**
 * A faixa no topo do card aberto.
 *
 * Existe para responder, antes de qualquer botão, a pergunta que a tag só
 * insinua: o que EU posso fazer aqui? Sem ela, quem executa descobre a fronteira
 * apertando um botão e recebendo erro — que é a pior forma de aprender uma regra.
 */
export function FaixaEspelho({ espelho }: { espelho?: EspelhoDoCard | null }) {
  if (!espelho) return null
  const daOrigem = espelho.papel === "origem"
  const soAcompanha = espelho.escopo === "acompanhar"

  const titulo = daOrigem
    ? `Execução terceirizada para ${espelho.contraparte}`
    : `Card de ${espelho.contraparte}`

  const explicacao = daOrigem
    ? soAcompanha
      ? `${espelho.contraparte} acompanha este card e não altera nada. A execução continua com a sua equipe.`
      : `${espelho.contraparte} executa a produção e move o card. O briefing, o prazo, a aprovação e a publicação continuam seus — e você recebe aviso a cada movimento.`
    : soAcompanha
      ? `Você acompanha este card. Nada aqui é editável.`
      : `Você executa a produção: captação, edição e entrega do material. Briefing, prazo, aprovação e publicação são de ${espelho.contraparte}.`

  return (
    <div className="rounded-lg border border-dashed border-zinc-600 bg-zinc-900/60 px-3.5 py-2.5 mb-4">
      <p className="text-sm font-medium text-zinc-200 flex items-center gap-1.5">
        <span aria-hidden>🤝</span> {titulo}
      </p>
      <p className="text-xs text-zinc-400 mt-0.5">{explicacao}</p>
    </div>
  )
}
