"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { Image as ImageIcon, Search, Loader2, X, ExternalLink } from "lucide-react"
import { TIPO_ARTE_LABEL } from "@/lib/design-pecas"
import { fetcher } from "@/lib/fetcher"

import styles from "@/components/layout/TeamSurface.module.css"

type Arte = {
  id: string; codigo: string; titulo: string; tipoVideo: string
  linkFinal: string; thumbnailUrl: string | null; finalizadaEm: string | null
}


function isImagem(url: string) {
  return /\.(jpg|jpeg|png|webp|gif|svg)$/.test((url.split("?")[0] || "").toLowerCase())
}
function isPdf(url: string) {
  return (url.split("?")[0] || "").toLowerCase().endsWith(".pdf")
}

export default function GaleriaArtesPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [zoom, setZoom] = useState<Arte | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!zoom) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { dialog?.close(); previous?.focus() }
  }, [zoom])
  // Galeria Growth/Criativos — rota autenticada e ISOLADA por organização
  // (não usa a galeria pública/global do audiovisual).
  const qs = new URLSearchParams({ limit: "48", page: String(page) })
  if (search) qs.set("search", search)
  const { data, error, isLoading, isValidating, mutate } = useSWR<{ videos: Arte[]; total: number }>(`/api/growth/galeria?${qs}`, fetcher)
  const artes = data?.videos ?? []
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 48))

  return (
    <div className={styles.page} style={{ paddingBottom: 100 }}>
      <div className="mb-5">
        <p className={styles.eyebrow}>GROWTH / GALERIA</p>
        <h1 className={styles.title}>Ideias que ganharam forma.</h1>
        <p className={styles.subtitle}>{error ? "Galeria indisponível no momento." : isLoading ? "Carregando criativos…" : `${data?.total ?? 0} ${(data?.total ?? 0) === 1 ? "demanda com entregas disponíveis" : "demandas com entregas disponíveis"} · ${artes.length} ${artes.length === 1 ? "arquivo nesta página" : "arquivos nesta página"}.`}</p>
      </div>

      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input aria-label="Buscar criativo" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Buscar criativo…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      </div>

      {error ? <div role="alert" className="bg-zinc-900 border border-zinc-800 p-6"><p>Não foi possível carregar os criativos.</p><button disabled={isValidating} onClick={() => mutate()} className="text-purple-300">Tentar novamente</button></div> : isLoading ? (
        <div role="status" aria-label="Carregando criativos" className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
      ) : artes.length === 0 ? (
        <div className="text-center py-16 text-zinc-500"><ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>{search ? "Nenhum criativo encontrado para essa busca." : "Nenhuma arte finalizada ainda."}</p></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {artes.map((a) => {
            const thumb = a.thumbnailUrl ?? (isImagem(a.linkFinal) ? a.linkFinal : null)
            return (
              <button key={a.id} onClick={() => setZoom(a)} className="group text-left bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors">
                <div className="aspect-square bg-zinc-950 flex items-center justify-center overflow-hidden">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={a.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <ImageIcon className="w-10 h-10 text-zinc-700" />
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium text-zinc-200 break-words">{a.titulo}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{TIPO_ARTE_LABEL[a.tipoVideo] ?? a.tipoVideo}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {!error && !isLoading && totalPages > 1 && (
        <nav aria-label="Páginas da galeria" className="flex flex-wrap items-center justify-between gap-3 mt-6">
          <span className="text-sm text-zinc-400">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-4 rounded-lg border border-zinc-700 disabled:opacity-40">Anterior</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-4 rounded-lg border border-zinc-700 disabled:opacity-40">Próxima</button>
          </div>
        </nav>
      )}

      {zoom && (
        <dialog ref={dialogRef} aria-label={zoom.titulo} onCancel={() => setZoom(null)} className="m-auto w-[calc(100%-32px)] max-w-4xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-100 backdrop:bg-black/80" onClick={(event) => { if (event.target === event.currentTarget) setZoom(null) }}>
          <button aria-label="Fechar visualização" onClick={() => setZoom(null)} className="ml-auto mb-3 flex min-h-11 min-w-11 items-center justify-center text-white/70 hover:text-white"><X className="w-6 h-6" /></button>
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            {isImagem(zoom.linkFinal) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={zoom.linkFinal} alt={zoom.titulo} className="w-full rounded-xl max-h-[80vh] object-contain" />
            ) : isPdf(zoom.linkFinal) ? (
              <>
                <p className="mb-3 text-sm text-zinc-400">Se a prévia não abrir neste navegador, <a href={zoom.linkFinal} target="_blank" rel="noreferrer" className="text-purple-300 underline">abrir PDF em nova aba</a>.</p>
                <iframe title={zoom.titulo} src={zoom.linkFinal} className="w-full h-[65vh] rounded-xl bg-white" />
              </>
            ) : (
              <div className="text-center text-zinc-400 py-10">
                <a href={zoom.linkFinal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-purple-400 hover:text-purple-300"><ExternalLink className="w-4 h-4" /> Abrir arquivo</a>
              </div>
            )}
            <p className="text-center text-sm text-zinc-300 mt-3">{zoom.titulo} · {TIPO_ARTE_LABEL[zoom.tipoVideo] ?? zoom.tipoVideo}</p>
          </div>
        </dialog>
      )}
    </div>
  )
}
