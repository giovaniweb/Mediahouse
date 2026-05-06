"use client"

import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { FileText, ExternalLink, CheckCircle2, Clock, Upload } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { cn } from "@/lib/utils"

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

export default function MinhasNotasPage() {
  const { data } = useSWR("/api/me/videomaker", fetcher)
  const notasFiscais: NotaFiscal[] = data?.videomaker?.notasFiscais ?? []
  const demandas: Demanda[] = data?.videomaker?.demandas ?? []

  // Mapear NFs por token de upload
  const nfsPendentes = notasFiscais.filter(n => n.status === "pendente")
  const nfsEnviadas = notasFiscais.filter(n => n.status !== "pendente")

  // Demandas que exigem NF: finalizadas + para_postar
  const demandasComNF = demandas.filter(d =>
    d.statusVisivel === "finalizado" || d.statusVisivel === "para_postar"
  )
  const demandasAtivas = demandas.filter(d =>
    d.statusVisivel !== "finalizado" && d.statusVisivel !== "para_postar"
  )

  // Mapear NF por codigo da demanda (para exibição inline)
  const nfPorCodigo = new Map<string, NotaFiscal>()
  notasFiscais.forEach(nf => {
    if (nf.demanda?.codigo) nfPorCodigo.set(nf.demanda.codigo, nf)
  })

  return (
    <>
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

        {/* Demandas que precisam de NF */}
        {demandasComNF.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              Demandas — Nota Fiscal
            </h2>
            <div className="space-y-2">
              {demandasComNF.map((d) => {
                const nf = nfPorCodigo.get(d.codigo)
                const st = nf ? (NF_STATUS[nf.status] ?? NF_STATUS.pendente) : null
                return (
                  <div key={d.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono text-zinc-500">{d.codigo}</span>
                          <span className="text-xs bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">
                            {STATUS_LABELS[d.statusVisivel] ?? d.statusVisivel}
                          </span>
                          {d.prioridade === "urgente" && (
                            <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded">Urgente</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-zinc-200 truncate">{d.titulo}</p>
                        {d.finalizadaEm && (
                          <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Finalizada em {format(new Date(d.finalizadaEm), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                          </p>
                        )}
                        {d.dataCaptacao && !d.finalizadaEm && (
                          <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Captação: {format(new Date(d.dataCaptacao), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        )}
                        {nf && nf.nomeArquivo && (
                          <p className="text-[11px] text-zinc-500 mt-1">📎 {nf.nomeArquivo}</p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {nf ? (
                          <>
                            <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", st?.color)}>
                              {st?.label}
                            </span>
                            {nf.status === "pendente" && (
                              <a
                                href={`/nf-upload/${nf.token}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                Anexar NF
                              </a>
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
                          </>
                        ) : (
                          <span className="text-[10px] text-zinc-600 italic">NF não gerada ainda</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Demandas ativas (referência) */}
        {demandasAtivas.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-400 mb-3">
              Demandas em Andamento
            </h2>
            <div className="space-y-2">
              {demandasAtivas.map((d) => (
                <div key={d.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-zinc-600">{d.codigo}</span>
                      <p className="text-xs font-medium text-zinc-400 truncate">{d.titulo}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-zinc-500 flex-shrink-0">
                    {STATUS_LABELS[d.statusVisivel] ?? d.statusVisivel}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Histórico de NFs */}
        {nfsEnviadas.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-400 mb-3">
              Histórico de NFs Enviadas
            </h2>
            <div className="space-y-2">
              {nfsEnviadas.map((nf) => (
                <NFCard key={nf.id} nf={nf} />
              ))}
            </div>
          </section>
        )}

        {notasFiscais.length === 0 && demandas.length === 0 && (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500">Nenhuma demanda ou nota fiscal registrada ainda.</p>
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
            <Upload className="w-3 h-3" /> Anexar NF
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
