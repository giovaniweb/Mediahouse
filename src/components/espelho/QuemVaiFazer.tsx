"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { UserCheck } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

type Resposta = {
  executor: { id: string; nome: string } | null
  opcoes: { id: string; nome: string; temLogin: boolean }[]
}

/**
 * "Quem da equipe vai fazer": a empresa que recebeu a gravação por espelho
 * escolhe quem faz. Só a gestão dela vê isto (a rota responde 403/404 aos
 * outros). A escolha é dela: a empresa que pediu continua vendo só o
 * videomaker que escalou.
 */
export function QuemVaiFazer({ demandaId, nomeDona }: { demandaId: string; nomeDona: string }) {
  const { data, mutate } = useSWR<Resposta>(`/api/demandas/${demandaId}/executor`, fetcher, { shouldRetryOnError: false })
  const [salvando, setSalvando] = useState(false)
  if (!data?.opcoes) return null

  async function escolher(videomakerId: string) {
    setSalvando(true)
    try {
      const res = await fetch(`/api/demandas/${demandaId}/executor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videomakerId: videomakerId || null }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "Não foi possível salvar")
      toast.success(j.executor ? `${j.executor.nome} vai fazer esta gravação.` : "Ninguém escolhido.")
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
      <p className="text-sm font-medium text-zinc-200 flex items-center gap-1.5">
        <UserCheck className="w-4 h-4 text-[#b398ff]" aria-hidden /> Quem da equipe vai fazer
      </p>
      <p className="text-xs text-zinc-500 mt-0.5">
        Quem você escolher vê a gravação em Minhas Gravações, capta e entrega o material. Para {nomeDona}, quem faz continua sendo você.
      </p>
      {data.opcoes.length === 0 ? (
        <p className="text-xs text-zinc-400 mt-3">Cadastre os videomakers da sua equipe (com login) para escolher aqui.</p>
      ) : (
        <select
          aria-label="Quem da equipe vai fazer"
          value={data.executor?.id ?? ""}
          disabled={salvando}
          onChange={(e) => void escolher(e.target.value)}
          className="mt-3 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200"
        >
          <option value="">Ninguém ainda</option>
          {data.opcoes.map((o) => (
            <option key={o.id} value={o.id}>{o.nome}{o.temLogin ? "" : " (sem login)"}</option>
          ))}
        </select>
      )}
    </div>
  )
}
