"use client"

import { useDialogFocus } from "@/components/layout/useDialogFocus"
import styles from "./ApprovalsPreview.module.css"
import surface from "@/components/demandas/DemandSurface.module.css"
import { useState } from "react"
import { Header } from "@/components/layout/Header"
import {
  CheckCircle2, XCircle, Clock, User, Zap, AlertCircle,
  RefreshCw, Sparkles, DollarSign, Video, FileText, Receipt,
  ExternalLink, Copy, ArrowRightLeft, Clapperboard, CalendarClock, MapPin, Building2,
} from "lucide-react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import { toast } from "sonner"
import { MoneyDisplay } from "@/components/ui/MoneyDisplay"
import { mensagemDeErro } from "@/lib/erro-cliente"
import { fluxoAtual, type FluxoDoRegistro } from "@/lib/job-fase"
import { momentoDoJob, ondeDoJob, rotuloDoMomento } from "@/lib/ficha-do-job"
import { rotuloDoTipo } from "@/lib/tipos-demanda"
import { formatarData } from "@/lib/datas"
import { fetcher } from "@/lib/fetcher"


// ─── Types ───────────────────────────────────────────────────────────────────

interface Demanda {
  id: string; codigo: string; titulo: string; descricao: string
  // `tipoVideo` entra junto de `departamento`: os dois formam a classificação
  // que decide se a solicitação segue para /jobs ou para o Kanban de Demandas.
  departamento: string; tipoVideo?: string | null
  prioridade: "normal" | "alta" | "urgente"
  statusInterno: string; motivoUrgencia?: string; createdAt: string
  solicitante: { id: string; nome: string; email: string }
  /** Quem pediu de fora (formulário público, WhatsApp): o solicitante é o sistema. */
  nomeSolicitante?: string | null
  dataLimite?: string | null
  // A ficha do Job: o que se confere antes de aprovar uma gravação.
  dataCaptacao?: string | null; dataEvento?: string | null
  localGravacao?: string | null; localEvento?: string | null; cidade?: string | null
  clienteFinalNome?: string | null
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

export type AreaAprovacao = "audiovisual" | "design"

// ─── View ────────────────────────────────────────────────────────────────────
//
// Uma única tela serve as duas áreas. Antes ela buscava sem `area` e o gestor
// via demanda de vídeo e arte de Growth misturadas na mesma lista — e a aba de
// pagamentos (com PIX e dados bancários do videomaker) aparecia para quem só
// deveria aprovar criativo. Agora a área é explícita e os pagamentos só existem
// no audiovisual.

export default function AprovacoesView({ area }: { area: AreaAprovacao }) {
  const ehAudiovisual = area === "audiovisual"
  const rotuloArea = ehAudiovisual ? "Audiovisual" : "Growth"
  const q = `&area=${area}`

  const [aba, setAba] = useState<Aba>("demandas")
  const [loading, setLoading] = useState<string | null>(null)
  const [modal, setModal] = useState<{ id: string } | null>(null)
  const [motivo, setMotivo] = useState("")

  const dialogRef = useDialogFocus(!!modal, () => { if (!loading) { setModal(null); setMotivo("") } })

  const { data: dataUrgentes, mutate: mutateU, error: errorU, isLoading: loadingU } = useSWR<{ demandas: Demanda[] }>(
    `/api/demandas?statusInterno=urgencia_pendente_aprovacao${q}`, fetcher, { refreshInterval: 15000 })
  const { data: dataNormais, mutate: mutateN, error: errorN, isLoading: loadingN } = useSWR<{ demandas: Demanda[] }>(
    `/api/demandas?statusInterno=aguardando_aprovacao_interna${q}`, fetcher, { refreshInterval: 15000 })
  // Pagamentos de videomaker (PIX/CPF) são exclusivos do audiovisual.
  const { data: dataCustos, mutate: mutateCustos, error: errorC, isLoading: loadingC } = useSWR<{ custos: CustoNF[] }>(
    ehAudiovisual ? "/api/custos-videomaker?statusPagamento=nf_enviada" : null, fetcher, { refreshInterval: 15000 })
  const { data: dataVideos, mutate: mutateVideos, error: errorV, isLoading: loadingV } = useSWR<{ aprovacoes: AprovacaoVideo[] }>(
    `/api/aprovacao-video?status=pendente${q}`, fetcher, { refreshInterval: 15000 })
  const { data: dataRecusadas, mutate: mutateRecusadas, error: errorR, isLoading: loadingR } = useSWR<{ demandas: Demanda[] }>(
    `/api/demandas?statusInterno=encerrado${q}`, fetcher, { refreshInterval: 30000 })

  const urgentes = dataUrgentes?.demandas ?? []
  const normais = dataNormais?.demandas ?? []
  const custos = dataCustos?.custos ?? []
  const videos = dataVideos?.aprovacoes ?? []
  const recusadas = dataRecusadas?.demandas ?? []

  const currentError = {demandas:errorN, urgencias:errorU, pagamentos:errorC, videos:errorV, recusadas:errorR}[aba]
  const currentLoading = {demandas:loadingN, urgencias:loadingU, pagamentos:loadingC, videos:loadingV, recusadas:loadingR}[aba]
  const retryCurrent = {demandas:mutateN, urgencias:mutateU, pagamentos:mutateCustos, videos:mutateVideos, recusadas:mutateRecusadas}[aba]

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
      toast.error(mensagemDeErro(err))
    } finally { setLoading(null) }
  }

  // ─── Ações demandas ───────────────────────────────────────────────────────

  async function decidir(id: string, acao: "aprovar" | "recusar", motivoRecusa?: string) {
    // Urgência e demanda comum vão pela mesma rota — ela distingue pelo status.
    const res = await fetch(`/api/demandas/${id}/aprovar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, motivo: motivoRecusa }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
  }

  /**
   * Aprova o pedido como foi pedido — ou, com `trocarPara`, troca de esteira
   * antes. A troca é a exceção e vem confirmada pela tela: aprovar "como Job"
   * o que foi pedido como demanda era um clique no botão verde, e foi assim que
   * pedido de edição caiu no quadro de Jobs.
   */
  async function aprovar(d: Demanda, trocarPara?: FluxoDoRegistro) {
    setLoading(d.id)
    try {
      // A classificação vem ANTES da aprovação, de propósito. Se a conversão
      // falhar, o item continua na fila com a marca certa — visível e
      // repetível. Na ordem inversa ele sairia da fila classificado errado,
      // que é o estado difícil de perceber.
      if (trocarPara) {
        const conv = await fetch(`/api/jobs/${d.id}/converter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Para Demanda, a rota exige confirmação explícita (a mesma regra do
          // "Mover para Demandas" do Job). Aqui a confirmação da troca JÁ é a
          // decisão de quem aprova; bloqueios (videomaker, convite aceito,
          // custo) e permissão continuam valendo e voltam como erro.
          body: JSON.stringify(trocarPara === "demanda" ? { para: trocarPara, confirmar: true } : { para: trocarPara }),
        })
        if (!conv.ok) throw new Error((await conv.json()).error)
      }
      await decidir(d.id, "aprovar")
      const destino = trocarPara ?? fluxoAtual(d)
      toast.success(!ehAudiovisual ? "Pedido aprovado!"
        : destino === "job" ? "Gravação aprovada — está em Gravações Externas"
        : "Demanda aprovada — está no quadro de Demandas")
      mutateAll()
    } catch (err) {
      toast.error(mensagemDeErro(err))
    } finally { setLoading(null) }
  }

  async function recusar(id: string, motivoRecusa: string) {
    setLoading(id)
    try {
      await decidir(id, "recusar", motivoRecusa)
      toast.success("Pedido recusado")
      mutateAll(); setModal(null); setMotivo("")
    } catch (err) {
      toast.error(mensagemDeErro(err))
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
      toast.error(mensagemDeErro(err))
    } finally { setLoading(null) }
  }

  // ─── Tabs config ─────────────────────────────────────────────────────────

  const abas: { id: Aba; label: string; count: number; icon: React.ReactNode; cor: string }[] = [
    // "Pedidos", não "Demandas": a fila tem pedido de Job e de Demanda, e cada
    // card diz qual é.
    { id: "demandas", label: "Pedidos", count: normais.length, icon: <FileText className="h-4 w-4" />, cor: "blue" },
    { id: "urgencias", label: "Urgências", count: urgentes.length, icon: <Zap className="h-4 w-4" />, cor: "red" },
    // Pagamentos expõem PIX/CPF do videomaker — não aparecem no Growth.
    ...(ehAudiovisual
      ? [{ id: "pagamentos" as Aba, label: "Pagamentos", count: custos.length, icon: <DollarSign className="h-4 w-4" />, cor: "green" }]
      : []),
    {
      id: "videos",
      label: ehAudiovisual ? "Vídeos" : "Criativos",
      count: videos.length,
      icon: ehAudiovisual ? <Video className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />,
      cor: "purple",
    },
    { id: "recusadas", label: "Recusadas", count: recusadas.length, icon: <XCircle className="h-4 w-4" />, cor: "red" },
  ]

  return (
    <>
      <Header title={`Aprovações · ${rotuloArea}`} actions={
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <RefreshCw className="w-3.5 h-3.5" /> Auto-atualiza
        </div>
      } />
      <main className={cn("flex-1 p-6", styles.page)}>
        <div className={styles.heading}><p>APROVAÇÕES · {rotuloArea.toUpperCase()}</p><h1>Uma decisão. O próximo passo.</h1><span>Só o que chega de fora passa por aqui: o que a equipe cria logada já entra aprovado. Confira o que foi pedido e aprove.</span></div>
        {/* Tabs */}
        <div aria-label="Filtrar aprovações" className={cn("flex gap-2 mb-6 border-b border-zinc-800 pb-0", styles.tabs)}>
          {abas.map((t) => (
            <button
              key={t.id}
              aria-pressed={aba === t.id}
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

        {currentError ? <div role="alert" className={styles.error}>Não foi possível carregar esta fila. <button onClick={() => void retryCurrent()}>Tentar novamente</button></div>
          : currentLoading ? <p role="status" className={styles.loading}>Carregando aprovações…</p> : <>
        {/* ─── ABA: DEMANDAS ─────────────────────────────────────────────── */}
        {aba === "demandas" && (
          <DemandaList
            lista={normais}
            loading={loading}
            podeTrocar={ehAudiovisual}
            onAprovar={aprovar}
            onRecusar={(d) => setModal({ id: d.id })}
            emptyMsg="Nenhum pedido aguardando aprovação"
          />
        )}

        {/* ─── ABA: URGÊNCIAS ────────────────────────────────────────────── */}
        {aba === "urgencias" && (
          <DemandaList
            lista={urgentes.map(d => ({ ...d, prioridade: "urgente" as const }))}
            loading={loading}
            podeTrocar={ehAudiovisual}
            onAprovar={aprovar}
            onRecusar={(d) => setModal({ id: d.id })}
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
          <div data-approval-list className="space-y-3 max-w-3xl">
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
        </>}
      </main>

      {/* Modal recusa */}
      {modal && (
        <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm", surface.overlay)}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="approval-refuse-title" tabIndex={-1} className={cn("bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4", surface.surface)}>
            <h3 id="approval-refuse-title" className="font-semibold text-white mb-1">Recusar pedido</h3>
            <p className="text-sm text-zinc-400 mb-4">Motivo da recusa (comunicado ao solicitante via WhatsApp).</p>
            <textarea aria-label="Motivo da recusa"
              className="w-full border border-zinc-700 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-zinc-500 bg-zinc-800 text-zinc-200"
              rows={3} placeholder="Ex: Fora do escopo, informações insuficientes..."
              value={motivo} onChange={(e) => setMotivo(e.target.value)}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => recusar(modal.id, motivo)}
                disabled={loading === modal.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50">
                {loading === modal.id ? "Recusando..." : "Confirmar Recusa"}
              </button>
              <button disabled={!!loading} onClick={() => { setModal(null); setMotivo("") }}
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

// O que o pedido é, escrito no topo do card. Antes a tela mostrava o
// departamento de quem pediu ("Growth") e dois botões, com "Aprovar como Job"
// verde em todos — pedido de edição de vídeo era aprovado como Job no reflexo.
const PEDIDO: Record<FluxoDoRegistro, { rotulo: string; quadro: string; classe: string }> = {
  job: { rotulo: "Pediu videomaker · Gravação externa", quadro: "Gravações Externas", classe: "bg-violet-500/15 text-violet-200 border-violet-400/40" },
  demanda: { rotulo: "Pediu demanda", quadro: "Demandas", classe: "bg-sky-500/15 text-sky-200 border-sky-400/40" },
}

function DemandaList({
  lista, loading, podeTrocar, onAprovar, onRecusar, emptyMsg, emptyIcon,
}: {
  lista: Demanda[]; loading: string | null
  /** Trocar Job ↔ Demanda só existe no audiovisual; Growth não tem Jobs. */
  podeTrocar: boolean
  onAprovar: (d: Demanda, trocarPara?: FluxoDoRegistro) => void; onRecusar: (d: Demanda) => void
  emptyMsg: string; emptyIcon?: React.ReactNode
}) {
  // O card cuja troca de esteira está sendo confirmada.
  const [trocando, setTrocando] = useState<string | null>(null)

  if (lista.length === 0) return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      {emptyIcon ?? <CheckCircle2 className="w-12 h-12 text-green-400 mb-3" />}
      <p className="font-medium text-zinc-400">{emptyMsg}</p>
      <p className="text-sm text-zinc-500 mt-1">Tudo em dia! 🎉</p>
    </div>
  )

  return (
    <div data-approval-list className="space-y-3 max-w-3xl">
      {lista.map((d) => {
        const pedido = fluxoAtual(d)
        const outro: FluxoDoRegistro = pedido === "job" ? "demanda" : "job"
        const tipo = rotuloDoTipo(d.tipoVideo)
        const momento = pedido === "job" ? momentoDoJob(d) : null
        const onde = pedido === "job" ? ondeDoJob(d) : null
        const lugar = onde ? [onde.endereco, onde.cidade].filter(Boolean).join(" · ") : ""
        const quemPediu = d.nomeSolicitante?.trim() || d.solicitante.nome
        const confirmando = trocando === d.id
        return (
        <div key={d.id} className={cn(
          "bg-zinc-900 border rounded-2xl p-5 space-y-3",
          d.prioridade === "urgente" ? "border-red-800 shadow-sm shadow-red-900/30"
            : d.prioridade === "alta" ? "border-orange-800"
            : "border-zinc-800"
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {podeTrocar && (
                  <span className={cn("flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border", PEDIDO[pedido].classe)}>
                    {pedido === "job" ? <Clapperboard className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    {PEDIDO[pedido].rotulo}
                  </span>
                )}
                {tipo && pedido === "demanda" && (
                  <span className="text-xs text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded-full">{tipo}</span>
                )}
                {d.prioridade === "urgente" && (
                  <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-900/30 border border-red-800 px-2 py-0.5 rounded-full">
                    <Zap className="w-3 h-3" /> URGENTE
                  </span>
                )}
                {d.prioridade === "alta" && (
                  <span className="text-xs font-semibold text-orange-400 bg-orange-900/20 border border-orange-800 px-2 py-0.5 rounded-full">ALTA</span>
                )}
              </div>
              <h3 className="font-semibold text-zinc-100">{d.titulo}</h3>
              <p className="text-xs font-mono text-zinc-500 mt-0.5">{d.codigo}</p>
            </div>
            <span className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
              <Clock className="w-3.5 h-3.5" />
              {format(new Date(d.createdAt), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>

          <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2">{d.descricao}</p>

          {/* O que se confere antes de aprovar uma gravação: quando, onde, para quem. */}
          {pedido === "job" && podeTrocar && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                <dt className="flex items-center gap-1 text-[11px] text-zinc-500"><CalendarClock className="w-3 h-3" /> Quando</dt>
                <dd className={momento ? "text-zinc-100 font-medium" : "text-amber-300"}>{momento ? rotuloDoMomento(momento) : "Sem data"}</dd>
              </div>
              <div className="rounded-lg bg-zinc-800/50 px-3 py-2 min-w-0">
                <dt className="flex items-center gap-1 text-[11px] text-zinc-500"><Building2 className="w-3 h-3" /> Cliente</dt>
                <dd className="truncate text-zinc-100 font-medium">{d.clienteFinalNome?.trim() || "—"}</dd>
              </div>
              <div className="rounded-lg bg-zinc-800/50 px-3 py-2 min-w-0 sm:col-span-2">
                <dt className="flex items-center gap-1 text-[11px] text-zinc-500"><MapPin className="w-3 h-3" /> Onde</dt>
                <dd className={lugar ? "text-zinc-100 font-medium" : "text-amber-300"}>{lugar || "Sem endereço"}</dd>
              </div>
            </dl>
          )}

          {d.motivoUrgencia && (
            <div className="flex items-start gap-2 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{d.motivoUrgencia}</p>
            </div>
          )}

          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-zinc-500">
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{quemPediu} · {DEPT_LABEL[d.departamento] ?? d.departamento}</span>
            {pedido === "demanda" && d.dataLimite && <span>Prazo {formatarData(d.dataLimite)}</span>}
            <Link href={`/demandas/${d.id}`} className="text-blue-400 hover:underline ml-auto">Ver detalhes →</Link>
          </div>

          {confirmando ? (
            /* A troca de esteira é a exceção: pede confirmação, dizendo o que
               muda. É o caminho para o pedido feito no lugar errado. */
            <div className="space-y-3 pt-3 border-t border-zinc-800">
              <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 leading-relaxed">
                {outro === "job"
                  ? "Foi pedido como demanda. Aprovar como gravação externa manda para Gravações Externas, para escalar um videomaker."
                  : "Foi pedido como gravação externa (videomaker). Aprovar como demanda manda para o quadro de Demandas, fora da escala de videomaker."}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => { setTrocando(null); onAprovar(d, outro) }}
                  disabled={loading === d.id}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50">
                  <ArrowRightLeft className="w-4 h-4" /> Aprovar como {outro === "job" ? "gravação externa" : "demanda"}
                </button>
                <button
                  onClick={() => setTrocando(null)}
                  className="flex-1 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium py-2.5 rounded-xl">
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 pt-3 border-t border-zinc-800">
              {/* O botão principal aprova o que foi pedido: Job vai para Jobs,
                  demanda vai para Demandas. Nada é reclassificado. */}
              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <button
                  onClick={() => onAprovar(d)}
                  disabled={loading === d.id}
                  className="flex-[2] flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50">
                  <CheckCircle2 className="w-4 h-4" /> {!podeTrocar ? "Aprovar" : pedido === "job" ? "Aprovar gravação" : "Aprovar demanda"}
                </button>
                <button
                  onClick={() => onRecusar(d)}
                  disabled={loading === d.id}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-red-800 text-red-400 hover:bg-red-900/20 text-sm font-medium py-2.5 rounded-xl disabled:opacity-50">
                  <XCircle className="w-4 h-4" /> Recusar
                </button>
              </div>
              {podeTrocar && (
                <button
                  onClick={() => setTrocando(d.id)}
                  disabled={loading === d.id}
                  className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-4 decoration-zinc-700 disabled:opacity-50">
                  Pedido no lugar errado? Aprovar como {outro === "job" ? "gravação externa" : "demanda"}
                </button>
              )}
            </div>
          )}
        </div>
        )
      })}
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
    <div data-approval-list className="space-y-3 max-w-3xl">
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
                <MoneyDisplay value={c.valor} size="lg" />
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
    <div data-approval-list className="space-y-3 max-w-3xl">
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
