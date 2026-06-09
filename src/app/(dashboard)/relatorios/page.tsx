"use client"

import { useState, useCallback, useEffect } from "react"
import { toast } from "sonner"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import {
  BarChart2,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Film,
  Users,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Zap,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Calendar,
  Target,
  Activity,
  ArrowUpRight,
  Printer,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Metricas {
  geradoEm: string
  periodo?: { de: string; ate: string; tipo: string }
  demandas: {
    totalAtivas: number
    totalMes: number
    totalSemana: number
    concluidas30d: number
    urgentes: number
    emAtraso: number
    aguardandoAprovacao: number
    emEdicao: number
    tempoMedioConclusao: number
    porTipo: { tipo: string; count: number }[]
    porStatus: { status: string; count: number }[]
  }
  custos: {
    totalMes: number
    totalSemana: number
    total30d: number
    qtdServicos30d: number
    custoPorVideo: number
    topVideomakers: {
      id: string
      nome: string
      valorDiaria: number
      totalGasto: number
      qtdServicos: number
      mediaServico: number
    }[]
  }
  producao?: {
    valorPorDemanda: number
    producaoMes: number
    producao30d: number
    demandasFinalizadasMes: number
    demandasFinalizadas30d: number
    videosEntreguesMes?: number
    videosEntregues30d?: number
    onTimeRate?: number | null
  }
  videomakers: {
    total: number
    ativos: number
    topPorDemandas: { id: string; nome: string; avaliacao: number; valorDiaria: number; demandasMes: number }[]
  }
  alertas: { ativos: number; criticos: number }
  tendencia: { semana: string; criadas: number; concluidas: number }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface RelatorioGerado {
  id: string
  tipo: string
  periodo: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conteudo: Record<string, any>
  tokens: number
  modelo: string
  createdAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })

const fmtNum = (v: number) => v.toLocaleString("pt-BR")

const STATUS_LABELS: Record<string, string> = {
  entrada: "Entrada",
  producao: "Produção",
  edicao: "Edição",
  aprovacao: "Aprovação",
  para_postar: "Para Postar",
  finalizado: "Finalizado",
}

const TIPO_RELATORIO_LABELS: Record<string, string> = {
  produtividade_time: "Produtividade da Equipe",
  analise_custos: "Análise de Custos",
  otimizacao_contratacao: "Otimização de Contratação",
  performance_videomaker: "Performance dos Videomakers",
  semanal: "Relatório Semanal",
  mensal: "Relatório Mensal",
  realtime: "Análise em Tempo Real",
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  cor = "zinc",
  alert = false,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  cor?: string
  alert?: boolean
}) {
  const corMap: Record<string, string> = {
    zinc: "bg-zinc-800 border-zinc-700",
    blue: "bg-blue-950/40 border-blue-800/50",
    green: "bg-green-950/40 border-green-800/50",
    red: "bg-red-950/40 border-red-800/50",
    amber: "bg-amber-950/40 border-amber-800/50",
    purple: "bg-purple-950/40 border-purple-800/50",
  }
  const iconMap: Record<string, string> = {
    zinc: "text-zinc-400",
    blue: "text-blue-400",
    green: "text-green-400",
    red: "text-red-400",
    amber: "text-amber-400",
    purple: "text-purple-400",
  }
  return (
    <div className={`rounded-xl border p-4 ${corMap[cor]} ${alert ? "ring-1 ring-red-500/50" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <Icon className={`w-5 h-5 ${iconMap[cor]}`} />
        {alert && <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-medium">Atenção</span>}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-zinc-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  )
}

// KPI grande com comparação vs período anterior (▲▼)
function KpiCard({
  label, value, atual, anterior, inverter = false, sub,
}: {
  label: string
  value: string
  atual?: number | null
  anterior?: number | null
  inverter?: boolean // true quando MENOR é melhor (tempo, custo)
  sub?: string
}) {
  let delta: number | null = null
  if (atual != null && anterior != null && anterior !== 0) {
    delta = Math.round(((atual - anterior) / Math.abs(anterior)) * 100)
  }
  const positivo = delta == null ? null : inverter ? delta < 0 : delta > 0
  const corDelta = delta == null || delta === 0 ? "text-zinc-500" : positivo ? "text-emerald-400" : "text-red-400"
  const Seta = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 print:border-zinc-300 print:bg-white">
      <div className="text-xs text-zinc-500 uppercase tracking-wide print:text-zinc-600">{label}</div>
      <div className="text-3xl font-bold text-white mt-1 print:text-black">{value}</div>
      <div className="flex items-center gap-2 mt-1.5">
        {delta != null && (
          <span className={`flex items-center gap-1 text-xs font-medium ${corDelta}`}>
            <Seta className="w-3.5 h-3.5" /> {delta > 0 ? "+" : ""}{delta}%
          </span>
        )}
        <span className="text-xs text-zinc-500 print:text-zinc-600">{sub ?? "vs período anterior"}</span>
      </div>
    </div>
  )
}

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

// Modal para lançar/editar produção manual de um mês (vídeos sem card + frentes presenciais)
type LinhaManual = { categoria: string; quantidade: string }
function EditarProducaoManualModal({ area, onClose, onSaved }: { area: string; onClose: () => void; onSaved: () => void }) {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const competencia = ano * 100 + mes
  const url = `/api/producao-manual?area=${area}&de=${ano}-${String(mes).padStart(2, "0")}-01&ate=${ano}-${String(mes).padStart(2, "0")}-28`
  const { data, mutate } = useSWR<{ lancamentos: { id: string; grupo: string; categoria: string; quantidade: number }[] }>(url, fetcher)
  const [producao, setProducao] = useState<LinhaManual[]>([])
  const [presencial, setPresencial] = useState<LinhaManual[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const ls = data?.lancamentos ?? []
    const prod = ls.filter((l) => l.grupo !== "presencial")
    const pres = ls.filter((l) => l.grupo === "presencial")
    setProducao(prod.length ? prod.map((l) => ({ categoria: l.categoria, quantidade: String(l.quantidade) })) : [{ categoria: "Linha Med", quantidade: "" }, { categoria: "Linha Estética", quantidade: "" }])
    setPresencial(pres.length ? pres.map((l) => ({ categoria: l.categoria, quantidade: String(l.quantidade) })) : [{ categoria: "Eventos / jantares", quantidade: "" }, { categoria: "Coberturas de congresso", quantidade: "" }, { categoria: "Treinamento interno", quantidade: "" }, { categoria: "Webinar", quantidade: "" }])
  }, [data, competencia])

  async function salvar() {
    setSaving(true)
    try {
      const grupos: [LinhaManual[], string][] = [[producao, "producao"], [presencial, "presencial"]]
      for (const [linhas, grupo] of grupos) {
        for (const l of linhas) {
          if (!l.categoria.trim()) continue
          await fetch("/api/producao-manual", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ competencia, area, grupo, categoria: l.categoria.trim(), quantidade: parseInt(l.quantidade) || 0 }),
          })
        }
      }
      toast.success("Números lançados!")
      mutate(); onSaved(); onClose()
    } catch { toast.error("Erro ao salvar") } finally { setSaving(false) }
  }

  const inputCls = "bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500"

  function Secao({ titulo, linhas, setLinhas, placeholder }: { titulo: string; linhas: LinhaManual[]; setLinhas: React.Dispatch<React.SetStateAction<LinhaManual[]>>; placeholder: string }) {
    return (
      <div>
        <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-2">{titulo}</div>
        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={l.categoria} onChange={(e) => setLinhas((ls) => ls.map((x, idx) => idx === i ? { ...x, categoria: e.target.value } : x))} placeholder={placeholder} className={inputCls + " flex-1"} />
              <input type="number" value={l.quantidade} onChange={(e) => setLinhas((ls) => ls.map((x, idx) => idx === i ? { ...x, quantidade: e.target.value } : x))} placeholder="0" className={inputCls + " w-20"} />
              <button onClick={() => setLinhas((ls) => ls.filter((_, idx) => idx !== i))} className="text-zinc-600 hover:text-red-400 p-1">✕</button>
            </div>
          ))}
          <button onClick={() => setLinhas((ls) => [...ls, { categoria: "", quantidade: "" }])} className="text-xs text-purple-400 hover:text-purple-300">+ Adicionar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-zinc-100 mb-1">Lançar números do mês</h2>
        <p className="text-xs text-zinc-500 mb-4">Produção que não virou card + frentes presenciais.</p>

        <div className="flex items-center gap-2 mb-4">
          <select value={mes} onChange={(e) => setMes(parseInt(e.target.value))} className={inputCls}>
            {MESES_LABEL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={ano} onChange={(e) => setAno(parseInt(e.target.value))} className={inputCls}>
            {[hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="space-y-5">
          <Secao titulo={`${area === "design" ? "Artes" : "Vídeos"} produzidos (sem card)`} linhas={producao} setLinhas={setProducao} placeholder="Categoria (ex: Linha Med)" />
          <Secao titulo="Frentes presenciais" linhas={presencial} setLinhas={setPresencial} placeholder="Ex: Coberturas de congresso" />
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="flex-1 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50">
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  )
}

function TendenciaBar({ semana, criadas, concluidas, maxVal }: { semana: string; criadas: number; concluidas: number; maxVal: number }) {
  const hCriadas = maxVal > 0 ? (criadas / maxVal) * 100 : 0
  const hConcluidas = maxVal > 0 ? (concluidas / maxVal) * 100 : 0
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="relative flex items-end gap-1 h-24 w-full justify-center">
        <div className="flex flex-col justify-end h-full">
          <div style={{ height: `${hCriadas}%` }} className="w-5 bg-blue-500/60 rounded-t" title={`${criadas} criadas`} />
        </div>
        <div className="flex flex-col justify-end h-full">
          <div style={{ height: `${hConcluidas}%` }} className="w-5 bg-green-500/60 rounded-t" title={`${concluidas} concluídas`} />
        </div>
      </div>
      <span className="text-[10px] text-zinc-500">{semana}</span>
    </div>
  )
}

function RelatorioBadge({ tipo }: { tipo: string }) {
  const colors: Record<string, string> = {
    produtividade_time: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    analise_custos: "bg-green-500/20 text-green-300 border-green-500/30",
    otimizacao_contratacao: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    performance_videomaker: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    semanal: "bg-zinc-600/30 text-zinc-300 border-zinc-600/40",
    mensal: "bg-zinc-600/30 text-zinc-300 border-zinc-600/40",
    realtime: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  }
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${colors[tipo] ?? "bg-zinc-700 text-zinc-400"}`}>
      {TIPO_RELATORIO_LABELS[tipo] ?? tipo}
    </span>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RelatorioConteudo({ conteudo, tipo }: { conteudo: Record<string, any>; tipo: string }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const toggle = (key: string) => setExpanded(expanded === key ? null : key)

  // ── Produtividade ─────────────────────────────────────────────────────────
  if (tipo === "produtividade_time") {
    const score = conteudo.score_produtividade as number
    const scoreCor = score >= 70 ? "text-green-400" : score >= 40 ? "text-amber-400" : "text-red-400"
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className={`text-5xl font-bold ${scoreCor}`}>{score}</div>
          <div>
            <div className="text-sm text-zinc-300 font-medium">Score de Produtividade</div>
            <div className="text-xs text-zinc-500">Baseado em conclusões, SLA e eficiência</div>
          </div>
        </div>

        <p className="text-sm text-zinc-300 leading-relaxed">{conteudo.resumo_executivo as string}</p>

        {/* Pontos fortes */}
        {Array.isArray(conteudo.pontos_fortes) && conteudo.pontos_fortes.length > 0 && (
          <div>
            <button onClick={() => toggle("fortes")} className="flex items-center gap-2 text-sm font-medium text-green-400 mb-2">
              <CheckCircle2 className="w-4 h-4" />
              Pontos Fortes ({(conteudo.pontos_fortes as string[]).length})
              {expanded === "fortes" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {expanded === "fortes" && (
              <ul className="space-y-1">
                {(conteudo.pontos_fortes as string[]).map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="text-green-500 mt-0.5">✓</span> {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Gargalos */}
        {Array.isArray(conteudo.gargalos) && conteudo.gargalos.length > 0 && (
          <div>
            <button onClick={() => toggle("gargalos")} className="flex items-center gap-2 text-sm font-medium text-amber-400 mb-2">
              <AlertTriangle className="w-4 h-4" />
              Gargalos Identificados ({(conteudo.gargalos as unknown[]).length})
              {expanded === "gargalos" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {expanded === "gargalos" && (
              <div className="space-y-2">
                {(conteudo.gargalos as { problema: string; impacto: string; solucao: string }[]).map((g, i) => (
                  <div key={i} className="bg-amber-950/30 border border-amber-800/30 rounded-lg p-3">
                    <div className="text-sm font-medium text-amber-300">{g.problema}</div>
                    <div className="text-xs text-zinc-400 mt-1">Impacto: {g.impacto}</div>
                    <div className="text-xs text-emerald-400 mt-1">→ {g.solucao}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Oportunidades */}
        {Array.isArray(conteudo.oportunidades_melhoria) && (
          <div>
            <button onClick={() => toggle("ops")} className="flex items-center gap-2 text-sm font-medium text-blue-400 mb-2">
              <Target className="w-4 h-4" />
              Oportunidades ({(conteudo.oportunidades_melhoria as unknown[]).length})
              {expanded === "ops" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {expanded === "ops" && (
              <div className="space-y-2">
                {(conteudo.oportunidades_melhoria as { area: string; acao: string; ganho_estimado: string }[]).map((o, i) => (
                  <div key={i} className="bg-blue-950/20 border border-blue-800/30 rounded-lg p-3">
                    <div className="text-xs font-medium text-blue-300 uppercase tracking-wide">{o.area}</div>
                    <div className="text-sm text-zinc-300 mt-0.5">{o.acao}</div>
                    <div className="text-xs text-green-400 mt-1">Ganho: {o.ganho_estimado}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Feedback do processo */}
        {conteudo.feedback_processo && (
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Feedback IA do Processo
            </div>
            <p className="text-sm text-zinc-300">{conteudo.feedback_processo as string}</p>
          </div>
        )}
      </div>
    )
  }

  // ── Análise de Custos ─────────────────────────────────────────────────────
  if (tipo === "analise_custos") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-300 leading-relaxed">{conteudo.resumo_financeiro as string}</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-green-400">{fmt(conteudo.total_periodo as number)}</div>
            <div className="text-xs text-zinc-500">Total do período</div>
          </div>
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-blue-400">{fmt(conteudo.custo_medio_video as number)}</div>
            <div className="text-xs text-zinc-500">Custo médio/vídeo</div>
          </div>
        </div>

        {conteudo.avaliacao_roi && (
          <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg p-3">
            <div className="text-xs font-medium text-emerald-400 mb-1">Avaliação ROI</div>
            <p className="text-sm text-zinc-300">{conteudo.avaliacao_roi as string}</p>
          </div>
        )}

        {Array.isArray(conteudo.videomakers_eficientes) && (
          <div>
            <button onClick={() => toggle("vms")} className="flex items-center gap-2 text-sm font-medium text-purple-400 mb-2">
              <Users className="w-4 h-4" />
              Eficiência por Videomaker
              {expanded === "vms" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {expanded === "vms" && (
              <div className="space-y-2">
                {(conteudo.videomakers_eficientes as { nome: string; custo_beneficio: string; recomendacao: string }[]).map((v, i) => (
                  <div key={i} className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-3">
                    <div>
                      <div className="text-sm font-medium text-white">{v.nome}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">{v.custo_beneficio}</div>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                      v.recomendacao === "manter" ? "bg-green-500/20 text-green-300" :
                      v.recomendacao === "aumentar" ? "bg-blue-500/20 text-blue-300" :
                      "bg-red-500/20 text-red-300"
                    }`}>
                      {v.recomendacao}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {Array.isArray(conteudo.otimizacoes_contratacao) && (
          <div>
            <button onClick={() => toggle("otim")} className="flex items-center gap-2 text-sm font-medium text-amber-400 mb-2">
              <TrendingUp className="w-4 h-4" />
              Otimizações Sugeridas
              {expanded === "otim" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {expanded === "otim" && (
              <div className="space-y-2">
                {(conteudo.otimizacoes_contratacao as { tipo: string; descricao: string; economia_potencial: string }[]).map((o, i) => (
                  <div key={i} className="bg-amber-950/20 border border-amber-800/30 rounded-lg p-3">
                    <div className="text-xs font-semibold text-amber-300">{o.tipo}</div>
                    <div className="text-sm text-zinc-300 mt-0.5">{o.descricao}</div>
                    <div className="text-xs text-green-400 mt-1">Economia: {o.economia_potencial}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {conteudo.projecao_mes_seguinte && (
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 mb-1">
              <Calendar className="w-3.5 h-3.5" /> Projeção Próximo Mês
            </div>
            <div className="text-lg font-bold text-white">
              {fmt((conteudo.projecao_mes_seguinte as { valor_estimado: number }).valor_estimado)}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {(conteudo.projecao_mes_seguinte as { base_calculo: string }).base_calculo}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Relatório Geral (semanal/mensal/realtime) ──────────────────────────────
  if (["semanal", "mensal", "realtime"].includes(tipo)) {
    const saude = conteudo.saude_geral_sistema as number
    const saudeCor = saude >= 70 ? "text-green-400" : saude >= 40 ? "text-amber-400" : "text-red-400"
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className={`text-4xl font-bold ${saudeCor}`}>{saude}</div>
          <div>
            <div className="text-sm font-medium text-zinc-300">Saúde Geral do Sistema</div>
            <div className="text-xs text-zinc-500">{conteudo.titulo as string}</div>
          </div>
        </div>

        <p className="text-sm text-zinc-300 leading-relaxed">{conteudo.resumo_executivo as string}</p>

        {/* KPIs */}
        {Array.isArray(conteudo.kpis) && (
          <div className="grid grid-cols-2 gap-2">
            {(conteudo.kpis as { nome: string; valor: string; tendencia: string; avaliacao: string }[]).map((kpi, i) => (
              <div key={i} className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{kpi.nome}</span>
                  {kpi.tendencia === "up" ? (
                    <TrendingUp className={`w-3 h-3 ${kpi.avaliacao === "bom" ? "text-green-400" : "text-red-400"}`} />
                  ) : kpi.tendencia === "down" ? (
                    <TrendingDown className={`w-3 h-3 ${kpi.avaliacao === "bom" ? "text-green-400" : "text-red-400"}`} />
                  ) : (
                    <Minus className="w-3 h-3 text-zinc-500" />
                  )}
                </div>
                <div className="text-sm font-bold text-white">{kpi.valor}</div>
              </div>
            ))}
          </div>
        )}

        {/* Destaques */}
        {Array.isArray(conteudo.destaques_positivos) && conteudo.destaques_positivos.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-green-400 flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> Destaques Positivos
            </div>
            {(conteudo.destaques_positivos as string[]).map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span> {d}
              </div>
            ))}
          </div>
        )}

        {/* Atenção */}
        {Array.isArray(conteudo.pontos_atencao) && conteudo.pontos_atencao.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-amber-400 flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> Pontos de Atenção
            </div>
            {(conteudo.pontos_atencao as string[]).map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠</span> {p}
              </div>
            ))}
          </div>
        )}

        {/* Ações */}
        {Array.isArray(conteudo.acoes_recomendadas) && (
          <div>
            <button onClick={() => toggle("acoes")} className="flex items-center gap-2 text-sm font-medium text-blue-400 mb-2">
              <Target className="w-4 h-4" />
              Ações Recomendadas ({(conteudo.acoes_recomendadas as unknown[]).length})
              {expanded === "acoes" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {expanded === "acoes" && (
              <div className="space-y-2">
                {(conteudo.acoes_recomendadas as { prioridade: string; acao: string; responsavel: string }[]).map((a, i) => (
                  <div key={i} className="flex gap-3 bg-zinc-800/50 rounded-lg p-3">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded self-start mt-0.5 ${
                      a.prioridade === "alta" ? "bg-red-500/20 text-red-300" :
                      a.prioridade === "media" ? "bg-amber-500/20 text-amber-300" :
                      "bg-zinc-600/30 text-zinc-400"
                    }`}>{a.prioridade.toUpperCase()}</span>
                    <div>
                      <div className="text-sm text-zinc-200">{a.acao}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">→ {a.responsavel}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {conteudo.previsao_proximo_periodo && (
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-300">
            <div className="text-xs font-medium text-zinc-400 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Previsão
            </div>
            {conteudo.previsao_proximo_periodo as string}
          </div>
        )}
      </div>
    )
  }

  // ── Performance Videomaker ────────────────────────────────────────────────
  if (tipo === "performance_videomaker") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-300 leading-relaxed">{conteudo.insights_equipe as string}</p>
        {Array.isArray(conteudo.ranking_performance) && (
          <div className="space-y-3">
            {(conteudo.ranking_performance as {
              posicao: number; nome: string; score_performance: number
              pontos_fortes: string[]; areas_melhoria: string[]; recomendacao: string
            }[]).map((vm, i) => (
              <div key={i} className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-500">#{vm.posicao}</span>
                    <span className="text-sm font-medium text-white">{vm.nome}</span>
                  </div>
                  <div className={`text-lg font-bold ${vm.score_performance >= 70 ? "text-green-400" : vm.score_performance >= 40 ? "text-amber-400" : "text-red-400"}`}>
                    {vm.score_performance}
                  </div>
                </div>
                <p className="text-xs text-zinc-300 mb-2">{vm.recomendacao}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-green-400 font-medium mb-1">Pontos Fortes</div>
                    {vm.pontos_fortes.map((p, j) => <div key={j} className="text-zinc-400">• {p}</div>)}
                  </div>
                  <div>
                    <div className="text-amber-400 font-medium mb-1">A Melhorar</div>
                    {vm.areas_melhoria.map((p, j) => <div key={j} className="text-zinc-400">• {p}</div>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {conteudo.proximo_passo && (
          <div className="bg-blue-950/30 border border-blue-800/30 rounded-lg p-3 text-sm text-zinc-300">
            <div className="text-xs font-medium text-blue-400 mb-1">Próximo Passo</div>
            {conteudo.proximo_passo as string}
          </div>
        )}
      </div>
    )
  }

  // Fallback
  return (
    <pre className="text-xs text-zinc-400 bg-zinc-900 rounded-lg p-3 overflow-auto max-h-64">
      {JSON.stringify(conteudo, null, 2)}
    </pre>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type Periodo = "semana" | "mes" | "3meses" | "ano" | "custom"

const PERIODO_LABELS: Record<Periodo, string> = {
  semana: "Esta Semana",
  mes: "Este Mês",
  "3meses": "3 Meses",
  ano: "Este Ano",
  custom: "Personalizado",
}

export default function RelatoriosPage() {
  const [abaAtiva, setAbaAtiva] = useState<"resultados" | "realtime" | "historico" | "ia">("resultados")
  const [gerando, setGerando] = useState<string | null>(null)
  const [relatorioAtual, setRelatorioAtual] = useState<RelatorioGerado | null>(null)
  const [tipoSelecionado, setTipoSelecionado] = useState("produtividade_time")

  // ── Filtro de período ─────────────────────────────────────────────────────
  const [periodo, setPeriodo] = useState<Periodo>("ano")
  const [periodoCustomDe, setPeriodoCustomDe] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10)
  })
  const [periodoCustomAte, setPeriodoCustomAte] = useState(() => new Date().toISOString().slice(0, 10))
  const [areaRel, setAreaRel] = useState<"audiovisual" | "design">("audiovisual")

  const metricasUrl = (() => {
    const base = "/api/relatorios/metricas"
    const a = `&area=${areaRel}`
    if (periodo === "custom") return `${base}?periodo=custom&de=${periodoCustomDe}&ate=${periodoCustomAte}${a}`
    return `${base}?periodo=${periodo}${a}`
  })()

  const { data: metricas, mutate: recarregarMetricas, isLoading: loadingMetricas } = useSWR<Metricas>(
    metricasUrl,
    fetcher,
    { refreshInterval: 30_000 }
  )

  const { data: historico, mutate: recarregarHistorico } = useSWR<{ relatorios: RelatorioGerado[] }>(
    "/api/relatorios",
    fetcher
  )

  // ── Aba Resultados (KPIs + comparação vs período anterior) ─────────────────
  const [areaRes, setAreaRes] = useState<"audiovisual" | "design" | "eventos">("audiovisual")
  const [mesEspecifico, setMesEspecifico] = useState("") // "YYYY-MM" ou "" (usa os botões de período)
  // Opções de mês: de maio/2026 até o mês atual (descendente)
  const opcoesMes = (() => {
    const out: { value: string; label: string }[] = []
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    const now = new Date()
    let y = now.getFullYear(), mo = now.getMonth() + 1
    while (y > 2026 || (y === 2026 && mo >= 5)) {
      out.push({ value: `${y}-${String(mo).padStart(2, "0")}`, label: `${meses[mo - 1]} ${y}` })
      mo--; if (mo === 0) { mo = 12; y-- }
    }
    return out
  })()
  function escolherMes(ym: string) {
    setMesEspecifico(ym)
    if (!ym) return
    const [y, mo] = ym.split("-").map(Number)
    const ultimo = new Date(y, mo, 0).getDate()
    setPeriodoCustomDe(`${y}-${String(mo).padStart(2, "0")}-01`)
    setPeriodoCustomAte(`${y}-${String(mo).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`)
    setPeriodo("custom")
  }
  function escolherPeriodo(p: Periodo) { setMesEspecifico(""); setPeriodo(p) }
  const resAreaParam = areaRes === "design" ? "design" : "audiovisual"
  const resUrl = areaRes === "eventos"
    ? null
    : periodo === "custom"
      ? `/api/relatorios/metricas?periodo=custom&de=${periodoCustomDe}&ate=${periodoCustomAte}&area=${resAreaParam}`
      : `/api/relatorios/metricas?periodo=${periodo}&area=${resAreaParam}`
  const { data: mRes } = useSWR<Metricas>(abaAtiva === "resultados" && resUrl ? resUrl : null, fetcher, { refreshInterval: 60_000 })
  const prevUrl = (() => {
    if (!mRes?.periodo) return null
    const de = new Date(mRes.periodo.de).getTime()
    const ate = new Date(mRes.periodo.ate).getTime()
    const len = ate - de
    const prevDe = new Date(de - len).toISOString().slice(0, 10)
    const prevAte = new Date(de - 86_400_000).toISOString().slice(0, 10)
    return `/api/relatorios/metricas?periodo=custom&de=${prevDe}&ate=${prevAte}&area=${resAreaParam}`
  })()
  const { data: mPrev } = useSWR<Metricas>(abaAtiva === "resultados" && prevUrl ? prevUrl : null, fetcher)
  const { data: evDash } = useSWR<{ proximos: number; emProducao: number; atrasados: number; finalizados: number; totalPrevisto: number; totalGasto: number; docsPendentes: number; pagamentosPendentes: number }>(
    abaAtiva === "resultados" && areaRes === "eventos" ? "/api/eventos/dashboard" : null, fetcher
  )
  // Produção lançada manualmente (vídeos sem card) — por categoria, no período
  const [showEditarProd, setShowEditarProd] = useState(false)
  const pmUrl = abaAtiva === "resultados" && areaRes !== "eventos" && mRes?.periodo
    ? `/api/producao-manual?area=${resAreaParam}&de=${mRes.periodo.de.slice(0, 10)}&ate=${mRes.periodo.ate.slice(0, 10)}`
    : null
  const { data: prodManual, mutate: mutateProdManual } = useSWR<{ producaoPorCategoria: Record<string, number>; totalManual: number; presencialPorCategoria: Record<string, number>; totalPresencial: number }>(pmUrl, fetcher)
  // Produção manual do período anterior (para o delta de produção total)
  const pmPrevUrl = abaAtiva === "resultados" && areaRes !== "eventos" && prevUrl && mRes?.periodo
    ? (() => { const u = new URL(prevUrl, "http://x"); return `/api/producao-manual?area=${resAreaParam}&de=${u.searchParams.get("de")}&ate=${u.searchParams.get("ate")}` })()
    : null
  const { data: prodManualPrev } = useSWR<{ totalManual: number }>(pmPrevUrl, fetcher)

  const gerarRelatorio = useCallback(async (tipo: string) => {
    setGerando(tipo)
    try {
      const res = await fetch("/api/relatorios/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo }),
      })
      const data = await res.json()
      if (data.conteudo) {
        setRelatorioAtual({ ...data.relatorio, conteudo: data.conteudo })
        setAbaAtiva("ia")
        await recarregarHistorico()
      }
    } finally {
      setGerando(null)
    }
  }, [recarregarHistorico])

  const m = metricas

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #resultados-print, #resultados-print * { visibility: visible !important; }
          #resultados-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 12px; }
          body { background: #fff !important; }
          @page { margin: 12mm; }
        }
      `}</style>
      <Header title="Relatórios IA" />
      <main className="flex-1 p-6 space-y-6">

        {/* ── Abas ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 bg-zinc-800/60 rounded-xl p-1 w-fit">
          {[
            { key: "resultados", label: "Resultados", icon: BarChart2 },
            { key: "realtime", label: "Tempo Real", icon: Activity },
            { key: "ia", label: "Análise IA", icon: Sparkles },
            { key: "historico", label: "Histórico", icon: Calendar },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setAbaAtiva(key as typeof abaAtiva)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                abaAtiva === key
                  ? "bg-white text-zinc-900"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── ABA: Tempo Real ────────────────────────────────────────────── */}
        {/* ── ABA: Resultados (KPIs pra reunião) ─────────────────────────── */}
        {abaAtiva === "resultados" && (
          <div className="space-y-5" id="resultados-print">
            {/* Controles (área + período + imprimir) */}
            <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
              <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg p-0.5 gap-0.5">
                {([["audiovisual", "🎬 Audiovisual"], ["design", "🎨 Growth"], ["eventos", "🎟️ Eventos"]] as const).map(([a, label]) => (
                  <button key={a} onClick={() => setAreaRes(a)}
                    className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${areaRes === a ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>{label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {areaRes !== "eventos" && (
                  <>
                    <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg p-0.5 gap-0.5">
                      {(["semana", "mes", "3meses", "ano"] as Periodo[]).map((p) => (
                        <button key={p} onClick={() => escolherPeriodo(p)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md ${periodo === p && !mesEspecifico ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>{PERIODO_LABELS[p]}</button>
                      ))}
                    </div>
                    <select value={mesEspecifico} onChange={(e) => escolherMes(e.target.value)}
                      className={`text-xs border rounded-lg px-2.5 py-1.5 bg-zinc-800 ${mesEspecifico ? "border-purple-600 text-white" : "border-zinc-700 text-zinc-400"}`}>
                      <option value="">Mês específico…</option>
                      {opcoesMes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </>
                )}
                <a href={`/relatorio-executivo/${mesEspecifico || opcoesMes[0]?.value || ""}${areaRes === "design" ? "?area=design" : ""}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 rounded-lg">
                  <ArrowUpRight className="w-3.5 h-3.5" /> Relatório externo
                </a>
                <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 rounded-lg">
                  <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
                </button>
              </div>
            </div>

            {/* Título de apresentação */}
            <div>
              <h2 className="text-xl font-bold text-white print:text-black">
                Resultados — {areaRes === "design" ? "Growth (Artes)" : areaRes === "eventos" ? "Eventos" : "Audiovisual"}
              </h2>
              <p className="text-xs text-zinc-500 print:text-zinc-600">
                {areaRes === "eventos" ? "Situação atual" : `Período: ${mesEspecifico ? (opcoesMes.find(o => o.value === mesEspecifico)?.label ?? "Mês") : PERIODO_LABELS[periodo]}${mRes?.periodo ? ` (${new Date(mRes.periodo.de).toLocaleDateString("pt-BR", { timeZone: "UTC" })} → ${new Date(mRes.periodo.ate).toLocaleDateString("pt-BR", { timeZone: "UTC" })})` : ""}`}
              </p>
            </div>

            {areaRes === "eventos" ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Eventos próximos" value={fmtNum(evDash?.proximos ?? 0)} sub="agendados" />
                <KpiCard label="Em produção" value={fmtNum(evDash?.emProducao ?? 0)} sub="em andamento" />
                <KpiCard label="Atrasados" value={fmtNum(evDash?.atrasados ?? 0)} sub="prazo vencido" />
                <KpiCard label="Finalizados" value={fmtNum(evDash?.finalizados ?? 0)} sub="concluídos" />
                <KpiCard label="Orçamento previsto" value={fmt(evDash?.totalPrevisto ?? 0)} sub="soma dos eventos" />
                <KpiCard label="Gasto real" value={fmt(evDash?.totalGasto ?? 0)} sub="custos + audiovisual" />
                <KpiCard label="Docs pendentes" value={fmtNum(evDash?.docsPendentes ?? 0)} sub="aguardando" />
                <KpiCard label="Pagtos pendentes" value={fmtNum(evDash?.pagamentosPendentes ?? 0)} sub="a pagar" />
              </div>
            ) : (
              <>
                {/* Resumo executivo — produção total (manual + NuFlow) + frentes presenciais */}
                {(() => {
                  const cats = prodManual?.producaoPorCategoria ?? {}
                  const nuflow = mRes?.producao?.videosEntreguesMes ?? 0
                  const totalManual = prodManual?.totalManual ?? 0
                  const totalGeral = totalManual + nuflow
                  const cores = ["text-blue-400", "text-cyan-400", "text-emerald-400", "text-amber-400", "text-pink-400"]
                  const catEntries = Object.entries(cats)
                  const presencial = Object.entries(prodManual?.presencialPorCategoria ?? {})
                  const unidade = areaRes === "design" ? "artes" : "vídeos"
                  return (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 print:border-zinc-300 print:bg-white">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-lg font-bold text-white print:text-black">Produção do período</h3>
                        <button onClick={() => setShowEditarProd(true)} className="text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 rounded-lg print:hidden">
                          ✏️ Editar números
                        </button>
                      </div>
                      <p className="text-xs text-zinc-500 mb-4 print:text-zinc-600">Volume de conteúdo (lançados + NuFlow) + frentes presenciais.</p>
                      <div className="grid lg:grid-cols-3 gap-5">
                        {/* Vídeos (2/3) */}
                        <div className="lg:col-span-2">
                          <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-2">{unidade} postados/entregues</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {catEntries.map(([cat, qtd], i) => (
                              <div key={cat} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 print:border-zinc-300 print:bg-white">
                                <div className={`text-3xl font-bold ${cores[i % cores.length]}`}>{fmtNum(qtd)}</div>
                                <div className="text-sm text-zinc-400 mt-1 print:text-zinc-600">{cat}</div>
                              </div>
                            ))}
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 print:border-zinc-300 print:bg-white">
                              <div className="text-3xl font-bold text-emerald-400">{fmtNum(nuflow)}</div>
                              <div className="text-sm text-zinc-400 mt-1 print:text-zinc-600">Demandas NuFlow</div>
                            </div>
                            <div className="rounded-xl border border-purple-700/50 bg-purple-950/30 p-4 print:border-zinc-400 print:bg-zinc-50">
                              <div className="text-3xl font-bold text-white print:text-black">{fmtNum(totalGeral)}</div>
                              <div className="text-sm text-zinc-300 mt-1 print:text-zinc-600">Total geral</div>
                            </div>
                          </div>
                        </div>
                        {/* Frentes presenciais (1/3) */}
                        <div>
                          <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-2">Frentes presenciais</div>
                          {presencial.length === 0 ? (
                            <p className="text-xs text-zinc-500">Sem frentes lançadas. Use “Editar números”.</p>
                          ) : (
                            <div className="divide-y divide-zinc-800 print:divide-zinc-300">
                              {presencial.map(([cat, qtd]) => (
                                <div key={cat} className="flex items-center gap-3 py-2.5">
                                  <span className="text-2xl font-bold text-cyan-400 w-8">{fmtNum(qtd)}</span>
                                  <span className="text-sm text-zinc-300 print:text-black">{cat}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* KPIs com comparação */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label={areaRes === "design" ? "Artes entregues" : "Vídeos entregues"} value={fmtNum(mRes?.producao?.videosEntreguesMes ?? 0)} atual={mRes?.producao?.videosEntreguesMes} anterior={mPrev?.producao?.videosEntreguesMes} />
                  <KpiCard label="Concluídas" value={fmtNum(mRes?.producao?.demandasFinalizadasMes ?? 0)} atual={mRes?.producao?.demandasFinalizadasMes} anterior={mPrev?.producao?.demandasFinalizadasMes} />
                  <KpiCard label="Criadas" value={fmtNum(mRes?.demandas?.totalMes ?? 0)} atual={mRes?.demandas?.totalMes} anterior={mPrev?.demandas?.totalMes} />
                  <KpiCard label="Tempo médio" value={`${mRes?.demandas?.tempoMedioConclusao ?? 0}d`} atual={mRes?.demandas?.tempoMedioConclusao} anterior={mPrev?.demandas?.tempoMedioConclusao} inverter sub="menor é melhor" />
                  {(() => {
                    const valor = mRes?.producao?.valorPorDemanda ?? 200
                    const totalAtual = (prodManual?.totalManual ?? 0) + (mRes?.producao?.videosEntreguesMes ?? 0)
                    const totalAnt = (prodManualPrev?.totalManual ?? 0) + (mPrev?.producao?.videosEntreguesMes ?? 0)
                    return (
                      <>
                        <KpiCard label={`Custo médio/${areaRes === "design" ? "arte" : "vídeo"}`} value={fmt(valor)} sub="valor médio de referência" />
                        <KpiCard label="Produção (R$)" value={fmt(totalAtual * valor)} atual={totalAtual * valor} anterior={totalAnt * valor} sub={`${fmtNum(totalAtual)} ${areaRes === "design" ? "artes" : "vídeos"} × ${fmt(valor)}`} />
                      </>
                    )
                  })()}
                </div>
              </>
            )}

            {showEditarProd && (
              <EditarProducaoManualModal
                area={resAreaParam}
                onClose={() => setShowEditarProd(false)}
                onSaved={() => mutateProdManual()}
              />
            )}
          </div>
        )}

        {abaAtiva === "realtime" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Métricas em Tempo Real</h2>
                {m?.geradoEm && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Atualizado em {new Date(m.geradoEm).toLocaleTimeString("pt-BR")} · Atualiza a cada 30s
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => recarregarMetricas()}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMetricas ? "animate-spin" : ""}`} />
                  Atualizar
                </button>
                <button
                  onClick={() => gerarRelatorio("realtime")}
                  disabled={!!gerando}
                  className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition-colors"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${gerando === "realtime" ? "animate-pulse" : ""}`} />
                  {gerando === "realtime" ? "Analisando..." : "Análise IA"}
                </button>
              </div>
            </div>

            {/* ── Seletor de área ────────────────────────────────────────── */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-500 font-medium">Área:</span>
              <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg p-0.5 gap-0.5">
                {([["audiovisual", "🎬 Audiovisual"], ["design", "🎨 Design"]] as const).map(([a, label]) => (
                  <button key={a} onClick={() => setAreaRel(a)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${areaRel === a ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Seletor de período ─────────────────────────────────────── */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-500 font-medium">Período:</span>
              <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg p-0.5 gap-0.5">
                {(["semana", "mes", "3meses", "ano", "custom"] as Periodo[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriodo(p)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      periodo === p
                        ? "bg-purple-600 text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {PERIODO_LABELS[p]}
                  </button>
                ))}
              </div>

              {/* Date range picker — só aparece quando custom */}
              {periodo === "custom" && (
                <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5">
                  <input
                    type="date"
                    value={periodoCustomDe}
                    onChange={(e) => setPeriodoCustomDe(e.target.value)}
                    className="bg-transparent text-zinc-200 text-xs outline-none"
                  />
                  <span className="text-zinc-600 text-xs">→</span>
                  <input
                    type="date"
                    value={periodoCustomAte}
                    onChange={(e) => setPeriodoCustomAte(e.target.value)}
                    className="bg-transparent text-zinc-200 text-xs outline-none"
                  />
                </div>
              )}

              {/* Período exibido */}
              {m?.periodo && (
                <span className="text-[10px] text-zinc-600 ml-1">
                  {new Date(m.periodo.de).toLocaleDateString("pt-BR")} → {new Date(m.periodo.ate).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>

            {/* Cards de métricas principais */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={Film} label="Demandas Ativas" value={fmtNum(m?.demandas.totalAtivas ?? 0)} sub={`${m?.demandas.totalMes ?? 0} criadas no período`} cor="blue" />
              <MetricCard icon={CheckCircle2} label="Vídeos Entregues" value={fmtNum(m?.producao?.videosEntreguesMes ?? m?.producao?.videosEntregues30d ?? m?.demandas.concluidas30d ?? 0)} sub={`em ${m?.producao?.demandasFinalizadas30d ?? m?.demandas.concluidas30d ?? 0} demandas`} cor="green" />
              <MetricCard icon={Clock} label="Tempo Médio" value={`${m?.demandas.tempoMedioConclusao ?? 0}d`} sub="Criação → finalização (c/ VM)" cor="zinc" />
              <MetricCard icon={AlertTriangle} label="Em Atraso" value={fmtNum(m?.demandas.emAtraso ?? 0)} sub={`${m?.alertas.criticos ?? 0} alertas críticos`} cor={m && m.demandas.emAtraso > 0 ? "red" : "zinc"} alert={m && m.demandas.emAtraso > 0} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                icon={DollarSign}
                label="Valor Produzido"
                value={fmt(m?.producao?.producaoMes ?? 0)}
                sub={`${m?.producao?.demandasFinalizadasMes ?? 0} demandas · R$${m?.producao?.valorPorDemanda ?? 200}/dem.`}
                cor="green"
              />
              <MetricCard
                icon={BarChart2}
                label="Custo/Vídeo"
                value={fmt(m?.producao?.valorPorDemanda ?? 200)}
                sub="Índice de produtividade"
                cor="blue"
              />
              <MetricCard icon={Users} label="Videomakers" value={`${m?.videomakers.ativos ?? 0}/${m?.videomakers.total ?? 0}`} sub="Ativos / Total" cor="purple" />
              <MetricCard icon={Zap} label="Urgentes" value={fmtNum(m?.demandas.urgentes ?? 0)} sub={`${m?.demandas.aguardandoAprovacao ?? 0} aguardando aprovação`} cor={m && m.demandas.urgentes > 0 ? "amber" : "zinc"} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tendência 4 semanas */}
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
                <h3 className="text-sm font-medium text-white mb-4">Volume por Semana</h3>
                <div className="flex items-end gap-2 h-28">
                  {m?.tendencia.map((t) => {
                    const maxVal = Math.max(...(m?.tendencia ?? []).flatMap((x) => [x.criadas, x.concluidas]), 1)
                    return <TendenciaBar key={t.semana} {...t} maxVal={maxVal} />
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500/60 inline-block" /> Criadas</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500/60 inline-block" /> Concluídas</span>
                </div>
              </div>

              {/* Por tipo de vídeo */}
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
                <h3 className="text-sm font-medium text-white mb-3">Por Tipo de Vídeo</h3>
                <div className="space-y-2">
                  {m?.demandas.porTipo.slice(0, 6).map((t) => {
                    const total = m.demandas.porTipo.reduce((s, x) => s + x.count, 0)
                    const pct = total > 0 ? (t.count / total) * 100 : 0
                    return (
                      <div key={t.tipo}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-zinc-400 truncate">{t.tipo}</span>
                          <span className="text-zinc-300 font-medium">{t.count}</span>
                        </div>
                        <div className="h-1.5 bg-zinc-700 rounded-full">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  {!m?.demandas.porTipo.length && <p className="text-xs text-zinc-500">Nenhum dado disponível</p>}
                </div>
              </div>

              {/* Top videomakers por custo */}
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
                <h3 className="text-sm font-medium text-white mb-3">Top Custos (30d)</h3>
                <div className="space-y-2.5">
                  {m?.custos.topVideomakers.map((vm) => (
                    <div key={vm.id} className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-zinc-300">{vm.nome}</div>
                        <div className="text-[10px] text-zinc-500">{vm.qtdServicos} serviço(s)</div>
                      </div>
                      <div className="text-sm font-semibold text-green-400">{fmt(vm.totalGasto)}</div>
                    </div>
                  ))}
                  {!m?.custos.topVideomakers.length && (
                    <p className="text-xs text-zinc-500">Nenhum custo registrado</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ABA: Análise IA ────────────────────────────────────────────── */}
        {abaAtiva === "ia" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Painel de geração */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-white">Gerar Análise IA</h2>

              {[
                { tipo: "produtividade_time", label: "Produtividade da Equipe", desc: "Score, gargalos, feedback do processo", icon: Activity },
                { tipo: "analise_custos", label: "Análise de Custos", desc: "ROI, otimização, projeção financeira", icon: DollarSign },
                { tipo: "performance_videomaker", label: "Performance Videomakers", desc: "Ranking individual, pontos fortes", icon: Users },
                { tipo: "otimizacao_contratacao", label: "Otimização de Contratação", desc: "Modelo ideal, KPIs, melhorias", icon: Target },
                { tipo: "semanal", label: "Resumo Semanal", desc: "Visão geral da semana atual", icon: Calendar },
                { tipo: "mensal", label: "Relatório Mensal", desc: "Análise completa do mês", icon: BarChart2 },
              ].map(({ tipo, label, desc, icon: Icon }) => (
                <button
                  key={tipo}
                  onClick={() => gerarRelatorio(tipo)}
                  disabled={!!gerando}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    tipoSelecionado === tipo
                      ? "bg-purple-900/30 border-purple-600/50"
                      : "bg-zinc-800/40 border-zinc-700/50 hover:border-zinc-600"
                  } ${gerando ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  onMouseEnter={() => setTipoSelecionado(tipo)}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {gerando === tipo ? (
                      <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                    ) : (
                      <Icon className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                    <span className="text-sm font-medium text-zinc-200">{label}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 pl-5">{desc}</p>
                </button>
              ))}

              {gerando && (
                <div className="flex items-center gap-2 text-xs text-purple-400 bg-purple-950/30 border border-purple-800/30 rounded-lg p-3">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  Consultando Claude AI...
                </div>
              )}
            </div>

            {/* Painel de resultado */}
            <div className="md:col-span-2">
              {relatorioAtual ? (
                <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <RelatorioBadge tipo={relatorioAtual.tipo} />
                    </div>
                    <div className="flex items-center gap-3">
                      {relatorioAtual.tokens && (
                        <span className="text-[10px] text-zinc-500">{fmtNum(relatorioAtual.tokens)} tokens</span>
                      )}
                      <button
                        onClick={() => gerarRelatorio(relatorioAtual.tipo)}
                        disabled={!!gerando}
                        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Regenerar
                      </button>
                    </div>
                  </div>
                  <div className="p-4 max-h-[60vh] overflow-y-auto">
                    <RelatorioConteudo conteudo={relatorioAtual.conteudo} tipo={relatorioAtual.tipo} />
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-64 flex flex-col items-center justify-center text-center border border-dashed border-zinc-700 rounded-xl p-8">
                  <Sparkles className="w-10 h-10 text-zinc-600 mb-3" />
                  <p className="text-zinc-500 font-medium">Selecione um tipo de análise</p>
                  <p className="text-xs text-zinc-600 mt-1">A IA irá analisar os dados do sistema e gerar insights</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ABA: Histórico ─────────────────────────────────────────────── */}
        {abaAtiva === "historico" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Relatórios Gerados</h2>
              <span className="text-xs text-zinc-500">{historico?.relatorios.length ?? 0} relatórios</span>
            </div>

            {historico?.relatorios.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Nenhum relatório gerado ainda.</p>
                <p className="text-xs mt-1">Use a aba "Análise IA" para gerar o primeiro relatório.</p>
              </div>
            )}

            <div className="space-y-3">
              {historico?.relatorios.map((r) => (
                <div
                  key={r.id}
                  className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-4 cursor-pointer hover:border-zinc-600 transition-colors"
                  onClick={() => { setRelatorioAtual(r); setAbaAtiva("ia") }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RelatorioBadge tipo={r.tipo} />
                      <span className="text-xs text-zinc-500">{r.periodo}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      {r.tokens && <span>{fmtNum(r.tokens)} tokens</span>}
                      <span>{new Date((r as unknown as { createdAt: string }).createdAt).toLocaleString("pt-BR")}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </>
  )
}
