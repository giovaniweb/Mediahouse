"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { fetcher } from "@/lib/fetcher"

type Aresta = {
  id: string
  organizacaoDestinoId: string
  nomeDestino: string
  escopo: "acompanhar" | "executar"
  criadoEm: string
}
type Resposta = {
  papel: "dona" | "espelho"
  compartilhamentos: Aresta[]
  parceirosDisponiveis: { organizacaoId: string; nome: string }[]
}

/**
 * Terceirizar a execução deste card para uma empresa parceira.
 *
 * A lista de destinos NÃO é "todas as empresas da plataforma": são só as
 * parcerias já aceitas pelos dois lados. Sem esse aperto de mão prévio, uma
 * empresa descobriria que a outra existe no instante em que um card aparecesse
 * no quadro dela.
 *
 * Some inteira quando não há parceiro nem card terceirizado: quem nunca vai
 * terceirizar não precisa aprender que isto existe.
 */
export function EspelhoSecao({ demandaId }: { demandaId: string }) {
  const { data, mutate } = useSWR<Resposta>(`/api/demandas/${demandaId}/espelhar`, fetcher)
  const [salvando, setSalvando] = useState(false)
  const [destino, setDestino] = useState("")
  const [escopo, setEscopo] = useState<"executar" | "acompanhar">("executar")

  if (!data || data.papel !== "dona") return null
  const ativos = data.compartilhamentos ?? []
  const parceiros = data.parceirosDisponiveis ?? []
  if (ativos.length === 0 && parceiros.length === 0) return null

  async function terceirizar() {
    if (!destino) return
    setSalvando(true)
    try {
      const res = await fetch(`/api/demandas/${demandaId}/espelhar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizacaoDestinoId: destino, escopo }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "Erro ao terceirizar")
      toast.success(`Execução com ${j.nomeDestino}.`)
      setDestino("")
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao terceirizar")
    } finally {
      setSalvando(false)
    }
  }

  async function revogar(a: Aresta) {
    // O texto diz o que NÃO acontece, porque é o que as pessoas temem ao clicar
    // em algo chamado "revogar": perder o trabalho já feito.
    if (!confirm(`Revogar o acesso de ${a.nomeDestino}?\n\nO card some do quadro deles. O que já produziram — comentários, arquivos e histórico — fica.`)) return
    setSalvando(true)
    try {
      const res = await fetch(`/api/demandas/${demandaId}/espelhar?destino=${a.organizacaoDestinoId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao revogar")
      toast.success(`Acesso de ${a.nomeDestino} revogado.`)
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao revogar")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
      <h2 className="font-semibold text-zinc-300 mb-3 flex items-center gap-2">
        <span aria-hidden>🤝</span> Execução terceirizada
      </h2>

      {ativos.length > 0 && (
        <ul className="space-y-2 mb-3">
          {ativos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="block text-zinc-200 truncate">{a.nomeDestino}</span>
                <span className="text-[11px] text-zinc-500">
                  {a.escopo === "executar" ? "executa a produção" : "só acompanha"}
                </span>
              </span>
              <button
                onClick={() => revogar(a)}
                disabled={salvando}
                className="text-xs text-zinc-400 hover:text-red-400 px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-50 shrink-0"
              >
                Revogar
              </button>
            </li>
          ))}
        </ul>
      )}

      {parceiros.length > 0 ? (
        <div className="space-y-2">
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200"
          >
            <option value="">Escolher empresa parceira…</option>
            {parceiros.map((p) => (
              <option key={p.organizacaoId} value={p.organizacaoId}>{p.nome}</option>
            ))}
          </select>
          <select
            value={escopo}
            onChange={(e) => setEscopo(e.target.value as "executar" | "acompanhar")}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200"
          >
            <option value="executar">Executa a produção</option>
            <option value="acompanhar">Só acompanha</option>
          </select>
          <button
            onClick={terceirizar}
            disabled={!destino || salvando}
            className="w-full text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-100 px-3 py-1.5 rounded-lg disabled:opacity-40"
          >
            {salvando ? "Enviando…" : "Terceirizar execução"}
          </button>
          <p className="text-[11px] text-zinc-500">
            O card continua seu. Aprovação, publicação e prazo não saem da sua mão.
          </p>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          Todas as suas parcerias já executam este card.
        </p>
      )}
    </div>
  )
}
