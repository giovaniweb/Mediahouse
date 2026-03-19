import { cn } from "@/lib/utils"
import { Users } from "lucide-react"
import Link from "next/link"

interface CargaEditor {
  id: string
  nome: string
  cargaAtual: number
  cargaLimite: number
  status: string
}

interface CargaEquipeProps {
  editores: CargaEditor[]
  isLoading: boolean
}

export function CargaEquipe({ editores, isLoading }: CargaEquipeProps) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 h-full overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
        <Users className="w-4 h-4 text-purple-400" />
        <h2 className="font-semibold text-zinc-100">Carga da Equipe</h2>
      </div>

      <div className="p-4 space-y-4">
        {isLoading &&
          [1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="h-3 bg-zinc-800 rounded w-1/2" />
              <div className="h-2 bg-zinc-800 rounded w-full" />
            </div>
          ))}

        {!isLoading && editores.length === 0 && (
          <p className="text-sm text-zinc-500 text-center py-4">Nenhum editor cadastrado</p>
        )}

        {!isLoading &&
          editores.map((editor) => {
            const pct = Math.min((editor.cargaAtual / Math.max(editor.cargaLimite, 1)) * 100, 100)
            const status =
              pct >= 100 ? "sobrecarga" : pct >= 80 ? "atencao" : pct >= 60 ? "medio" : "ok"

            return (
              <Link key={editor.id} href={`/equipe/${editor.id}`} className="block group">
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">
                    {editor.nome}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      status === "sobrecarga" && "text-red-400",
                      status === "atencao" && "text-amber-400",
                      status === "medio" && "text-yellow-400",
                      status === "ok" && "text-emerald-400"
                    )}
                  >
                    {editor.cargaAtual}/{editor.cargaLimite}
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      status === "sobrecarga" && "bg-red-500",
                      status === "atencao" && "bg-amber-500",
                      status === "medio" && "bg-yellow-500",
                      status === "ok" && "bg-emerald-500"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Link>
            )
          })}
      </div>
    </div>
  )
}
