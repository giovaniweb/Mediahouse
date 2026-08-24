"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  Target, ChevronDown, ChevronUp, X, ArrowRight, AlertTriangle,
  CheckCircle2, Circle, Loader2, ListChecks,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { estaAtrasada, diasDeAtraso } from "@/lib/status"
import { fetcher } from "@/lib/fetcher"
import { formatarDataCurta } from "@/lib/datas"


// Painel recolhível no canto: em que a pessoa está agora e o que atacar depois.
//
// Fica fora das telas de demanda de propósito — a ideia é acompanhar o trabalho
// sem ter de voltar ao quadro. Recolhido, é uma pastilha; aberto, cabe numa
// olhada. O estado (aberto/fechado) é lembrado entre sessões.

interface DemandaFoco {
  id: string
  codigo: string
  titulo: string
  statusVisivel: string
  prioridade: string
  dataLimite: string | null
}

interface ItemChecklist {
  id: string
  texto: string
  concluido: boolean
}

const CHAVE_ABERTO = "nuflow:painel-executor-aberto"

function Prazo({ d }: { d: DemandaFoco }) {
  const atrasada = estaAtrasada(d)
  const dias = diasDeAtraso(d)
  if (atrasada) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-400">
        <AlertTriangle className="w-3 h-3" />
        {dias ? `${dias}d de atraso` : "atrasada"}
      </span>
    )
  }
  if (!d.dataLimite) return <span className="text-[10px] text-zinc-600">sem prazo</span>
  return (
    <span className="text-[10px] text-zinc-500">
      até {formatarDataCurta(d.dataLimite)}
    </span>
  )
}

export function PainelExecutor() {
  const [aberto, setAberto] = useState(false)
  const [trocando, setTrocando] = useState(false)

  const { data, mutate } = useSWR<{
    emFoco: DemandaFoco | null
    sugeridas: DemandaFoco[]
    totalAbertas: number
    atrasadas: number
  }>("/api/foco", fetcher, { refreshInterval: 60000 })

  const emFoco = data?.emFoco ?? null

  // Checklist só é buscado quando há foco e o painel está aberto — não faz
  // sentido carregar para quem deixou recolhido.
  const { data: dataCheck, mutate: mutateCheck } = useSWR<{ itens: ItemChecklist[] }>(
    aberto && emFoco ? `/api/demandas/${emFoco.id}/checklist` : null, fetcher
  )
  const itens = dataCheck?.itens ?? []

  useEffect(() => {
    setAberto(localStorage.getItem(CHAVE_ABERTO) === "1")
  }, [])

  function alternar() {
    // O valor novo é calculado FORA do atualizador: o React pode chamar a função
    // de atualização mais de uma vez, e gravar no localStorage lá dentro deixaria
    // o registro fora de sincronia com o que está na tela.
    const proximo = !aberto
    setAberto(proximo)
    localStorage.setItem(CHAVE_ABERTO, proximo ? "1" : "0")
  }

  async function focar(demandaId: string | null) {
    setTrocando(true)
    try {
      await fetch("/api/foco", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandaId }),
      })
      await mutate()
    } finally {
      setTrocando(false)
    }
  }

  async function marcarItem(itemId: string, concluido: boolean) {
    if (!emFoco) return
    await fetch(`/api/demandas/${emFoco.id}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, concluido }),
    })
    mutateCheck()
  }

  // Sem nada em aberto não há o que sugerir — o painel some em vez de ocupar
  // espaço dizendo que está vazio.
  if (!data || (data.totalAbertas === 0 && !emFoco)) return null

  const feitos = itens.filter((i) => i.concluido).length

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[19rem] max-w-[calc(100vw-2rem)]">
      <div className="rounded-xl border border-zinc-700 bg-zinc-900/95 backdrop-blur shadow-2xl shadow-black/50 overflow-hidden">
        {/* Cabeçalho — clicável inteiro para abrir/fechar */}
        <button
          onClick={alternar}
          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/60 transition-colors text-left"
        >
          <Target className={cn("w-4 h-4 shrink-0", emFoco ? "text-purple-400" : "text-zinc-500")} />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-zinc-200 truncate">
              {emFoco ? emFoco.titulo : "No que você está?"}
            </span>
            <span className="block text-[10px] text-zinc-500">
              {emFoco
                ? emFoco.codigo
                : `${data.totalAbertas} em aberto${data.atrasadas > 0 ? ` · ${data.atrasadas} atrasada(s)` : ""}`}
            </span>
          </span>
          {aberto ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                  : <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />}
        </button>

        {aberto && (
          <div className="border-t border-zinc-800 max-h-[26rem] overflow-y-auto">
            {emFoco && (
              <div className="p-3 border-b border-zinc-800 bg-purple-500/5">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-300">
                    Trabalhando agora
                  </span>
                  <button
                    onClick={() => focar(null)}
                    disabled={trocando}
                    title="Parar de focar nesta demanda"
                    className="text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <Link
                  href={`/demandas/${emFoco.id}`}
                  className="block text-sm text-zinc-100 hover:text-purple-300 transition-colors leading-snug"
                >
                  {emFoco.titulo}
                </Link>
                <div className="mt-1"><Prazo d={emFoco} /></div>

                {itens.length > 0 && (
                  <div className="mt-2.5">
                    <p className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1.5">
                      <ListChecks className="w-3 h-3" /> {feitos} de {itens.length} no checklist
                    </p>
                    <ul className="space-y-1">
                      {itens.slice(0, 6).map((i) => (
                        <li key={i.id}>
                          <button
                            onClick={() => marcarItem(i.id, !i.concluido)}
                            className="w-full text-left flex items-start gap-1.5 group/item"
                          >
                            {i.concluido
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-px" />
                              : <Circle className="w-3.5 h-3.5 text-zinc-600 group-hover/item:text-zinc-400 shrink-0 mt-px" />}
                            <span className={cn("text-[11px] leading-snug",
                              i.concluido ? "text-zinc-600 line-through" : "text-zinc-300")}>
                              {i.texto}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                {emFoco ? "Depois desta" : "Sugestão do que atacar"}
              </p>

              {data.sugeridas.length === 0 ? (
                <p className="text-[11px] text-zinc-600">Nada pendente do seu lado.</p>
              ) : (
                <ul className="space-y-1">
                  {data.sugeridas.map((d) => (
                    <li key={d.id}>
                      <button
                        onClick={() => focar(d.id)}
                        disabled={trocando}
                        className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors group/sug disabled:opacity-50"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11px] text-zinc-300 leading-snug line-clamp-2">{d.titulo}</span>
                          <Prazo d={d} />
                        </span>
                        {trocando
                          ? <Loader2 className="w-3.5 h-3.5 text-zinc-600 animate-spin shrink-0 mt-0.5" />
                          : <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover/sug:text-purple-400 transition-colors shrink-0 mt-0.5" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-[10px] text-zinc-600 mt-2.5 leading-relaxed">
                Ordem: atrasadas primeiro, depois prazo mais próximo, depois prioridade.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
