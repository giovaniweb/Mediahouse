"use client"

import { useState } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { FileText, ExternalLink, CheckCircle2, Clock, Upload, Loader2 } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { cn } from "@/lib/utils"
import { NFUploadModal } from "@/components/demandas/NFUploadModal"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const NF_STATUS: Record<string, { label: string; color: string }> = {
  pendente: { label: "Aguardando envio", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  enviada: { label: "Enviada", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  aprovada: { label: "Aprovada ✓", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  rejeitada: { label: "Rejeitada", color: "bg-red-500/15 text-red-400 border-red-500/30" },
}

const STATUS_LABELS: Record<string, string> = {
  entrada: "Entrada",
  producao: "Produção",
  edicao: "Edição",
  aprovacao: "Aprovação",
  para_postar: "Para Postar",
  finalizado: "Concluído",
}

const STATUS_COLORS: Record<string, string> = {
  entrada: "bg-zinc-700/50 text-zinc-400",
  producao: "bg-blue-500/15 text-blue-400",
  edicao: "bg-purple-500/15 text-purple-400",
  aprovacao: "bg-amber-500/15 text-amber-400",
  para_postar: "bg-cyan-500/15 text-cyan-400",
  finalizado: "bg-emerald-500/15 text-emerald-400",
}

interface NotaFiscal {
  id: string
  status: string
  nomeArquivo?: string | null
  token: string
  url?: string | null
  createdAt: string
  demanda?: { codigo: string; titulo: string } | null
}

interface Demanda {
  id: string
  codigo: string
  titulo: string
  tipoVideo: string
  statusVisivel: string
  statusInterno: string
  prioridade: string
  dataLimite?: string | null
  dataCaptacao?: string | null
  finalizadaEm?: string | null
  createdAt: string
}

function AnexarNFButton({
  demandaId, nf, onOpenModal,
}: { demandaId: string; nf?: NotaFiscal; onOpenModal: (token: string) => void }) {
  const [loading, setLoading] = useState(false)

  // Se já tem NF com token, mostrar diretamente
  if (nf) {
    const st = NF_STATUS[nf.status] ?? NF_STATUS.pendente
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", st.color)}>
          {st.label}
        </span>
        {nf.status === "pendente" && (
          <button
            onClick={() => onOpenModal(nf.token)}
            className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Anexar NF
          </button>
        )}
        {nf.url && nf.status !== "pendente" && (
          <a
            href={nf.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ver NF
          </a>
        )}
      </div>
    )
  }

  // Sem NF ainda — busca ou cria o token e abre o modal
  const handleAnexar = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/me/nf-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandaId }),
      })
      const data = await res.json()
      if (data.token) onOpenModal(data.token)
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleAnexar}
      disabled={loading}
      className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex-shrink-0"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
      {loading ? "Aguarde..." : "Anexar NF"}
    </button>
  )
}

export default function MinhasNotasPage() {
  const [nfModalToken, setNfModalToken] = useState<string | null>(null)
  const { data, mutate } = useSWR("/api/me/videomaker", fetcher)
  const notasFiscais: NotaFiscal[] = data?.videomaker?.notasFiscais ?? []
  const demandas: Demanda[] = data?.videomaker?.demandas ?? []

  // Mapear NF por codigo da demanda
  const nfPorCodigo = new Map<string, NotaFiscal>()
  notasFiscais.forEach(nf => {
    if (nf.demanda?.codigo) nfPorCodigo.set(nf.demanda.codigo, nf)
  })

  const nfsPendentes = notasFiscais.filter(n => n.status === "pendente")

  // Ordenar demandas: finalizadas primeiro, depois por data desc
  const demandasOrdenadas = [...demandas].sort((a, b) => {
    if (a.statusVisivel === "finalizado" && b.statusVisivel !== "finalizado") return -1
    if (b.statusVisivel === "finalizado" && a.statusVisivel !== "finalizado") return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <>
      {nfModalToken && (
        <NFUploadModal
          token={nfModalToken}
          onClose={() => setNfModalToken(null)}
          onSuccess={() => { setNfModalToken(null); mutate() }}
        />
      )}
      <Header title="Minhas Notas Fiscais" />
      <main className="flex-1 p-6 max-w-4xl mx-auto space-y-6">

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-zinc-100">{notasFiscais.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Total de NFs</p>
          </div>
          <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{nfsPendentes.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Aguardando envio</p>
          </div>
          <div className="bg-zinc-900 border border-emerald-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">
              {notasFiscais.filter(n => n.status === "aprovada").length}
            </p>
            <p className="text-xs text-zinc-500 mt-1">Aprovadas</p>
          </div>
        </div>

        {/* Lista de demandas com botão de NF */}
        {demandasOrdenadas.length > 0 ? (
          <section>
            <h2 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              Suas Demandas
              <span className="text-xs bg-zinc-800 text-zinc-500 rounded-full px-2 py-0.5 border border-zinc-700">
                {demandasOrdenadas.length}
              </span>
            </h2>
            <div className="space-y-2">
              {demandasOrdenadas.map((d) => {
                const nf = nfPorCodigo.get(d.codigo)
                const stColor = STATUS_COLORS[d.statusVisivel] ?? "bg-zinc-700/50 text-zinc-400"
                return (
                  <div key={d.id} className={cn(
                    "bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center gap-4",
                    d.statusVisivel === "finalizado" && "border-emerald-500/20",
                  )}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-mono text-zinc-500">{d.codigo}</span>
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", stColor)}>
                          {STATUS_LABELS[d.statusVisivel] ?? d.statusVisivel}
                        </span>
                        {d.prioridade === "urgente" && (
                          <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded">Urgente</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-zinc-200 truncate">{d.titulo}</p>
                      {d.finalizadaEm ? (
                        <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          Finalizada {format(new Date(d.finalizadaEm), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      ) : d.dataCaptacao ? (
                        <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Captação: {format(new Date(d.dataCaptacao), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      ) : (
                        <p className="text-[11px] text-zinc-600 mt-1">
                          Criada {format(new Date(d.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      )}
                    </div>

                    <AnexarNFButton demandaId={d.id} nf={nf} onOpenModal={setNfModalToken} />
                  </div>
                )
              })}
            </div>
          </section>
        ) : (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500">Nenhuma demanda registrada ainda.</p>
            <p className="text-xs text-zinc-600 mt-1">As demandas aparecerão aqui assim que você for escalado.</p>
          </div>
        )}
      </main>
    </>
  )
}
