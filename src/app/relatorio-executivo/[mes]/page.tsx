"use client"

import { useState } from "react"
import useSWR from "swr"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { Loader2, Printer, Film, Palette } from "lucide-react"

type Resumo = {
  mes: string
  area: string
  producaoPorCategoria: Record<string, number>
  nuflowVideos: number
  totalManual: number
  totalGeral: number
  presencialPorCategoria: Record<string, number>
  producaoRS: number
  valorPorVideo: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const fmtNum = (v: number) => v.toLocaleString("pt-BR")
const fmtRS = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

// Lista de meses de Maio/2026 até o mês atual (descendente)
export function opcoesMes(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  const startY = 2026, startM = 5
  const now = new Date()
  let y = now.getFullYear(), m = now.getMonth() + 1
  while (y > startY || (y === startY && m >= startM)) {
    out.push({ value: `${y}-${String(m).padStart(2, "0")}`, label: `${MESES[m - 1]} ${y}` })
    m--; if (m === 0) { m = 12; y-- }
  }
  return out
}

const CORES = ["text-blue-400", "text-cyan-400", "text-emerald-400", "text-amber-400", "text-pink-400"]

export default function RelatorioExecutivoMesPage() {
  const params = useParams<{ mes: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const meses = opcoesMes()
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes : meses[0]?.value ?? ""
  const [area, setArea] = useState<"audiovisual" | "design">(searchParams.get("area") === "design" ? "design" : "audiovisual")

  const { data, isLoading } = useSWR<Resumo>(mes ? `/api/publico/relatorio-executivo?mes=${mes}&area=${area}` : null, fetcher)

  function trocarMes(novo: string) {
    router.push(`/relatorio-executivo/${novo}${area === "design" ? "?area=design" : ""}`)
  }
  function trocarArea(a: "audiovisual" | "design") {
    setArea(a)
    router.replace(`/relatorio-executivo/${mes}${a === "design" ? "?area=design" : ""}`)
  }

  const unidade = area === "design" ? "artes" : "vídeos"
  const cats = data ? Object.entries(data.producaoPorCategoria) : []
  const presencial = data ? Object.entries(data.presencialPorCategoria) : []
  const mesLabel = meses.find((m) => m.value === mes)?.label ?? mes

  return (
    <div className="min-h-screen bg-[#0a1228] text-zinc-100">
      <style>{`@media print { body { background:#0a1228 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } .no-print { display:none !important } }`}</style>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="NuFlow" className="w-9 h-9 rounded-lg" />
            <div>
              <h1 className="text-2xl font-bold">Relatório Executivo</h1>
              <p className="text-sm text-blue-300/80">{area === "design" ? "Growth (Artes)" : "Audiovisual"} · {mesLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5 gap-0.5">
              <button onClick={() => trocarArea("audiovisual")} className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md ${area === "audiovisual" ? "bg-blue-600 text-white" : "text-zinc-400"}`}><Film className="w-3.5 h-3.5" /> Audiovisual</button>
              <button onClick={() => trocarArea("design")} className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md ${area === "design" ? "bg-blue-600 text-white" : "text-zinc-400"}`}><Palette className="w-3.5 h-3.5" /> Growth</button>
            </div>
            <select value={mes} onChange={(e) => trocarMes(e.target.value)} className="text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-zinc-200">
              {meses.map((m) => <option key={m.value} value={m.value} className="bg-zinc-900">{m.label}</option>)}
            </select>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs border border-white/10 text-zinc-200 hover:bg-white/5 px-3 py-1.5 rounded-lg"><Printer className="w-3.5 h-3.5" /> PDF</button>
          </div>
        </div>

        {isLoading || !data ? (
          <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-blue-400/60" /></div>
        ) : (
          <>
            <h2 className="text-3xl font-extrabold mb-1">Produção do mês</h2>
            <p className="text-blue-300/70 mb-8">Volume de conteúdo + ações presenciais.</p>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <div className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-4">{unidade} postados/entregues</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {cats.map(([cat, qtd], i) => (
                    <div key={cat} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                      <div className={`text-4xl font-extrabold ${CORES[i % CORES.length]}`}>{fmtNum(qtd)}</div>
                      <div className="text-sm text-zinc-400 mt-2">{cat}</div>
                    </div>
                  ))}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-4xl font-extrabold text-emerald-400">{fmtNum(data.nuflowVideos)}</div>
                    <div className="text-sm text-zinc-400 mt-2">Demandas NuFlow</div>
                  </div>
                  <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5">
                    <div className="text-4xl font-extrabold text-white">{fmtNum(data.totalGeral)}</div>
                    <div className="text-sm text-blue-200 mt-2">Total geral</div>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Produção (índice de valor — {fmtRS(data.valorPorVideo)}/{unidade.slice(0, -1)})</span>
                  <span className="text-2xl font-bold text-emerald-300">{fmtRS(data.producaoRS)}</span>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-4">Frentes presenciais</div>
                {presencial.length === 0 ? (
                  <p className="text-sm text-zinc-500">—</p>
                ) : (
                  <div className="divide-y divide-white/10">
                    {presencial.map(([cat, qtd]) => (
                      <div key={cat} className="flex items-center gap-4 py-4">
                        <span className="text-3xl font-extrabold text-cyan-400 w-10">{fmtNum(qtd)}</span>
                        <span className="text-base text-zinc-200">{cat}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="mt-10 text-lg text-zinc-300 leading-relaxed border-t border-white/10 pt-6">
              O audiovisual não atuou só como produção: atuou como operação, cobertura e entrega de conteúdo para venda.
            </p>
            <p className="mt-8 text-xs text-zinc-600">Relatório {area === "design" ? "Growth" : "Audiovisual"} · {mesLabel} · NuFlow</p>
          </>
        )}
      </div>
    </div>
  )
}
