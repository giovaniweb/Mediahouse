"use client"

import { useState } from "react"
import { Header } from "@/components/layout/Header"
import {
  CheckCircle2, XCircle, Clock, User, Zap, AlertCircle,
  RefreshCw, Sparkles, DollarSign, Video, FileText, Receipt,
  ExternalLink, Copy,
} from "lucide-react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Types ───────────────────────────────────────────────────────────────────

interface Demanda {
  id: string; codigo: string; titulo: string; descricao: string
  departamento: string; prioridade: "normal" | "alta" | "urgente"
  statusInterno: string; motivoUrgencia?: string; createdAt: string
  solicitante: { id: string; nome: string; email: string }
}

interface CustoNF {
  id: string; valor: number; descricao?: string; tipo: string
  notaFiscalUrl?: string; statusPagamento: string; createdAt: string
  dataReferencia: string
  videomaker: { id: string; nome: string; chavePix?: string; cpfCnpj?: string }
  demanda?: { id: string; codigo: string; titulo: string }
}

interface AprovacaoVideo {
  id: string; token: string; status: string; nomeVideo?: string; urlVideo: string
  createdAt: string; expiresAt?: string
  demanda: { id: string; codigo: string; titulo: string }
}

const DEPT_LABEL: Record<string, string> = {
  growth: "Growth", eventos: "Eventos", institucional: "Institucional",
  rh: "RH", audiovisual: "Audiovisual", outros: "Outros",
}

type Aba = "demandas" | "urgencias" | "pagamentos" | "videos" | "recusadas"

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AprovacoesPage() {
  const [aba, setAba] = useState<Aba>("demandas")
  const [loading, setLoading] = useState<string | null>(null)
  const [modal, setModal] = useState<{ id: string; statusInterno: string } | null>(null)
  const [motivo, setMotivo] = useState("")
  const [sugestaoIA, setSugestaoIA] = useState<Record<string, string>>({})
  const [analisandoIA, setAnalisandoIA] = useState<string | null>(null)

  const { data: dataUrgentes, mutate: mutateU } = useSWR<{ demandas: Demanda[] }>(
    "/api/demandas?statusInterno=urgencia_pendente_aprovacao", fetcher, { refreshInterval: 15000 })
  const { data: dataNormais, mutate: mutateN } = useSWR<{ demandas: Demanda[] }>(
    "/api/demandas?statusInterno=aguardando_aprovacao_interna", fetcher, { refreshInterval: 15000 })
  const { data: dataCustos, mutate: mutateCustos } = useSWR<{ custos: CustoNF[] }>(
    "/api/custos-videomaker?statusPagamento=nf_enviada", fetcher, { refreshInterval: 15000 })
  const { data: dataVideos, mutate: mutateVideos } = useSWR<{ aprovacoes: AprovacaoVideo[] }>(
    "/api/aprovacao-video?status=pendente", fetcher, { refreshInterval: 15000 })
  const { data: dataRecusadas, mutate: mutateRecusadas } = useSWR<{ demandas: Demanda[] }>(
    "/api/demandas?statusInterno=encerrado", fetcher, { refreshInterval: 30000 })

  const urgentes = dataUrgentes?.demandas ?? []
  const normais = dataNormais?.demandas ?? []
  const custos = dataCustos?.custos ?? []
  const videos = dataVideos?.aprovacoes ?? []
  const recusadas = dataRecusadas?.demandas ?? []

  function mutateAll() { mutateU(); mutateN(); mutateCustos(); mutateVideos(); mutateRecusadas() }

  // ─── Reverter recusa ──────────────────────────────────────────────────────

  async function reverterRecusa(id: string) {
    setLoading(id)
    try {
      const res = await fetch(`/api/demandas/${id}/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "reverter" }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Demanda reaberta para análise!")
      mutateAll()
    } catch (err) {
      toast.error(String(err))
    } finally { setLoading(null) }
  }

  // ─── Ações demandas ───────────────────────────────────────────────────────

  async function agirDemanda(id: string, statusInterno: string, acao: "aprovar" | "recusar", motivoRecusa?: string) {
    setLoading(id)
    try {
      const endpoint = statusInterno === "urgencia_pendente_aprovacao"
        ? `/api/urgencias/${id}/acao`
        : `/api/demandas/${id}/aprovar`
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, motivo: motivoRecusa }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(acao === "aprovar" ? "Demanda aprovada!" : "Demanda recusada")
      mutateAll(); setModal(null); setMotivo("")
    } catch (err) {
      toast.error(String(err))
    } finally { setLoading(null) }
  }

  // ─── Ações pagamento ──────────────────────────────────────────────────────

  async function agirPagamento(custoId: string, acao: "aprovar_pagamento" | "contestar") {
    setLoading(custoId)
    try {
      const res = await fetch(`/api/custos-videomaker/${custoId}/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.mensagem ?? (acao === "aprovar_pagamento" ? "Pagamento aprovado!" : "Custo contestado"))
      mutateCustos()
    } catch (err) {
      toast.error(String(err))
    } finally { setLoading(null) }
  }

  // ─── Análise IA ───────────────────────────────────────────────────────────

  async function analisarIA(d: Demanda) {
    setAnalisandoIA(d.id)
    try {
      const res = await fetch("/api/ia/analisar-demanda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandaId: d.id }),
      })
      const json = await res.json()
      if (json.sugestao) setSugestaoIA(s => ({ ...s, [d.id]: json.sugestao }))
    } finally { setAnalisandoIA(null) }
  }

  // ─── Tabs config ─────────────────────────────────────────────────────────

  const abas: { id: Aba; label: string; count: number; icon: React.ReactNode; cor: string }[] = [
    { id: "demandas", label: "Demandas", count: normais.length, icon: <FileText className="h-4 w-4" />, cor: "blue" },
    { id: "urgencias", label: "Urgências", count: urgentes.length, icon: <Zap className="h-4 w-4" />, cor: "red" },
    { id: "pagamentos", label: "Pagamentos", count: custos.length, icon: <DollarSign className="h-4 w-4" />, cor: "green" },
    { id: "videos", label: "Vídeos", count: videos.length, icon: <Video className="h-4 w-4" />, cor: "purple" },
    { id: "recusadas", label: "Recusadas", count: recusadas.length, icon: <XCircle className="h-4 w-4" />, cor: "red" },
  ]

  return (
    <>
      <Header title="Central de Aprovações" actions={
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <RefreshCw className="w-3.5 h-3.5" /> Auto-atualiza
        </div>
      } />
      <main className="flex-1 p-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-zinc-800 pb-0">
          {abas.map((t) => (
            <button
              key={t.id}
              onClick={() => setAba(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px",
                aba === t.id
                  ? "border-white text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              )}
            >
              {t.icon}
              {t.label}
              {t.count > 0 && (
                <span className={cn(
                  "text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center",
                  t.cor === "red" ? "bg-red-500/20 text-red-400"
                    : t.cor === "green" ? "bg-green-500/20 text-green-400"
                    : t.cor === "purple" ? "bg-purple-500/20 text-purple-400"
                    : "bg-blue-500/20 text-blue-400"
                )}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ─── ABA: DEMANDAS ─────────────────────────────────────────────── */}
        {aba === "demandas" && (
          <DemandaList
            lista={normais}
            loading={loading}
            sugestaoIA={sugestaoIA}
            analisandoIA={analisandoIA}
            onAprovar={(d) => agirDemanda(d.id, d.statusInterno, "aprovar")}
            onRecusar={(d) => setModal({ id: d.id, statusInterno: d.statusInterno })}
            onIA={analisarIA}
            emptyMsg="Nenhuma demanda aguardando aprovação"
          />
        )}

        {/* ─── ABA: URGÊNCIAS ────────────────────────────────────────────── */}
        {aba === "urgencias" && (
          <DemandaList
            lista={urgentes.map(d => ({ ...d, prioridade: "urgente" as const }))}
            loading={loading}
            sugestaoIA={sugestaoIA}
            analisandoIA={analisandoIA}
            onAprovar={(d) => agirDemanda(d.id, d.statusInterno, "aprovar")}
            onRecusar={(d) => setModal({ id: d.id, statusInterno: d.statusInterno })}
            onIA={analisarIA}
            emptyMsg="Nenhuma urgência pendente"
            emptyIcon={<Zap className="w-12 h-12 text-zinc-600 mb-3" />}
          />
        )}

        {/* ─── ABA: PAGAMENTOS ───────────────────────────────────────────── */}
        {aba === "pagamentos" && (
          <PagamentoList
            custos={custos}
            loading={loading}
            onAprovar={(c) => agirPagamento(c.id, "aprovar_pagamento")}
            onContestar={(c) => agirPagamento(c.id, "contestar")}
          />
        )}

        {/* ─── ABA: VÍDEOS ───────────────────────────────────────────────── */}
        {aba === "videos" && (
          <VideoList aprovacoes={videos} />
        )}

        {/* ─── ABA: RECUSADAS ─────────────────────────────────────────────── */}
        {aba === "recusadas" && (
          <div className="space-y-3 max-w-3xl">
            {recusadas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-400 mb-3" />
                <p className="font-medium text-zinc-400">Nenhuma demanda recusada</p>
                <p className="text-sm text-zinc-500 mt-1">Todas as demandas foram aprovadas ✅</p>
              </div>
            ) : recusadas.map((d) => (
              <div key={d.id} className="bg-zinc-900 border border-red-900/40 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-zinc-500">{d.codigo}</span>
                      <span className="text-xs bg-red-500/10 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">Recusada</span>
                      <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full capitalize">{d.departamento}</span>
                    </div>
                    <h3 className="font-semibold text-zinc-100">{d.titulo}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                      <User className="w-3 h-3" /> {d.solicitante.nome}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {format(new Date(d.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <p className="text-sm text-zinc-400 line-clamp-2">{d.descricao}</p>
                <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                  <button
                    onClick={() => reverterRecusa(d.id)}
                    disabled={loading === d.id}
                    className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium py-2 px-4 rounded-xl disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading === d.id ? "animate-spin" : ""}`} />
                    Reverter Recusa
                  </button>
                  <Link href={`/demandas/${d.id}`} className="text-xs text-blue-400 hover:underline ml-auto">
                    Ver detalhes →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal recusa */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4">
            <h3 className="font-semibold text-white mb-1">Recusar Demanda</h3>
            <p className="text-sm text-zinc-400 mb-4">Motivo da recusa (comunicado ao solicitante via WhatsApp).</p>
            <textarea
              className="w-full border border-zinc-700 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-zinc-500 bg-zinc-800 text-zinc-200"
              rows={3} placeholder="Ex: Fora do escopo, informações insuficientes..."
              value={motivo} onChange={(e) => setMotivo(e.target.value)}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => agirDemanda(modal.id, modal.statusInterno, "recusar", motivo)}
                disabled={loading === modal.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50">
                {loading === modal.id ? "Recusando..." : "Confirmar Recusa"}
              </button>
              <button onClick={() => { setModal(null); setMotivo("") }}
                className="flex-1 border border-zinc-700 text-zinc-300 text-sm py-2.5 rounded-xl hover:bg-zinc-800">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function DemandaList({
  lista, loading, sugestaoIA, analisandoIA, onAprovar, onRecusar, onIA, emptyMsg, emptyIcon,
}: {
  lista: Demanda[]; loading: string | null
  sugestaoIA: Record<string, string>; analisandoIA: string | null
  onAprovar: (d: Demanda) => void; onRecusar: (d: Demanda) => void
  onIA: (d: Demanda) => void; emptyMsg: string; emptyIcon?: React.ReactNode
}) {
  if (lista.length === 0) return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      {emptyIcon ?? <CheckCircle2 className="w-12 h-12 text-green-400 mb-3" />}
      <p className="font-medium text-zinc-400">{emptyMsg}</p>
      <p className="text-sm text-zinc-500 mt-1">Tudo em dia! 🎉</p>
    </div>
  )

  return (
    <div className="space-y-3 max-w-3xl">
      {lista.map((d) => (
        <div key={d.id} className={cn(
          "bg-zinc-900 border rounded-2xl p-5 space-y-3",
          d.prioridade === "urgente" ? "border-red-800 shadow-sm shadow-red-900/30"
            : d.prioridade === "alta" ? "border-orange-800"
            : "border-zinc-800"
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-mono text-zinc-500">{d.codigo}</span>
                {d.prioridade === "urgente" && (
                  <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-900/30 border border-red-800 px-2 py-0.5 rounded-full">
                    <Zap className="w-3 h-3" /> URGENTE
                  </span>
                )}
                {d.prioridade === "alta" && (
                  <span className="text-xs font-semibold text-orange-400 bg-orange-900/20 border border-orange-800 px-2 py-0.5 rounded-full">ALTA</span>
                )}
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                  {DEPT_LABEL[d.departamento] ?? d.departamento}
                </span>
              </div>
              <h3 className="font-semibold text-zinc-100">{d.titulo}</h3>
            </div>
            <span className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
              <Clock className="w-3.5 h-3.5" />
              {format(new Date(d.createdAt), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>

          <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2">{d.descricao}</p>

          {d.motivoUrgencia && (
            <div className="flex items-start gap-2 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{d.motivoUrgencia}</p>
            </div>
          )}

          {sugestaoIA[d.id] && (
            <div className="flex items-start gap-2 bg-purple-900/20 border border-purple-800 rounded-xl px-3 py-2.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
              <p className="text-xs text-purple-300 leading-relaxed">{sugestaoIA[d.id]}</p>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{d.solicitante.nome}</span>
            <Link href={`/demandas/${d.id}`} className="text-blue-400 hover:underline ml-auto">Ver detalhes →</Link>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
            <button
              onClick={() => onAprovar(d)}
              disabled={loading === d.id}
              className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50">
              <CheckCircle2 className="w-4 h-4" /> Aprovar
            </button>
            <button
              onClick={() => onRecusar(d)}
              disabled={loading === d.id}
              className="flex-1 flex items-center justify-center gap-1.5 border border-red-800 text-red-400 hover:bg-red-900/20 text-sm font-medium py-2.5 rounded-xl disabled:opacity-50">
              <XCircle className="w-4 h-4" /> Recusar
            </button>
            <button
              onClick={() => onIA(d)}
              disabled={analisandoIA === d.id || !!sugestaoIA[d.id]}
              title="Análise da IA"
              className="flex items-center gap-1 border border-purple-800 text-purple-400 hover:bg-purple-900/20 text-xs font-medium px-3 py-2.5 rounded-xl disabled:opacity-40">
              <Sparkles className={cn("w-3.5 h-3.5", analisandoIA === d.id && "animate-pulse")} /> IA
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function PagamentoList({ custos, loading, onAprovar, onContestar }: {
  custos: CustoNF[]
  loading: string | null
  onAprovar: (c: CustoNF) => void
  onContestar: (c: CustoNF) => void
}) {
  if (custos.length === 0) return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <Receipt className="w-12 h-12 text-zinc-600 mb-3" />
      <p className="font-medium text-zinc-400">Nenhuma nota fiscal aguardando aprovação</p>
      <p className="text-sm text-zinc-500 mt-1">Videomakers enviarão NFs após as filmagens</p>
    </div>
  )

  return (
    <div className="space-y-3 max-w-3xl">
      {custos.map((c) => (
        <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-green-500/10 text-green-400 border border-green-800 px-2 py-0.5 rounded-full font-medium">
                  NF Recebida
                </span>
                <span className="text-xs text-zinc-500">
                  {format(new Date(c.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                </span>
              </div>
              <h3 className="font-semibold text-zinc-100 text-lg">
                {c.videomaker.nome}
              </h3>
              {c.demanda && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  {c.demanda.codigo} — {c.demanda.titulo}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                R$ {c.valor.toFixed(2).replace(".", ",")}
              </div>
              <div className="text-xs text-zinc-500 capitalize">{c.tipo}</div>
            </div>
          </div>

          {/* Info table */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {c.videomaker.cpfCnpj && (
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <div className="text-xs text-zinc-500 mb-1">CPF/CNPJ</div>
                <div className="text-zinc-200 font-mono text-xs">{c.videomaker.cpfCnpj}</div>
              </div>
            )}
            {c.videomaker.chavePix && (
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
                  Chave PIX
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(c.videomaker.chavePix!)
                      toast.success("Chave PIX copiada!")
                    }}
                    className="text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="text-zinc-200 font-mono text-xs truncate">{c.videomaker.chavePix}</div>
              </div>
            )}
          </div>

          {c.descricao && (
            <p className="text-sm text-zinc-400">{c.descricao}</p>
          )}

          {c.notaFiscalUrl && (
            <a
              href={c.notaFiscalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver Nota Fiscal
            </a>
          )}

          <div className="flex gap-2 pt-1 border-t border-zinc-800">
            <button
              onClick={() => onAprovar(c)}
              disabled={loading === c.id}
              className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50">
              <CheckCircle2 className="w-4 h-4" />
              {loading === c.id ? "Aprovando..." : "Aprovar Pagamento"}
            </button>
            <button
              onClick={() => onContestar(c)}
              disabled={loading === c.id}
              className="flex items-center justify-center gap-1.5 border border-red-800 text-red-400 hover:bg-red-900/20 text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-50">
              <XCircle className="w-4 h-4" />
              Contestar
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function VideoList({ aprovacoes }: { aprovacoes: AprovacaoVideo[] }) {
  if (aprovacoes.length === 0) return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <Video className="w-12 h-12 text-zinc-600 mb-3" />
      <p className="font-medium text-zinc-400">Nenhum vídeo aguardando aprovação de cliente</p>
      <p className="text-sm text-zinc-500 mt-1">Links de aprovação aparecem aqui quando enviados</p>
    </div>
  )

  return (
    <div className="space-y-3 max-w-3xl">
      {aprovacoes.map((ap) => (
        <div key={ap.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-800 px-2 py-0.5 rounded-full font-medium">
                  Aguardando cliente
                </span>
              </div>
              <h3 className="font-semibold text-zinc-100">{ap.nomeVideo || "Vídeo sem nome"}</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {ap.demanda.codigo} — {ap.demanda.titulo}
              </p>
            </div>
            <span className="text-xs text-zinc-500">
              {format(new Date(ap.createdAt), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>

          {ap.expiresAt && (
            <div className="text-xs text-zinc-500">
              Expira em: {format(new Date(ap.expiresAt), "dd/MM/yyyy", { locale: ptBR })}
            </div>
          )}

          <div className="flex gap-2">
            <a
              href={ap.urlVideo}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-4 py-2 rounded-xl transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Assistir vídeo
            </a>
            <Link
              href={`/demandas/${ap.demanda.id}`}
              className="flex items-center gap-1.5 text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-4 py-2 rounded-xl transition-colors"
            >
              Ver demanda →
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
