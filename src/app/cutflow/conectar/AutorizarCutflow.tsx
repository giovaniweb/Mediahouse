"use client"

import { useState } from "react"

export function AutorizarCutflow({ pedido }: { pedido: string }) {
  const [estado, setEstado] = useState<"parado" | "enviando" | "feito" | "erro">("parado")
  const [erro, setErro] = useState("")

  async function autorizar() {
    setEstado("enviando")
    setErro("")
    try {
      const res = await fetch("/api/cutflow/autorizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido }),
      })
      const dados = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(dados.error || "Não foi possível autorizar.")
        setEstado("erro")
        return
      }
      setEstado("feito")
    } catch {
      setErro("Sem conexão com o NuFlow. Tente de novo.")
      setEstado("erro")
    }
  }

  if (estado === "feito") {
    return <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">Computador autorizado. Pode voltar ao Premiere.</p>
  }
  return (
    <div className="space-y-2">
      <button
        onClick={autorizar}
        disabled={estado === "enviando"}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {estado === "enviando" ? "Autorizando…" : "Autorizar este computador"}
      </button>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
    </div>
  )
}
