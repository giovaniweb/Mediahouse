"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

// Briefing longo dobrado.
//
// A mediana tem 258 caracteres, mas 137 demandas passam de 400 e a maior tem
// 7.458 — nessas, o texto empurra tudo (equipe, arquivos, aprovação, comentários)
// para baixo da dobra, e quem abre a demanda para decidir algo precisa rolar
// muito antes de ver o que interessa.
//
// A alternativa seria pedir um "resumo" à parte, mas isso é campo novo que
// alguém tem de preencher — e o que ninguém preenche não resolve. Dobrar o texto
// não pede nada de ninguém e o conteúdo continua a um clique.

const LIMITE = 400

export function BriefingResumido({ texto, vazio }: { texto: string; vazio: React.ReactNode }) {
  const [aberto, setAberto] = useState(false)

  if (!texto) return <>{vazio}</>

  const longo = texto.length > LIMITE
  // Corta no fim de uma linha quando dá, para não partir a frase no meio.
  const corte = longo ? texto.slice(0, LIMITE) : texto
  const ultimaQuebra = corte.lastIndexOf("\n")
  const previa = longo
    ? (ultimaQuebra > LIMITE * 0.6 ? corte.slice(0, ultimaQuebra) : corte) + "…"
    : texto

  return (
    <span className="block">
      <span className="block text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap break-words">
        {aberto || !longo ? texto : previa}
      </span>
      {longo && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAberto((v) => !v) }}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          {aberto
            ? <><ChevronUp className="w-3 h-3" /> Mostrar menos</>
            : <><ChevronDown className="w-3 h-3" /> Ver o briefing completo ({texto.length} caracteres)</>}
        </button>
      )}
    </span>
  )
}
