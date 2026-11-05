"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Download, ExternalLink, X } from "lucide-react"
import { comoTocar } from "@/lib/videos-da-gravacao"
import { MiniaturaDeVideo } from "./MiniaturasDeVideo"
import { cn } from "@/lib/utils"

/**
 * O vídeo ampliado dentro do sistema (Giovani, 05/11/2026: "abrir ali
 * ampliado ali no sistema, que a pessoa faz a visualização, fecha a janela e
 * continua vendo o status do projeto"). Fundo escuro; fecha no X, no Esc e no
 * clique fora, e o card fica onde estava. Com mais de um vídeo, setas (e as
 * do teclado) e as miniaturas embaixo passam de um a outro.
 *
 * Arquivo do NuFlow toca no player; Drive, YouTube e Vimeo vêm embutidos;
 * outro link (WeTransfer...) mostra "Abrir em nova aba". Vai num portal para o
 * <body>: o card aberto como painel não recorta a janela.
 */

export type VideoDoLightbox = {
  url: string
  nome: string
  /** O endereço para baixar (o original), quando há. */
  download?: string | null
  thumbnailUrl?: string | null
}

export function LightboxDeVideo({ videos, inicio = 0, onFechar }: {
  videos: VideoDoLightbox[]
  inicio?: number
  onFechar: () => void
}) {
  const [indice, setIndice] = useState(() => Math.min(Math.max(inicio, 0), Math.max(videos.length - 1, 0)))
  const fecharRef = useRef<HTMLButtonElement>(null)
  // O pai recria onFechar a cada render (o card recarrega a cada 30 s): a
  // assinatura do teclado não pode depender dele, senão o foco pularia.
  const aoFechar = useRef(onFechar)
  useEffect(() => { aoFechar.current = onFechar })
  const total = videos.length
  const atual = videos[indice]

  // Esc fecha só o lightbox (e não o card por trás); as setas passam de vídeo.
  // A rolagem da página fica parada enquanto ele está aberto; o foco volta para
  // onde estava ao fechar.
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    fecharRef.current?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); aoFechar.current() }
      else if (e.key === "ArrowRight" && total > 1) { e.preventDefault(); setIndice((i) => (i + 1) % total) }
      else if (e.key === "ArrowLeft" && total > 1) { e.preventDefault(); setIndice((i) => (i - 1 + total) % total) }
    }
    window.addEventListener("keydown", tecla, true)
    return () => {
      window.removeEventListener("keydown", tecla, true)
      document.body.style.overflow = overflow
      antes?.focus?.()
    }
  }, [total])

  if (!atual) return null
  const tocar = comoTocar(atual.url)
  const ir = (passo: number) => setIndice((i) => (i + passo + total) % total)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vídeo: ${atual.nome}`}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-3 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}
    >
      <div className="flex w-full max-w-5xl flex-col gap-3">
        <div className="flex items-center justify-between gap-3 text-white">
          <p className="min-w-0 truncate text-sm font-medium">
            {atual.nome}
            {total > 1 && <span className="ml-2 font-normal text-white/60">{indice + 1} de {total}</span>}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {atual.download && (
              <a href={atual.download} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">
                <Download className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Baixar</span>
              </a>
            )}
            {tocar.tipo === "iframe" && (
              <a href={atual.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">
                <ExternalLink className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Abrir em nova aba</span>
              </a>
            )}
            <button ref={fecharRef} type="button" onClick={onFechar} aria-label="Fechar"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
              <X className="h-5 w-5" aria-hidden /><span className="hidden sm:inline">Fechar</span>
            </button>
          </div>
        </div>

        <div className="relative">
          {tocar.tipo === "video" ? (
            <video key={tocar.src} src={tocar.src} controls autoPlay playsInline className="max-h-[72vh] w-full rounded-xl bg-black" />
          ) : tocar.tipo === "imagem" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={tocar.src} src={tocar.src} alt={atual.nome} className="max-h-[72vh] w-full rounded-xl bg-black object-contain" />
          ) : tocar.tipo === "iframe" ? (
            <iframe key={tocar.src} src={tocar.src} title={atual.nome} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen
              className="aspect-video max-h-[72vh] w-full rounded-xl border-0 bg-black" />
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-xl bg-zinc-900 p-8 text-center">
              <p className="text-sm text-zinc-400">Este link não abre aqui dentro.</p>
              <a href={atual.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500">
                Abrir em nova aba <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </div>
          )}
          {total > 1 && (
            <>
              <button type="button" onClick={() => ir(-1)} aria-label="Vídeo anterior"
                className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 hover:bg-black/80">
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button type="button" onClick={() => ir(1)} aria-label="Próximo vídeo"
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 hover:bg-black/80">
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </>
          )}
        </div>

        {total > 1 && (
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Todos os vídeos">
            {videos.map((v, i) => (
              <li key={`${v.url}-${i}`} className={cn("w-28 shrink-0 rounded-lg sm:w-32", i === indice ? "ring-2 ring-purple-400" : "opacity-70 hover:opacity-100")}>
                <MiniaturaDeVideo video={v} nome={v.nome} onAbrir={() => setIndice(i)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}
