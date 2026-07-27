"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"

// Visualizador de artes estilo Instagram: carrossel com setas, contador, dots e
// miniaturas. Estado interno (slide). Reutilizado na aprovação pública e na prévia.
export function ArteViewer({ artes }: { artes: string[] }) {
  const [slide, setSlide] = useState(0)
  const lista = artes.length > 0 ? artes : []
  const total = lista.length
  const cur = total > 0 ? ((slide % total) + total) % total : 0

  if (total === 0) {
    return (
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 aspect-square flex flex-col items-center justify-center text-zinc-500 gap-2">
        <ImageOff className="w-8 h-8" />
        <p className="text-sm">Nenhuma arte anexada ainda</p>
      </div>
    )
  }

  const isImg = (u: string) => /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(u) || u.includes("supabase") || u.includes("picsum")

  return (
    <div>
      <div className="relative bg-black rounded-2xl overflow-hidden border border-zinc-800 aspect-square flex items-center justify-center select-none">
        {isImg(lista[cur]) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lista[cur]} alt={`Arte ${cur + 1}`} className="w-full h-full object-contain" />
        ) : (
          <a href={lista[cur]} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline text-sm px-6 text-center">
            Abrir arquivo {cur + 1} →
          </a>
        )}
        {total > 1 && (
          <>
            <button onClick={() => setSlide(cur - 1)} aria-label="Anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 border border-white/15 flex items-center justify-center backdrop-blur">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => setSlide(cur + 1)} aria-label="Próxima"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 border border-white/15 flex items-center justify-center backdrop-blur">
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="absolute top-3 right-3 bg-black/60 rounded-full px-2.5 py-0.5 text-xs font-medium text-white">{cur + 1}/{total}</div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {lista.map((_, i) => (
                <button key={i} onClick={() => setSlide(i)} aria-label={`Ir para ${i + 1}`}
                  className={cn("w-2 h-2 rounded-full transition-colors", i === cur ? "bg-white" : "bg-white/40 hover:bg-white/70")} />
              ))}
            </div>
          </>
        )}
      </div>
      {total > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {lista.map((u, i) => (
            <button key={i} onClick={() => setSlide(i)}
              className={cn("w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition-opacity bg-zinc-900", i === cur ? "border-white" : "border-transparent opacity-60 hover:opacity-100")}>
              {isImg(u) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u} alt="" className="w-full h-full object-cover" />
              ) : <span className="text-[10px] text-zinc-500 flex items-center justify-center h-full">{i + 1}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
