"use client"
// Passa os dados sensíveis (PIX, dados bancários, segredos do WhatsApp e do
// e-mail) para a chave própria. Dois passos: conferir quanto falta, depois
// aplicar. Ver src/lib/recifrar.ts.
import { useState } from "react"
import { toast } from "sonner"

type Resultado = { aplicado: boolean; pendentes: number; recifrados: number; ilegiveis: number }

export function RecifrarDados() {
  const [res, setRes] = useState<Resultado | null>(null)
  const [rodando, setRodando] = useState(false)

  async function rodar(aplicar: boolean) {
    if (aplicar && !confirm("Recifrar todos os dados sensíveis com a chave nova agora?")) return
    setRodando(true)
    try {
      const r = await fetch("/api/admin/recifrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aplicar }) })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(data.error || "Não foi possível rodar."); return }
      setRes(data)
    } finally {
      setRodando(false)
    }
  }

  return (
    <section className="mx-4 md:mx-8 mt-10 mb-12 border border-zinc-800 rounded-xl p-5 max-w-xl">
      <h2 className="text-sm font-semibold text-zinc-100">Chave dos dados sensíveis</h2>
      <p className="text-xs text-zinc-500 mt-1">
        Passa PIX, dados bancários e segredos para a chave própria. Depois disso, trocar o segredo do login não apaga mais nada.
      </p>
      <div className="flex gap-2 mt-4">
        <button type="button" disabled={rodando} onClick={() => rodar(false)} className="text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 rounded-lg disabled:opacity-50">Conferir</button>
        <button type="button" disabled={rodando || !res || res.pendentes === 0} onClick={() => rodar(true)} className="text-xs bg-purple-600 text-white hover:bg-purple-500 px-3 py-1.5 rounded-lg disabled:opacity-50">Recifrar agora</button>
      </div>
      {res && (
        <p className="text-xs text-zinc-400 mt-3">
          {res.aplicado
            ? `Recifrados: ${res.recifrados}. Ilegíveis (não mexidos): ${res.ilegiveis}.`
            : `Faltam ${res.pendentes} dado(s) no formato antigo${res.ilegiveis ? `, ${res.ilegiveis} ilegível(is)` : ""}.`}
        </p>
      )}
    </section>
  )
}
