import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { textoScore, type ScoreRede as Score } from "@/lib/rede-score"

// O score da rede como a empresa vê antes de contratar: média e quantidade,
// ou "Novo na rede" antes de 3 avaliações. Nada de comentário nem de quem avaliou.
export function ScoreRede({ score, className }: { score?: Score | null; className?: string }) {
  const novo = !score || score.media == null
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", novo ? "text-zinc-400" : "text-zinc-300", className)}
      title="Média das notas dos últimos 24 meses, a partir de 3 avaliações (Política de Avaliações)"
    >
      {novo ? (
        <>Novo na rede</>
      ) : (
        <>
          <Star aria-hidden className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
          <span className="font-medium text-zinc-100">{score.media!.toFixed(1).replace(".", ",")}</span>
          <span className="text-zinc-500">· {score.avaliacoes} {score.avaliacoes === 1 ? "avaliação" : "avaliações"}</span>
        </>
      )}
      <span className="sr-only">{textoScore(score)}</span>
    </span>
  )
}
