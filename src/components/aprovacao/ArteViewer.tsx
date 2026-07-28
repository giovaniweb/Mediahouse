"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, X, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

// Visualizador de artes estilo Instagram: carrossel com setas, contador, dots e
// miniaturas. Suporta imagem e PDF (iframe). Botão de zoom → lightbox em tela cheia.
// Estado interno (slide + lightbox). Reutilizado na aprovação, prévia e modal interno.
export function ArteViewer({ artes }: { artes: string[] }) {
  const [slide, setSlide] = useState(0)
  const [zoom, setZoom] = useState(false)
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

  const semQuery = (u: string) => u.split("?")[0].toLowerCase()
  const isPdf = (u: string) => semQuery(u).endsWith(".pdf")
  const isImg = (u: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(semQuery(u)) || u.includes("supabase") || u.includes("picsum")

  const prev = () => setSlide(cur - 1)
  const next = () => setSlide(cur + 1)

  // Renderiza a mídia atual (imagem | pdf | fallback link)
  function Midia({ full }: { full?: boolean }) {
    const u = lista[cur]
    if (isPdf(u)) {
      return <iframe src={u} className={cn("w-full bg-white", full ? "h-full" : "h-full")} title={`Arte ${cur + 1}`} />
    }
    if (isImg(u)) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={u} alt={`Arte ${cur + 1}`} className={cn("object-contain", full ? "max-h-full max-w-full" : "w-full h-full")} />
    }
    return (
      <a href={u} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline text-sm px-6 text-center">
        Abrir arquivo {cur + 1} →
      </a>
    )
  }

  return (
    <div>
      <div className="relative bg-black rounded-2xl overflow-hidden border border-zinc-800 aspect-square flex items-center justify-center select-none group">
        <Midia />

        {/* Zoom */}
        <button onClick={() => setZoom(true)} aria-label="Ampliar"
          className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 border border-white/15 flex items-center justify-center backdrop-blur text-white opacity-80 hover:opacity-100">
          <Maximize2 className="w-4 h-4" />
        </button>

        {total > 1 && (
          <>
            <button onClick={prev} aria-label="Anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 border border-white/15 flex items-center justify-center backdrop-blur">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={next} aria-label="Próxima"
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
              className={cn("w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition-opacity bg-zinc-900 flex items-center justify-center", i === cur ? "border-white" : "border-transparent opacity-60 hover:opacity-100")}>
              {isPdf(u) ? (
                <FileText className="w-5 h-5 text-zinc-400" />
              ) : isImg(u) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u} alt="" className="w-full h-full object-cover" />
              ) : <span className="text-[10px] text-zinc-500">{i + 1}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Lightbox (zoom em tela cheia) */}
      {zoom && (
        <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col" onClick={() => setZoom(false)}>
          <div className="flex items-center justify-between px-4 py-3 text-white/80">
            <span className="text-sm">{cur + 1} / {total}</span>
            <button onClick={() => setZoom(false)} aria-label="Fechar" className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 relative flex items-center justify-center p-4 min-h-0" onClick={(e) => e.stopPropagation()}>
            {isPdf(lista[cur]) ? (
              <iframe src={lista[cur]} className="w-full h-full bg-white rounded-lg" title={`Arte ${cur + 1}`} />
            ) : isImg(lista[cur]) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lista[cur]} alt={`Arte ${cur + 1}`} className="max-h-full max-w-full object-contain" />
            ) : (
              <a href={lista[cur]} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Abrir arquivo →</a>
            )}
            {total > 1 && (
              <>
                <button onClick={prev} aria-label="Anterior" className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><ChevronLeft className="w-6 h-6" /></button>
                <button onClick={next} aria-label="Próxima" className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><ChevronRight className="w-6 h-6" /></button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
