"use client"

import { useState, useRef } from "react"
import useSWR from "swr"
import { useParams } from "next/navigation"
import { Truck, Loader2, Upload, CheckCircle2, FileText, MapPin, Calendar } from "lucide-react"

type Custo = {
  id: string; descricao: string; categoria: string; valorPrevisto: number; valorReal: number | null
  statusPagamento: string; notaFiscalUrl: string | null; pago: boolean
  evento: { nome: string; dataInicio: string; cidade: string | null }
}
type Fornecedor = { id: string; nome: string; categoria: string; cidade: string | null; estado: string | null; custos: Custo[] }

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const fmtMoney = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
const fmtData = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })

const STATUS_NF: Record<string, { label: string; cls: string }> = {
  pendente_nf: { label: "Aguardando NF", cls: "bg-amber-900/50 text-amber-300" },
  nf_enviada: { label: "NF enviada", cls: "bg-blue-900/50 text-blue-300" },
  aguardando_pagamento: { label: "Aguardando pagamento", cls: "bg-purple-900/50 text-purple-300" },
  pago: { label: "Pago", cls: "bg-emerald-900/50 text-emerald-300" },
  contestado: { label: "Contestado", cls: "bg-red-900/50 text-red-300" },
}

export default function PortalFornecedorPage() {
  const { token } = useParams<{ token: string }>()
  const { data, mutate, isLoading } = useSWR<{ fornecedor: Fornecedor }>(`/api/publico/fornecedor/${token}`, fetcher)

  if (isLoading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
  if (!data?.fornecedor) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Portal não encontrado.</div>

  const f = data.fornecedor

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-purple-600/20 flex items-center justify-center"><Truck className="w-5 h-5 text-purple-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">{f.nome}</h1>
            <p className="text-xs text-zinc-500">Portal do Fornecedor · NuFlow Eventos</p>
          </div>
        </div>

        <p className="text-sm text-zinc-400 mb-4">Acompanhe seus lançamentos e envie notas fiscais / documentos.</p>

        {f.custos.length === 0 ? (
          <div className="text-center py-16 text-zinc-500"><FileText className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Nenhum lançamento ainda.</p></div>
        ) : (
          <div className="space-y-3">
            {f.custos.map((c) => (
              <CustoCard key={c.id} custo={c} token={token} onUploaded={mutate} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CustoCard({ custo, token, onUploaded }: { custo: Custo; token: string; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const st = STATUS_NF[custo.statusPagamento] ?? STATUS_NF.pendente_nf

  async function enviar(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("arquivo", file)
      fd.append("custoId", custo.id)
      const res = await fetch(`/api/publico/fornecedor/${token}`, { method: "POST", body: fd })
      if (!res.ok) throw new Error()
      onUploaded()
    } catch {
      alert("Falha no envio. Tente novamente.")
    } finally { setUploading(false) }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100">{custo.descricao}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 flex-wrap">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {custo.evento.nome}</span>
            {custo.evento.cidade && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {custo.evento.cidade}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-zinc-200">{fmtMoney(custo.valorReal ?? custo.valorPrevisto)}</p>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {custo.notaFiscalUrl ? (
          <a href={custo.notaFiscalUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Documento enviado — ver
          </a>
        ) : (
          <>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) enviar(file) }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? "Enviando…" : "Enviar NF / Documento"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
