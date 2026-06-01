"use client"

import useSWR from "swr"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { Palette, Loader2, Clock } from "lucide-react"
import { TIPO_ARTE_LABEL } from "@/lib/design-pecas"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS: { id: string; label: string; color: string }[] = [
  { id: "entrada", label: "Briefing", color: "bg-zinc-700/50 text-zinc-300" },
  { id: "producao", label: "Criação", color: "bg-blue-500/15 text-blue-400" },
  { id: "edicao", label: "Ajustes", color: "bg-purple-500/15 text-purple-400" },
  { id: "aprovacao", label: "Aprovação", color: "bg-amber-500/15 text-amber-400" },
  { id: "para_postar", label: "Entrega", color: "bg-cyan-500/15 text-cyan-400" },
  { id: "finalizado", label: "Concluído", color: "bg-emerald-500/15 text-emerald-400" },
]

type Arte = { id: string; codigo: string; titulo: string; tipoVideo: string; statusVisivel: string; dataLimite?: string | null }

export function DesignerDashboard() {
  const { data: session } = useSession()
  const { data, isLoading } = useSWR<{ demandas: Arte[] }>("/api/demandas", fetcher, { refreshInterval: 20000 })
  const artes = data?.demandas ?? []
  const ativas = artes.filter((a) => a.statusVisivel !== "finalizado")
  const firstName = session?.user?.name?.split(" ")[0] ?? "Designer"

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-purple-600/20 flex items-center justify-center"><Palette className="w-5 h-5 text-purple-400" /></div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Olá, {firstName}! 🎨</h1>
          <p className="text-sm text-zinc-500">{ativas.length} arte(s) ativa(s) atribuída(s) a você.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
      ) : artes.length === 0 ? (
        <div className="text-center py-16 text-zinc-500"><Palette className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Nenhuma arte atribuída a você ainda.</p></div>
      ) : (
        <div className="space-y-5">
          {STATUS.map((s) => {
            const items = artes.filter((a) => a.statusVisivel === s.id)
            if (items.length === 0) return null
            return (
              <div key={s.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full ${s.color}`}>{s.label}</span>
                  <span className="text-xs text-zinc-500">{items.length}</span>
                </div>
                <div className="grid gap-2">
                  {items.map((a) => (
                    <Link key={a.id} href={`/demandas/${a.id}`} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-colors flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">{a.titulo}</p>
                        <p className="text-xs text-zinc-500">{a.codigo} · {TIPO_ARTE_LABEL[a.tipoVideo] ?? a.tipoVideo}</p>
                      </div>
                      {a.dataLimite && (
                        <span className="text-[10px] text-zinc-500 flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" /> {new Date(a.dataLimite).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
