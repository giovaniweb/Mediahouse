"use client"

// "Marcar como postado", dentro do detalhe (aba Aprovação). Antes só existia no
// card da coluna Para Postar; quem abria a demanda aprovada não tinha onde
// registrar a postagem. Mesmo pedido do card: status "postado", onde foi e o link.
import { useState } from "react"
import { toast } from "sonner"
import { Send } from "lucide-react"
import { cn } from "@/lib/utils"
import surface from "./DemandSurface.module.css"

const ONDE = ["feed", "story", "reels", "youtube", "outro"] as const

export function MarcarPostado({ demandaId, onFeito }: { demandaId: string; onFeito: () => void }) {
  const [onde, setOnde] = useState<(typeof ONDE)[number]>("feed")
  const [link, setLink] = useState("")
  const [salvando, setSalvando] = useState(false)

  async function confirmar() {
    setSalvando(true)
    try {
      const res = await fetch(`/api/demandas/${demandaId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusInterno: "postado", postagemTipo: onde, ...(link.trim() ? { linkPostagem: link.trim() } : {}) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Não foi possível registrar a postagem.")
      toast.success("Postagem registrada.")
      setLink("")
      onFeito()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a postagem.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-zinc-400">Onde foi postado?</p>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Onde foi postado">
        {ONDE.map((t) => (
          <button key={t} type="button" aria-pressed={onde === t} onClick={() => setOnde(t)}
            className={cn("text-xs py-1.5 rounded-lg border capitalize transition-colors",
              onde === t ? "bg-cyan-600 border-cyan-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500")}>
            {t}
          </button>
        ))}
      </div>
      <input value={link} onChange={(e) => setLink(e.target.value)} type="url" inputMode="url"
        placeholder="Link da postagem (opcional)" aria-label="Link da postagem" className={surface.input} />
      <button type="button" onClick={confirmar} disabled={salvando} className={cn(surface.btnPrimary, surface.btnWide)}>
        <Send className="w-4 h-4" aria-hidden /> {salvando ? "Salvando…" : "Marcar como postado"}
      </button>
    </div>
  )
}
