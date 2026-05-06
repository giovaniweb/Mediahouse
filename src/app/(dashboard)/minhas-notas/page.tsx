"use client"

import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { FileText, ExternalLink } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const NF_STATUS: Record<string, { label: string; color: string }> = {
  pendente: { label: "Aguardando envio", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  enviada: { label: "Enviada", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  aprovada: { label: "Aprovada ✓", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  rejeitada: { label: "Rejeitada", color: "bg-red-500/15 text-red-400 border-red-500/30" },
}

interface NotaFiscal {
  id: string
  status: string
  nomeArquivo?: string | null
  token: string
  url?: string | null
  createdAt: string
  updatedAt: string
  demanda?: { codigo: string; titulo: string } | null
}

export default function MinhasNotasPage() {
  const { data } = useSWR("/api/me/videomaker", fetcher)
  const notasFiscais: NotaFiscal[] = data?.videomaker?.notasFiscais ?? []

  const pendentes = notasFiscais.filter(n => n.status === "pendente")
  const enviadas = notasFiscais.filter(n => n.status !== "pendente")

  return (
    <>
      <Header title="Minhas Notas Fiscais" />
      <main className="flex-1 p-6 max-w-3xl mx-auto space-y-6">
        {/* Resumo */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-zinc-100">{notasFiscais.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Total</p>
          </div>
          <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{pendentes.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Aguardando envio</p>
          </div>
          <div className="bg-zinc-900 border border-emerald-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">
              {notasFiscais.filter(n => n.status === "aprovada").length}
            </p>
            <p className="text-xs text-zinc-500 mt-1">Aprovadas</p>
          </div>
        </div>

        {/* Notas pendentes */}
        {pendentes.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
              ⏳ Aguardando Envio ({pendentes.length})
            </h2>
            <div className="space-y-2">
              {pendentes.map((nf) => (
                <NFCard key={nf.id} nf={nf} />
              ))}
            </div>
          </section>
        )}

        {/* Histórico */}
        {enviadas.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-400 mb-3">
              Histórico
            </h2>
            <div className="space-y-2">
              {enviadas.map((nf) => (
                <NFCard key={nf.id} nf={nf} />
              ))}
            </div>
          </section>
        )}

        {notasFiscais.length === 0 && (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500">Nenhuma nota fiscal registrada ainda.</p>
            <p className="text-xs text-zinc-600 mt-1">As notas aparecerão aqui quando suas demandas forem finalizadas.</p>
          </div>
        )}
      </main>
    </>
  )
}

function NFCard({ nf }: { nf: NotaFiscal }) {
  const st = NF_STATUS[nf.status] ?? NF_STATUS.pendente
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-mono text-zinc-500">{nf.demanda?.codigo ?? "—"}</span>
          <span className="text-sm font-medium text-zinc-200 truncate">{nf.demanda?.titulo ?? "Demanda"}</span>
        </div>
        <p className="text-xs text-zinc-500">
          {format(new Date(nf.createdAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          {nf.nomeArquivo && <span className="ml-2 text-zinc-600">· {nf.nomeArquivo}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", st.color)}>
          {st.label}
        </span>
        {nf.status === "pendente" && (
          <a
            href={`/nf-upload/${nf.token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded-lg font-medium transition-colors"
          >
            Enviar NF <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {nf.url && nf.status !== "pendente" && (
          <a
            href={nf.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}
