"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, Loader2, MapPin, Calendar, DollarSign, Film, CheckSquare, FileText,
  ClipboardCheck, Plus, ExternalLink, Trash2, Video, Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import { TIPO_EVENTO_LABEL, STATUS_EVENTO_STYLE } from "../page"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
const fmtData = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
const fmtMoney = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`

type Tab = "geral" | "audiovisual" | "checklist" | "documentos" | "orcamento" | "aprovacoes" | "relatorio"

const TABS: { id: Tab; label: string; icon: typeof Film }[] = [
  { id: "geral", label: "Visão Geral", icon: Calendar },
  { id: "audiovisual", label: "Audiovisual", icon: Film },
  { id: "checklist", label: "Checklist", icon: CheckSquare },
  { id: "documentos", label: "Documentos", icon: FileText },
  { id: "orcamento", label: "Orçamento", icon: DollarSign },
  { id: "aprovacoes", label: "Aprovações", icon: ClipboardCheck },
  { id: "relatorio", label: "Relatório", icon: Sparkles },
]

const STATUS_DEMANDA_LABEL: Record<string, string> = {
  entrada: "Entrada", producao: "Produção", edicao: "Edição",
  aprovacao: "Aprovação", para_postar: "Para Postar", finalizado: "Finalizado",
}

export default function EventoDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("geral")
  const { data, mutate, isLoading } = useSWR<{ evento: Evento; financeiro: Financeiro }>(`/api/eventos/${id}`, fetcher)

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
  if (!data?.evento) return <div className="p-6 text-zinc-500">Evento não encontrado.</div>

  const ev = data.evento
  const st = STATUS_EVENTO_STYLE[ev.status] ?? STATUS_EVENTO_STYLE.planejamento

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => router.push("/eventos")} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Eventos
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{TIPO_EVENTO_LABEL[ev.tipo] ?? ev.tipo}</span>
            <span className="text-[10px] text-zinc-600 font-mono">{ev.codigo}</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">{ev.nome}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500 flex-wrap">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {fmtData(ev.dataInicio)} → {fmtData(ev.dataFim)}</span>
            {ev.cidade && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {ev.cidade}{ev.estado ? `/${ev.estado}` : ""}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-bold text-purple-400">{ev.percentualConclusao}%</div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Concluído</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 mb-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-purple-500 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "geral" && <TabGeral ev={ev} financeiro={data.financeiro} onMutate={mutate} />}
      {tab === "audiovisual" && <TabAudiovisual ev={ev} />}
      {tab === "checklist" && <TabChecklist eventoId={id} checklist={ev.checklist} onMutate={mutate} />}
      {tab === "documentos" && <TabDocumentos eventoId={id} documentos={ev.documentos} onMutate={mutate} />}
      {tab === "orcamento" && <TabOrcamento eventoId={id} custos={ev.custos} financeiro={data.financeiro} onMutate={mutate} />}
      {tab === "aprovacoes" && <TabAprovacoes eventoId={id} aprovacoes={ev.aprovacoes} onMutate={mutate} />}
      {tab === "relatorio" && <TabRelatorio eventoId={id} />}
    </div>
  )
}

// ─── Relatório Final (IA) ─────────────────────────────────────────────────────
function TabRelatorio({ eventoId }: { eventoId: string }) {
  const [relatorio, setRelatorio] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  async function gerar() {
    setLoading(true)
    try {
      const res = await fetch(`/api/eventos/${eventoId}/relatorio`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Erro ao gerar relatório")
      setRelatorio(json.relatorio)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar relatório")
    } finally { setLoading(false) }
  }
  return (
    <div className="space-y-4">
      <button onClick={gerar} disabled={loading}
        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? "Gerando…" : relatorio ? "Gerar novamente" : "Gerar Relatório Final (IA)"}
      </button>
      {relatorio && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">{relatorio}</pre>
        </div>
      )}
    </div>
  )
}

// ─── Visão Geral ──────────────────────────────────────────────────────────────
function TabGeral({ ev, financeiro, onMutate }: { ev: Evento; financeiro: Financeiro; onMutate: () => void }) {
  const [status, setStatus] = useState(ev.status)
  async function mudarStatus(novo: string) {
    setStatus(novo)
    await fetch(`/api/eventos/${ev.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: novo }) })
    onMutate()
    toast.success("Status atualizado")
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Demandas" value={String(ev.demandas.length)} icon={<Film className="w-4 h-4 text-blue-400" />} />
        <Card label="Documentos" value={String(ev.documentos.length)} icon={<FileText className="w-4 h-4 text-amber-400" />} />
        <Card label="Custo total" value={fmtMoney(financeiro.custoTotal)} icon={<DollarSign className="w-4 h-4 text-emerald-400" />} />
        <Card label="Orçamento" value={ev.orcamentoPrevisto ? fmtMoney(ev.orcamentoPrevisto) : "—"} icon={<DollarSign className="w-4 h-4 text-zinc-400" />} />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <label className="block text-xs text-zinc-500 mb-2">Status do evento</label>
        <select value={status} onChange={(e) => mudarStatus(e.target.value)} className={inputCls + " max-w-xs"}>
          {Object.entries(STATUS_EVENTO_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {ev.descricao && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase mb-2">Descrição</h4>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{ev.descricao}</p>
        </div>
      )}
      {ev.objetivo && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase mb-2">Objetivo</h4>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{ev.objetivo}</p>
        </div>
      )}
    </div>
  )
}

// ─── Audiovisual (demandas + cobertura) ───────────────────────────────────────
function TabAudiovisual({ ev }: { ev: Evento }) {
  return (
    <div className="space-y-4">
      {ev.cobertura && (
        <Link href={`/coberturas/${ev.cobertura.id}`}
          className="flex items-center justify-between bg-zinc-900 border border-purple-700/40 rounded-xl p-4 hover:border-purple-600 transition-colors">
          <div className="flex items-center gap-3">
            <Video className="w-5 h-5 text-purple-400" />
            <div>
              <p className="text-sm font-medium text-zinc-100">Cobertura audiovisual</p>
              <p className="text-xs text-zinc-500">{ev.cobertura.titulo}</p>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-zinc-500" />
        </Link>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Demandas geradas ({ev.demandas.length})</h3>
        </div>
        {ev.demandas.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Nenhuma demanda audiovisual vinculada.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {ev.demandas.map((d) => (
              <Link key={d.id} href={`/demandas/${d.id}`} className="flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{d.titulo}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {d.codigo} · {d.videomaker?.nome ?? "Sem videomaker"}
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 shrink-0">
                  {STATUS_DEMANDA_LABEL[d.statusVisivel] ?? d.statusVisivel}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Checklist ────────────────────────────────────────────────────────────────
function TabChecklist({ eventoId, checklist, onMutate }: { eventoId: string; checklist: TarefaItem[]; onMutate: () => void }) {
  const [novo, setNovo] = useState("")
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!novo.trim()) return
    setSaving(true)
    await fetch(`/api/eventos/${eventoId}/checklist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo: novo }) })
    setNovo(""); setSaving(false); onMutate()
  }
  async function toggle(t: TarefaItem) {
    await fetch(`/api/eventos/${eventoId}/checklist`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, concluido: !t.concluido }) })
    onMutate()
  }
  async function remover(tid: string) {
    await fetch(`/api/eventos/${eventoId}/checklist?itemId=${tid}`, { method: "DELETE" })
    onMutate()
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Nova tarefa…" className={inputCls} />
        <button onClick={add} disabled={saving} className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm disabled:opacity-50"><Plus className="w-4 h-4" /></button>
      </div>
      {checklist.length === 0 ? (
        <p className="text-sm text-zinc-500 py-6 text-center">Nenhuma tarefa. Adicione acima.</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
          {checklist.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-3 group">
              <button onClick={() => toggle(t)} className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${t.concluido ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"}`}>
                {t.concluido && <CheckSquare className="w-3 h-3 text-white" />}
              </button>
              <span className={`flex-1 text-sm ${t.concluido ? "line-through text-zinc-500" : "text-zinc-200"}`}>{t.titulo}</span>
              <button onClick={() => remover(t.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Documentos ───────────────────────────────────────────────────────────────
const CAT_DOC: Record<string, string> = {
  manual_expositor: "Manual do Expositor", programacao: "Programação", briefing: "Briefing",
  contratos: "Contratos", planta: "Planta", projeto_stand: "Projeto do Stand",
  layout_identidade: "Layout/Identidade", material_impresso: "Material Impresso",
  artes_digitais: "Artes Digitais", audiovisual: "Audiovisual", outros: "Outros",
}
function TabDocumentos({ eventoId, documentos, onMutate }: { eventoId: string; documentos: DocItem[]; onMutate: () => void }) {
  const [form, setForm] = useState({ nome: "", categoria: "briefing", linkExterno: "" })
  async function add() {
    if (!form.nome.trim()) { toast.error("Nome do documento obrigatório"); return }
    await fetch(`/api/eventos/${eventoId}/documentos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    setForm({ nome: "", categoria: "briefing", linkExterno: "" }); onMutate()
  }
  async function remover(did: string) {
    await fetch(`/api/eventos/${eventoId}/documentos?docId=${did}`, { method: "DELETE" }); onMutate()
  }
  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
        <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome do documento" className={inputCls} />
        <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} className={inputCls + " md:w-44"}>
          {Object.entries(CAT_DOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={form.linkExterno} onChange={(e) => setForm((f) => ({ ...f, linkExterno: e.target.value }))} placeholder="Link (Drive, etc.)" className={inputCls} />
        <button onClick={add} className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm whitespace-nowrap">Adicionar</button>
      </div>
      {documentos.length === 0 ? (
        <p className="text-sm text-zinc-500 py-6 text-center">Nenhum documento.</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
          {documentos.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-3 group">
              <FileText className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate">{d.nome}</p>
                <p className="text-[10px] text-zinc-500">{CAT_DOC[d.categoria] ?? d.categoria} · {d.status}</p>
              </div>
              {(d.linkExterno || d.url) && <a href={d.linkExterno || d.url || "#"} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-blue-400"><ExternalLink className="w-4 h-4" /></a>}
              <button onClick={() => remover(d.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Orçamento ────────────────────────────────────────────────────────────────
const CAT_CUSTO: Record<string, string> = {
  stand: "Stand", montagem: "Montagem", comunicacao_visual: "Comunicação Visual", audiovisual: "Audiovisual",
  buffet: "Buffet", jantar: "Jantar", brindes: "Brindes", impressos: "Impressos", trafego: "Tráfego Pago",
  hospedagem: "Hospedagem", transporte: "Transporte", palestrantes: "Palestrantes", medicos: "Médicos",
  equipe: "Equipe", taxas: "Taxas", extras: "Extras",
}
function TabOrcamento({ eventoId, custos, financeiro, onMutate }: { eventoId: string; custos: CustoItem[]; financeiro: Financeiro; onMutate: () => void }) {
  const [form, setForm] = useState({ descricao: "", categoria: "extras", valorPrevisto: "" })
  async function add() {
    if (!form.descricao.trim() || !form.valorPrevisto) { toast.error("Descrição e valor obrigatórios"); return }
    await fetch(`/api/eventos/${eventoId}/custos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    setForm({ descricao: "", categoria: "extras", valorPrevisto: "" }); onMutate()
  }
  async function remover(cid: string) {
    await fetch(`/api/eventos/${eventoId}/custos?custoId=${cid}`, { method: "DELETE" }); onMutate()
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Card label="Audiovisual (demandas)" value={fmtMoney(financeiro.custoAudiovisual)} icon={<Film className="w-4 h-4 text-blue-400" />} />
        <Card label="Outros fornecedores" value={fmtMoney(financeiro.custoEventoReal)} icon={<DollarSign className="w-4 h-4 text-amber-400" />} />
        <Card label="Custo total" value={fmtMoney(financeiro.custoTotal)} icon={<DollarSign className="w-4 h-4 text-emerald-400" />} />
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
        <input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} placeholder="Descrição do custo" className={inputCls} />
        <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} className={inputCls + " w-40"}>
          {Object.entries(CAT_CUSTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="number" value={form.valorPrevisto} onChange={(e) => setForm((f) => ({ ...f, valorPrevisto: e.target.value }))} placeholder="R$" className={inputCls + " w-28"} />
        <button onClick={add} className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm">Adicionar</button>
      </div>
      {custos.length === 0 ? (
        <p className="text-sm text-zinc-500 py-6 text-center">Nenhum custo lançado (além do audiovisual).</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
          {custos.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 group">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate">{c.descricao}</p>
                <p className="text-[10px] text-zinc-500">{CAT_CUSTO[c.categoria] ?? c.categoria}{c.fornecedor ? ` · ${c.fornecedor.nome}` : ""}</p>
              </div>
              <span className="text-sm text-zinc-300">{fmtMoney(c.valorReal ?? c.valorPrevisto)}</span>
              <button onClick={() => remover(c.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Aprovações ───────────────────────────────────────────────────────────────
const TIPO_APROV: Record<string, string> = { orcamento: "Orçamento", layout: "Layout", material: "Material", contrato: "Contrato", entrega: "Entrega" }
function TabAprovacoes({ eventoId, aprovacoes, onMutate }: { eventoId: string; aprovacoes: AprovacaoItem[]; onMutate: () => void }) {
  const [tipo, setTipo] = useState("orcamento")
  async function add() {
    await fetch(`/api/eventos/${eventoId}/aprovacoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo }) })
    onMutate()
  }
  async function decidir(aid: string, status: string) {
    await fetch(`/api/eventos/${eventoId}/aprovacoes`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: aid, status }) })
    onMutate()
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
          {Object.entries(TIPO_APROV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={add} className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm whitespace-nowrap"><Plus className="w-4 h-4" /></button>
      </div>
      {aprovacoes.length === 0 ? (
        <p className="text-sm text-zinc-500 py-6 text-center">Nenhuma aprovação solicitada.</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
          {aprovacoes.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3">
              <span className="flex-1 text-sm text-zinc-200">{TIPO_APROV[a.tipo] ?? a.tipo}</span>
              {a.status === "pendente" ? (
                <div className="flex gap-1.5">
                  <button onClick={() => decidir(a.id, "aprovado")} className="text-xs px-2 py-1 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-600/40 hover:bg-emerald-600/30">Aprovar</button>
                  <button onClick={() => decidir(a.id, "reprovado")} className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-300 border border-red-600/40 hover:bg-red-600/30">Reprovar</button>
                </div>
              ) : (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.status === "aprovado" ? "bg-emerald-900/60 text-emerald-300" : "bg-red-900/60 text-red-300"}`}>{a.status}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Card({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{icon}{label}</div>
      <div className="text-lg font-bold text-zinc-100">{value}</div>
    </div>
  )
}

// Types
type Evento = {
  id: string; codigo: string; nome: string; tipo: string; status: string
  descricao: string | null; objetivo: string | null
  cidade: string | null; estado: string | null; local: string | null
  dataInicio: string; dataFim: string; orcamentoPrevisto: number | null; percentualConclusao: number
  cobertura: { id: string; slug: string; titulo: string; status: string } | null
  checklist: TarefaItem[]; documentos: DocItem[]; custos: CustoItem[]; aprovacoes: AprovacaoItem[]
  demandas: { id: string; codigo: string; titulo: string; tipoVideo: string; statusVisivel: string; statusInterno: string; videomaker: { nome: string } | null }[]
}
type Financeiro = { custoEventoPrevisto: number; custoEventoReal: number; custoAudiovisual: number; custoTotal: number }
type TarefaItem = { id: string; titulo: string; concluido: boolean; categoria: string | null; status: string }
type DocItem = { id: string; nome: string; categoria: string; status: string; url: string | null; linkExterno: string | null }
type CustoItem = { id: string; descricao: string; categoria: string; valorPrevisto: number; valorReal: number | null; fornecedor: { id: string; nome: string } | null }
type AprovacaoItem = { id: string; tipo: string; status: string }
