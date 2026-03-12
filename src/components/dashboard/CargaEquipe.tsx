import { cn } from "@/lib/utils"

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
    <div className="bg-white rounded-xl border shadow-sm h-full">
      <div className="px-4 py-3 border-b">
        <h2 className="font-semibold text-zinc-800">Carga da Equipe</h2>
      </div>

      <div className="p-4 space-y-4">
        {isLoading &&
          [1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="h-3 bg-zinc-100 rounded w-1/2" />
              <div className="h-2 bg-zinc-100 rounded w-full" />
            </div>
          ))}

        {!isLoading && editores.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-4">Nenhum editor cadastrado</p>
        )}

        {!isLoading &&
          editores.map((editor) => {
            const pct = Math.min((editor.cargaAtual / editor.cargaLimite) * 100, 100)
            const status =
              pct >= 100 ? "sobrecarga" : pct >= 80 ? "atencao" : "ok"

            return (
              <div key={editor.id}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm font-medium text-zinc-700">{editor.nome}</span>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      status === "sobrecarga" && "text-red-600",
                      status === "atencao" && "text-yellow-600",
                      status === "ok" && "text-green-600"
                    )}
                  >
                    {editor.cargaAtual}/{editor.cargaLimite}
                  </span>
                </div>
                <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      status === "sobrecarga" && "bg-red-500",
                      status === "atencao" && "bg-yellow-400",
                      status === "ok" && "bg-green-500"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
