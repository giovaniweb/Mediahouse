"use client"

import { useState } from "react"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import { DemandaModal } from "@/components/demandas/DemandaModal"
import {
  Search, AlertTriangle, ExternalLink, FolderOpen, Sparkles,
  ChevronLeft, ChevronRight, Loader2, Check, X,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface DemandaSemVideo {
  id: string
  codigo: string
  titulo: string
  tipoVideo: string
  departamento: string
  finalizadaEm: string | null
  linkBrutos: string | null
  linkCliente: string | null
}

interface Candidato { url: string; nomeArquivo: string; tamanho: number | null; confianca: "alta" | "media" | "baixa" }
type ScanState = { loading?: boolean; candidate?: Candidato | null; motivo?: string; applied?: boolean; error?: string }

export default function FinalizadasSemVideoPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [modalDemandaId, setModalDemandaId] = useState<string | null>(null)
  const [scans, setScans] = useState<Record<string, ScanState>>({})

  const params = new URLSearchParams({ page: String(page), limit: "30" })
  if (search) params.set("search", search)
  const { data, mutate, isLoading } = useSWR<{ total: number; totalPages: number; demandas: DemandaSemVideo[] }>(
    `/api/relatorios/finalizadas-sem-video?${params}`, fetcher
  )
  const demandas = data?.demandas ?? []

  async function escanear(id: string) {
    setScans((s) => ({ ...s, [id]: { loading: true } }))
    try {
      const res = await fetch(`/api/admin/scan-drive-final?demandaId=${id}`)
      const j = await res.json()
      if (!res.ok) { setScans((s) => ({ ...s, [id]: { error: j.error ?? "Erro" } })); return }
      setScans((s) => ({ ...s, [id]: { candidate: j.candidate, motivo: j.motivo } }))
    } catch (e) {
      setScans((s) => ({ ...s, [id]: { error: String(e) } }))
    }
  }

  async function usarComoFinal(id: string, c: Candidato) {
    setScans((s) => ({ ...s, [id]: { ...s[id], loading: true } }))
    try {
      const res = await fetch(`/api/admin/scan-drive-final`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandaId: id, url: c.url, nomeArquivo: c.nomeArquivo }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setScans((s) => ({ ...s, [id]: { candidate: c, error: j.error ?? "Erro ao aplicar" } })); return }
      setScans((s) => ({ ...s, [id]: { applied: true } }))
      mutate()
    } catch (e) {
      setScans((s) => ({ ...s, [id]: { candidate: c, error: String(e) } }))
    }
  }

  const confCor: Record<string, string> = {
    alta: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    media: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    baixa: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  }

  return (
    <>
      <Header title="Finalizadas sem vídeo final" />

      <main className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-4">
        {/* Explicação */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-zinc-300 leading-relaxed">
            <p className="font-medium text-amber-300 mb-1">Demandas finalizadas que não aparecem na galeria</p>
            <p className="text-zinc-400">
              Estas demandas estão marcadas como <b>finalizadas</b> mas <b>não têm o vídeo final registrado no sistema</b> (nem link, nem arquivo).
              Abra cada uma para colar o link final ou fazer upload — ela passa a aparecer na galeria automaticamente.
              Quando houver pasta de brutos no Drive, use <b>Escanear Drive</b> para procurar a peça final (você confirma antes de aplicar; material bruto nunca entra sozinho).
            </p>
          </div>
        </div>

        {/* Busca + contador */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar por título, código, departamento…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
            />
          </div>
          <span className="text-sm text-zinc-500 ml-auto">{data?.total ?? 0} demandas</span>
        </div>

        {/* Lista */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
          ) : demandas.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">Nenhuma demanda finalizada sem vídeo 🎉</div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {demandas.map((d) => {
                const scan = scans[d.id]
                return (
                  <div key={d.id} className="p-4 hover:bg-zinc-800/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-zinc-500">{d.codigo}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{d.tipoVideo}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800/60 text-zinc-500">{d.departamento}</span>
                          {d.finalizadaEm && <span className="text-[11px] text-zinc-600">finalizada {new Date(d.finalizadaEm).toLocaleDateString("pt-BR")}</span>}
                        </div>
                        <p className="text-sm text-zinc-200 font-medium mt-1 truncate">{d.titulo}</p>
                        {d.linkBrutos && (
                          <a href={d.linkBrutos} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 mt-1">
                            <FolderOpen className="w-3.5 h-3.5" /> Pasta de brutos (Drive) <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setModalDemandaId(d.id)}
                          className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg font-medium">
                          Abrir
                        </button>
                        {d.linkBrutos && !scan?.applied && (
                          <button onClick={() => escanear(d.id)} disabled={scan?.loading}
                            className="text-xs border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg hover:bg-zinc-800 inline-flex items-center gap-1 disabled:opacity-50">
                            {scan?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Escanear Drive
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Resultado do scan */}
                    {scan && !scan.loading && (
                      <div className="mt-3 ml-0">
                        {scan.applied ? (
                          <p className="text-xs text-emerald-400 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Vídeo final aplicado — já aparece na galeria.</p>
                        ) : scan.error ? (
                          <p className="text-xs text-rose-400 inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> {scan.error}</p>
                        ) : scan.candidate ? (
                          <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-3 flex items-center gap-3 flex-wrap">
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${confCor[scan.candidate.confianca]}`}>
                              confiança {scan.candidate.confianca}
                            </span>
                            <a href={scan.candidate.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline truncate max-w-xs inline-flex items-center gap-1">
                              <ExternalLink className="w-3 h-3 shrink-0" /> {scan.candidate.nomeArquivo}
                            </a>
                            <button onClick={() => usarComoFinal(d.id, scan.candidate!)}
                              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium ml-auto">
                              Usar como vídeo final
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-500">{scan.motivo ?? "Nada encontrado na pasta."}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Paginação */}
        {(data?.totalPages ?? 1) > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm text-zinc-500">Página {page} de {data?.totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(data?.totalPages ?? 1, p + 1))} disabled={page >= (data?.totalPages ?? 1)}
              className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
      </main>

      <DemandaModal demandaId={modalDemandaId} onClose={() => { setModalDemandaId(null); mutate() }} />
    </>
  )
}
