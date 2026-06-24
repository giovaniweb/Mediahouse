"use client"

import { useState } from "react"
import useSWR from "swr"
import { Image as ImageIcon, Search, Loader2, X, ExternalLink } from "lucide-react"
import { TIPO_ARTE_LABEL } from "@/lib/design-pecas"

type Arte = {
  id: string; codigo: string; titulo: string; tipoVideo: string
  linkFinal: string; thumbnailUrl: string | null; finalizadaEm: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function isImagem(url: string) {
  return /\.(jpg|jpeg|png|webp|gif|svg)$/.test((url.split("?")[0] || "").toLowerCase())
}
function isPdf(url: string) {
  return (url.split("?")[0] || "").toLowerCase().endsWith(".pdf")
}

export default function GaleriaArtesPage() {
  const [search, setSearch] = useState("")
  const [zoom, setZoom] = useState<Arte | null>(null)
  // Galeria Growth/Criativos — rota autenticada e ISOLADA por organização
  // (não usa a galeria pública/global do audiovisual).
  const qs = new URLSearchParams({ limit: "48" })
  if (search) qs.set("search", search)
  const { data, isLoading } = useSWR<{ videos: Arte[]; total: number }>(`/api/growth/galeria?${qs}`, fetcher)
  const artes = data?.videos ?? []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2"><ImageIcon className="w-6 h-6 text-indigo-400" /> Galeria Growth · Criativos</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{data?.total ?? 0} criativos finalizados e aprovados.</p>
      </div>

      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar criativo…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
      ) : artes.length === 0 ? (
        <div className="text-center py-16 text-zinc-500"><ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Nenhuma arte finalizada ainda.</p></div>
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
                  <p className="text-xs font-medium text-zinc-200 truncate">{a.titulo}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{TIPO_ARTE_LABEL[a.tipoVideo] ?? a.tipoVideo}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setZoom(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white"><X className="w-6 h-6" /></button>
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            {isImagem(zoom.linkFinal) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={zoom.linkFinal} alt={zoom.titulo} className="w-full rounded-xl max-h-[80vh] object-contain" />
            ) : isPdf(zoom.linkFinal) ? (
              <iframe src={zoom.linkFinal} className="w-full h-[80vh] rounded-xl bg-white" />
            ) : (
              <div className="text-center text-zinc-400 py-10">
                <a href={zoom.linkFinal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-purple-400 hover:text-purple-300"><ExternalLink className="w-4 h-4" /> Abrir arquivo</a>
              </div>
            )}
            <p className="text-center text-sm text-zinc-300 mt-3">{zoom.titulo} · {TIPO_ARTE_LABEL[zoom.tipoVideo] ?? zoom.tipoVideo}</p>
          </div>
        </div>
      )}
    </div>
  )
}
