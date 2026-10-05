import { cn } from "@/lib/utils"
import { Timer } from "lucide-react"
import Link from "next/link"
import type { GargaloEtapa } from "@/lib/gargalos"

interface Operacional {
  noPrazoPercentual: number | null
  tempoMedioDias: number | null
}

interface FluxoEtapasProps {
  gargalos: GargaloEtapa[]
  operacional?: Operacional | null
  isLoading: boolean
  /** Para onde cada etapa leva. Padrão: o quadro do Audiovisual já recortado. */
  hrefEtapa?: (etapa: string) => string
}

const numero = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
const demandas = (n: number) => `${n} ${n === 1 ? "demanda" : "demandas"}`
const dias = (n: number) => `${numero(n)} ${n === 1 ? "dia" : "dias"}`

const quadroAudiovisual = (etapa: string) => `/demandas?statusVisivel=${etapa}`

export function FluxoEtapas({ gargalos, operacional, isLoading, hrefEtapa = quadroAudiovisual }: FluxoEtapasProps) {
  // O gargalo é a etapa com a maior espera média entre as que têm demanda.
  // Comparar entre etapas diz mais do que um limite fixo de dias, que ninguém
  // definiu e que não vale igual para captação e para postagem.
  const comMedia = gargalos.filter((g) => g.demandas > 0 && g.diasMedios !== null)
  const maiorEspera = Math.max(0, ...comMedia.map((g) => g.diasMedios ?? 0))
  const gargalo = maiorEspera >= 1 ? comMedia.find((g) => g.diasMedios === maiorEspera)?.etapa : undefined

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
        <Timer className="w-4 h-4 text-sky-400" />
        <div>
          <h2 className="font-semibold text-zinc-100">Fluxo das etapas</h2>
          <p className="text-xs text-zinc-500">Onde as demandas estão esperando agora</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 px-5 pt-4">
        <div>
          <p className="text-xs text-zinc-500">Entregues no prazo</p>
          <p className="text-2xl font-bold text-zinc-100">
            {isLoading || operacional?.noPrazoPercentual == null ? "—" : `${operacional.noPrazoPercentual}%`}
          </p>
          <p className="text-xs text-zinc-500">neste mês, das que tinham prazo</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Tempo médio de ciclo</p>
          <p className="text-2xl font-bold text-zinc-100">
            {isLoading || operacional?.tempoMedioDias == null ? "—" : dias(operacional.tempoMedioDias)}
          </p>
          <p className="text-xs text-zinc-500">do pedido à conclusão, neste mês</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {isLoading &&
          [1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="h-3 bg-zinc-800 rounded w-1/2" />
              <div className="h-2 bg-zinc-800 rounded w-full" />
            </div>
          ))}

        {!isLoading &&
          gargalos.map((g) => {
            const destaque = g.etapa === gargalo
            const largura = g.diasMedios && maiorEspera ? Math.max((g.diasMedios / maiorEspera) * 100, 4) : 0
            return (
              <Link key={g.etapa} href={hrefEtapa(g.etapa)} className="block group">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">
                    {g.label}
                    {destaque && (
                      <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                        Maior espera
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-zinc-400 whitespace-nowrap">
                    {demandas(g.demandas)}
                    {g.diasMedios !== null && <> · {dias(g.diasMedios)} em média</>}
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", destaque ? "bg-amber-500" : "bg-sky-500")}
                    style={{ width: `${largura}%` }}
                  />
                </div>
                {(g.maisAntiga || g.semHistorico > 0) && (
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {g.maisAntiga && <>Mais antiga: {g.maisAntiga.codigo}, há {dias(g.maisAntiga.dias)}</>}
                    {g.maisAntiga && g.semHistorico > 0 && " · "}
                    {g.semHistorico > 0 && <>{demandas(g.semHistorico)} sem data de entrada</>}
                  </p>
                )}
              </Link>
            )
          })}
      </div>
    </div>
  )
}
