"use client"

import { useState } from "react"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import {
  DollarSign,
  Plus,
  CheckCircle2,
  Clock,
  Users,
  Film,
  X,
  ChevronDown,
  TrendingUp,
  AlertCircle,
} from "lucide-react"
import { MoneyDisplay } from "@/components/ui/MoneyDisplay"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Videomaker {
  id: string
  nome: string
  valorDiaria: number | null
}

interface Custo {
  id: string
  videomakerId: string
  demandaId: string | null
  tipo: string
  valor: number
  descricao: string | null
  dataReferencia: string
  dataVencimento: string | null
  pago: boolean
  dataPagamento: string | null
  videomaker: { id: string; nome: string; valorDiaria: number | null }
  demanda: { id: string; codigo: string; titulo: string } | null
}

interface RespostaCustos {
  custos: Custo[]
  resumo: { totalGasto: number; totalPago: number; totalPendente: number }
  porVideomaker: { id: string; nome: string; total: number; count: number }[]
}

const TIPOS_CUSTO = [
  { value: "diaria", label: "Diária" },
  { value: "mensalidade", label: "Mensalidade" },
  { value: "projeto", label: "Projeto" },
  { value: "bonus", label: "Bônus" },
  { value: "despesa", label: "Despesa" },
  { value: "equipamento", label: "Equipamento" },
]

const TIPO_COR: Record<string, string> = {
  diaria: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  mensalidade: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  projeto: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  bonus: "bg-green-500/20 text-green-300 border-green-500/30",
  despesa: "bg-red-500/20 text-red-300 border-red-500/30",
  equipamento: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })

export default function CustosPage() {
  const [filtroVm, setFiltroVm] = useState("")
  const [filtroPago, setFiltroPago] = useState<"" | "true" | "false">("")
  const [modal, setModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [marcandoPago, setMarcandoPago] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)

  const params = new URLSearchParams()
  if (filtroVm) params.set("videomakerId", filtroVm)
  if (filtroPago) params.set("pago", filtroPago)

  const { data, mutate, isLoading } = useSWR<RespostaCustos>(
    `/api/custos-videomaker?${params.toString()}`,
    fetcher
  )

  const { data: videomakersList } = useSWR<{ videomakers: Videomaker[] }>(
    "/api/videomakers?status=ativo",
    fetcher
  )

  const [form, setForm] = useState({
    videomakerId: "",
    demandaId: "",
    tipo: "diaria",
    valor: "",
    descricao: "",
    dataReferencia: new Date().toISOString().slice(0, 10),
    dataVencimento: "",
    pago: false,
    dataPagamento: "",
  })

  const salvar = async () => {
    if (!form.videomakerId || !form.valor || !form.dataReferencia) return
    setSalvando(true)
    try {
      await fetch("/api/custos-videomaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      setModal(false)
      setForm({
        videomakerId: "", demandaId: "", tipo: "diaria", valor: "",
        descricao: "", dataReferencia: new Date().toISOString().slice(0, 10), dataVencimento: "", pago: false, dataPagamento: "",
      })
      await mutate()
    } finally {
      setSalvando(false)
    }
  }

  const marcarPago = async (id: string) => {
    setMarcandoPago(id)
    try {
      await fetch(`/api/custos-videomaker/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pago: true, dataPagamento: new Date().toISOString() }),
      })
      await mutate()
    } finally {
      setMarcandoPago(null)
    }
  }

  const vms = videomakersList?.videomakers ?? []
  const custos = data?.custos ?? []
  const resumo = data?.resumo
  const porVm = data?.porVideomaker ?? []

  const hoje = new Date()
  hoje.setHours(23, 59, 59, 999)
  const amanha = new Date()
  amanha.setDate(amanha.getDate() + 1)
  amanha.setHours(23, 59, 59, 999)

  const custosVencidos = custos.filter(c => !c.pago && c.dataVencimento && new Date(c.dataVencimento) < new Date())
  const custosVenceHoje = custos.filter(c => !c.pago && c.dataVencimento && new Date(c.dataVencimento) <= hoje && new Date(c.dataVencimento) >= new Date())
  const custosVenceBreve = custos.filter(c => !c.pago && c.dataVencimento && new Date(c.dataVencimento) <= amanha && new Date(c.dataVencimento) > hoje)

  function urgenciaBadge(c: Custo) {
    if (!c.dataVencimento || c.pago) return null
    const venc = new Date(c.dataVencimento)
    const now = new Date()
    if (venc < now) return <span className="text-[10px] font-bold text-red-400 bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 rounded">🔴 Vencido</span>
    if (venc <= hoje) return <span className="text-[10px] font-bold text-orange-400 bg-orange-500/15 border border-orange-500/30 px-1.5 py-0.5 rounded">🟠 Vence hoje</span>
    if (venc <= amanha) return <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/15 border border-yellow-500/30 px-1.5 py-0.5 rounded">🟡 Vence amanhã</span>
    return null
  }

  return (
    <>
      <Header title="Gestão de Custos" />
      <main className="flex-1 p-6 space-y-6">

        {/* ── Resumo ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-zinc-400" />
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Total Gasto</span>
            </div>
            <div className="text-2xl font-bold text-white"><MoneyDisplay value={resumo?.totalGasto ?? 0} size="lg" /></div>
            <div className="text-xs text-zinc-500 mt-1">{custos.length} registros</div>
          </div>
          <div className="bg-green-950/30 border border-green-800/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400 font-medium uppercase tracking-wide">Pago</span>
            </div>
            <div className="text-2xl font-bold text-green-400"><MoneyDisplay value={resumo?.totalPago ?? 0} size="lg" className="text-green-400" /></div>
            <div className="text-xs text-zinc-500 mt-1">
              {custos.filter((c) => c.pago).length} pagamentos realizados
            </div>
          </div>
          <div className="bg-amber-950/30 border border-amber-800/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-amber-400 font-medium uppercase tracking-wide">Pendente</span>
            </div>
            <div className="text-2xl font-bold text-amber-400"><MoneyDisplay value={resumo?.totalPendente ?? 0} size="lg" className="text-amber-400" /></div>
            <div className="text-xs text-zinc-500 mt-1">
              {custos.filter((c) => !c.pago).length} pagamentos pendentes
            </div>
          </div>
          {/* TDAH: Cobranças Vencidas */}
          <div className={`border rounded-xl p-4 transition-colors ${custosVencidos.length > 0 ? "bg-red-950/50 border-red-700/50" : "bg-zinc-800/50 border-zinc-700"}`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className={`w-4 h-4 ${custosVencidos.length > 0 ? "text-red-400" : "text-zinc-400"}`} />
              <span className={`text-xs font-medium uppercase tracking-wide ${custosVencidos.length > 0 ? "text-red-400" : "text-zinc-400"}`}>Cobranças Vencidas</span>
            </div>
            <div className={`text-2xl font-bold ${custosVencidos.length > 0 ? "text-red-400" : "text-zinc-400"}`}>{custosVencidos.length}</div>
            <div className="text-xs text-zinc-500 mt-1">
              {custosVenceHoje.length > 0 && `${custosVenceHoje.length} vence(m) hoje · `}
              {custosVenceBreve.length > 0 && `${custosVenceBreve.length} amanhã`}
              {custosVencidos.length === 0 && custosVenceHoje.length === 0 && "Tudo em dia"}
            </div>
          </div>
        </div>

        {/* ── Por Videomaker ─────────────────────────────────────────── */}
        {porVm.length > 0 && (
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-white">Gasto por Videomaker</h3>
            </div>
            <div className="space-y-2">
              {porVm.map((v) => {
                const pct = resumo?.totalGasto ? (v.total / resumo.totalGasto) * 100 : 0
                return (
                  <div key={v.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-zinc-300 font-medium">{v.nome}</span>
                      <div className="flex items-center gap-3 text-zinc-500">
                        <span>{v.count}x</span>
                        <span className="font-semibold text-zinc-200">{fmt(v.total)}</span>
                        <span className="text-zinc-500">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-zinc-700 rounded-full">
                      <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Filtros + Ação ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={filtroVm}
              onChange={(e) => setFiltroVm(e.target.value)}
              className="appearance-none bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm pl-3 pr-8 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
            >
              <option value="">Todos os videomakers</option>
              {vms.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={filtroPago}
              onChange={(e) => setFiltroPago(e.target.value as "" | "true" | "false")}
              className="appearance-none bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm pl-3 pr-8 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
            >
              <option value="">Todos os status</option>
              <option value="true">Pagos</option>
              <option value="false">Pendentes</option>
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          </div>

          <div className="flex-1" />

          <button
            onClick={() => setModal(true)}
            className="flex items-center gap-2 bg-white text-zinc-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Registrar Custo
          </button>
        </div>

        {/* ── Tabela de custos ───────────────────────────────────────── */}
        <div className="bg-zinc-800/40 border border-zinc-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-800/60">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Videomaker</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Demanda</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Data</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Valor</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-zinc-500 text-sm">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && custos.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-zinc-500">
                    <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Nenhum custo registrado</p>
                    <p className="text-xs mt-1">Registre o primeiro custo usando o botão acima</p>
                  </td>
                </tr>
              )}
              {custos.map((c) => (
                <>
                  <tr
                    key={c.id}
                    className="border-b border-zinc-700/50 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                    onClick={() => setExpandido(expandido === c.id ? null : c.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-zinc-200 font-medium">{c.videomaker.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.demanda ? (
                        <div className="flex items-center gap-1.5">
                          <Film className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-xs text-zinc-400">{c.demanda.codigo}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${TIPO_COR[c.tipo] ?? "bg-zinc-700 text-zinc-400"}`}>
                        {TIPOS_CUSTO.find((t) => t.value === c.tipo)?.label ?? c.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {new Date(c.dataReferencia).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-white">
                      {fmt(c.valor)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {c.pago ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">
                            <CheckCircle2 className="w-3 h-3" /> Pago
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                            <Clock className="w-3 h-3" /> Pendente
                          </span>
                        )}
                        {urgenciaBadge(c)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {!c.pago && (
                        <button
                          onClick={(e) => { e.stopPropagation(); marcarPago(c.id) }}
                          disabled={marcandoPago === c.id}
                          className="text-[11px] text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 px-2 py-1 rounded transition-colors disabled:opacity-50"
                        >
                          {marcandoPago === c.id ? "..." : "Marcar Pago"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandido === c.id && (
                    <tr key={`${c.id}-exp`} className="border-b border-zinc-700/50 bg-zinc-800/20">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="grid grid-cols-3 gap-4 text-xs text-zinc-400">
                          <div>
                            <span className="text-zinc-500 block mb-0.5">Descrição</span>
                            {c.descricao || "—"}
                          </div>
                          {c.demanda && (
                            <div>
                              <span className="text-zinc-500 block mb-0.5">Demanda</span>
                              {c.demanda.titulo}
                            </div>
                          )}
                          {c.dataPagamento && (
                            <div>
                              <span className="text-zinc-500 block mb-0.5">Data de Pagamento</span>
                              {new Date(c.dataPagamento).toLocaleDateString("pt-BR")}
                            </div>
                          )}
                          <div>
                            <span className="text-zinc-500 block mb-0.5">Diária do Videomaker</span>
                            {c.videomaker.valorDiaria ? fmt(c.videomaker.valorDiaria) : "Não informado"}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* ── Modal Novo Custo ───────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Registrar Custo</h3>
              <button onClick={() => setModal(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Videomaker */}
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Videomaker *</label>
                <select
                  value={form.videomakerId}
                  onChange={(e) => setForm({ ...form, videomakerId: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                >
                  <option value="">Selecione...</option>
                  {vms.map((v) => (
                    <option key={v.id} value={v.id}>{v.nome}{v.valorDiaria ? ` — ${fmt(v.valorDiaria)}/dia` : ""}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Tipo */}
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                  >
                    {TIPOS_CUSTO.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Valor */}
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              {/* Data referência */}
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Data de Referência *</label>
                <input
                  type="date"
                  value={form.dataReferencia}
                  onChange={(e) => setForm({ ...form, dataReferencia: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* Data vencimento */}
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Data de Vencimento</label>
                <input
                  type="date"
                  value={form.dataVencimento}
                  onChange={(e) => setForm({ ...form, dataVencimento: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                />
                <p className="text-[10px] text-zinc-500 mt-1">Para cobrança automática via WhatsApp (TDAH)</p>
              </div>

              {/* Descrição */}
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Descrição</label>
                <input
                  type="text"
                  placeholder="Ex: 2 diárias de gravação — Projeto XYZ"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
                />
              </div>

              {/* Já pago */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.pago}
                  onChange={(e) => setForm({ ...form, pago: e.target.checked })}
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                <span className="text-sm text-zinc-300">Já foi pago</span>
              </label>

              {form.pago && (
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1">Data de Pagamento</label>
                  <input
                    type="date"
                    value={form.dataPagamento}
                    onChange={(e) => setForm({ ...form, dataPagamento: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setModal(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando || !form.videomakerId || !form.valor}
                className="flex-1 bg-white hover:bg-zinc-100 text-zinc-900 text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-40"
              >
                {salvando ? "Salvando..." : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
