"use client"

import { useState, type ReactNode } from "react"
import { Film, Play } from "lucide-react"
import { capaDoVideo, nomeDoVideo, type VideoParaMostrar } from "@/lib/videos-da-gravacao"
import { cn } from "@/lib/utils"

/**
 * As miniaturas dos vídeos de um card (Giovani, 05/11/2026: "crie uma
 * thumbnail para a pessoa saber que tem um vídeo ali ... se tiver mais de um
 * vídeo, coloca mais de uma thumbnail ... um íconezinho de play"). Uma por
 * vídeo, com o play por cima e o nome embaixo. A capa é a gerada no envio; sem
 * ela, o primeiro quadro do vídeo, a capa do YouTube ou um quadro neutro — e,
 * no Drive, o quadro do Drive. Imagem que não carrega vira o quadro neutro:
 * nada de tela quebrada. Clicar abre o lightbox (LightboxDeVideo).
 */

/** O símbolo do Drive, desenhado aqui (não há no lucide). */
function IconeDoDrive({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 87.3 78" className={className} aria-hidden>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  )
}

export function MiniaturaDeVideo({ video, nome, onAbrir, className }: {
  video: Pick<VideoParaMostrar, "url" | "thumbnailUrl">
  nome: string
  onAbrir: () => void
  className?: string
}) {
  const [falhou, setFalhou] = useState(false)
  const capa = falhou ? { tipo: "neutra" as const } : capaDoVideo(video)
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Assistir ${nome}`}
      className={cn("group relative block aspect-video w-full overflow-hidden rounded-lg border border-zinc-700/70 bg-zinc-900 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400", className)}
    >
      {capa.tipo === "imagem" ? (
        // Sem loading="lazy": são poucas, e o adiamento deixava a capa sem carregar em painel escondido.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={capa.src} alt="" onError={() => setFalhou(true)} className="h-full w-full object-cover" />
      ) : capa.tipo === "quadro" ? (
        <video src={capa.src} preload="metadata" muted playsInline onError={() => setFalhou(true)} className="pointer-events-none h-full w-full object-cover" />
      ) : capa.tipo === "drive" ? (
        // O selo do Drive no canto, para o play do meio não cobrir.
        <span className="flex h-full w-full items-end justify-start bg-gradient-to-br from-zinc-800 to-zinc-900 p-2">
          <span className="flex items-center gap-1.5 rounded-md bg-black/50 px-1.5 py-1">
            <IconeDoDrive className="h-3.5 w-3.5" />
            <span className="text-[10.5px] font-medium text-zinc-200">Google Drive</span>
          </span>
        </span>
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
          <Film className="h-7 w-7 text-zinc-500" aria-hidden />
        </span>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/30">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/20 transition-transform group-hover:scale-105">
          <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
        </span>
      </span>
    </button>
  )
}

/** As miniaturas em grade: uma por vídeo, o nome embaixo e, se houver, as ações de cada uma. */
export function MiniaturasDeVideo<V extends VideoParaMostrar>({ videos, onAbrir, acoes }: {
  videos: V[]
  onAbrir: (indice: number) => void
  /** Botões embaixo do nome (baixar, trocar, remover). */
  acoes?: (video: V, indice: number) => ReactNode
}) {
  return (
    <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Vídeos">
      {videos.map((v, i) => {
        const nome = nomeDoVideo(v, i + 1)
        return (
          <li key={v.id ?? v.url} className="min-w-0">
            <MiniaturaDeVideo video={v} nome={nome} onAbrir={() => onAbrir(i)} />
            <p className="mt-1.5 truncate text-xs font-medium text-zinc-200" title={nome}>{nome}</p>
            {acoes && <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">{acoes(v, i)}</div>}
          </li>
        )
      })}
    </ul>
  )
}
