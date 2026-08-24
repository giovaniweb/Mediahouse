"use client"

import { useState, useCallback, useEffect } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Sparkles, Plus, Search, SlidersHorizontal, XCircle, UserCheck, FileSpreadsheet } from "lucide-react"
import { KanbanBoard } from "@/components/kanban/KanbanBoard"
import { GROWTH_COLUNAS, GROWTH_COLUNA_PARA_STATUS, growthColunaDe, type GrowthColunaId } from "@/lib/growth-kanban"
import { TIPOS_CONTEUDO } from "@/lib/growth-conteudo"
import { toast } from "sonner"
import { BarraVisao } from "@/components/demandas/BarraVisao"
import { ImportarPlanilhaModal } from "@/components/demandas/ImportarPlanilhaModal"
import { NovaDemandaGrowthModal } from "@/components/demandas/NovaDemandaGrowthModal"
import { DemandasLista } from "@/components/demandas/DemandasLista"
import { DemandasTabela } from "@/components/demandas/DemandasTabela"
import type { Visao, AbaRapida } from "@/components/demandas/tipos-visao"
import { fetcher } from "@/lib/fetcher"
import { erroDaResposta, mensagemDeErro } from "@/lib/erro-cliente"

const selCls = "text-sm border border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-zinc-800 text-zinc-300"

// Growth (gestão de conteúdos). Reutiliza a Demanda (area="design" internamente),
// mas com kanban próprio de 8 colunas e SEM qualquer dependência de Eventos.
export default function GrowthKanbanPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [showNova, setShowNova] = useState(false)
  const [showImportar, setShowImportar] = useState(false)

  // Filtros — adaptados às peculiaridades do Growth (pessoas/responsável,
  // linha/projeto, tipo de conteúdo, produto) em vez de videomaker/editor.
  const [search, setSearch] = useState("")
  const [filtroResp, setFiltroResp] = useState("")
  const [filtroLinha, setFiltroLinha] = useState("")
  const [filtroTipo, setFiltroTipo] = useState("")
  const [filtroProduto, setFiltroProduto] = useState("")
  const [soMinhas, setSoMinhas] = useState(false)

  // Mesmas três visões do audiovisual, com preferência guardada em separado:
  // quem cuida de Growth pode querer tabela e quem cuida de vídeo, kanban.
  const [visao, setVisao] = useState<Visao>("kanban")
  const [aba, setAba] = useState<AbaRapida>("todos")
  const CHAVE_VISAO = "nuflow:visao-demandas-growth"

  useEffect(() => {
    const salva = localStorage.getItem(CHAVE_VISAO) as Visao | null
    if (salva === "kanban" || salva === "lista" || salva === "tabela") setVisao(salva)
  }, [])

  function trocarVisao(v: Visao) {
    setVisao(v)
    localStorage.setItem(CHAVE_VISAO, v)
  }

  // Dados que alimentam os selects dos filtros
  const { data: rData } = useSWR<{ responsaveis: Responsavel[] }>("/api/growth/responsaveis", fetcher)
  const responsaveis = rData?.responsaveis ?? []
  const { data: lData } = useSWR<{ linhas: { id: string; nome: string }[] }>("/api/growth/linhas-projetos", fetcher)
  const linhas = lData?.linhas ?? []
  const { data: pData } = useSWR<{ produtos: { id: string; nome: string }[] }>("/api/produtos?limit=200", fetcher)
  const produtos = pData?.produtos ?? []

  const temFiltrosAtivos = !!(filtroResp || filtroLinha || filtroTipo || filtroProduto || soMinhas)
  function limparFiltros() {
    setFiltroResp(""); setFiltroLinha(""); setFiltroTipo(""); setFiltroProduto(""); setSoMinhas(false)
  }

  const params = new URLSearchParams()
  params.set("area", "design")
  if (search) params.set("search", search)
  if (soMinhas || aba === "minhas") params.set("mine", "1")
  if (aba === "criadas") params.set("criadasPorMim", "1")
  if (aba === "atrasadas") params.set("atrasadas", "1")
  if (filtroResp) params.set("responsavelId", filtroResp)
  if (filtroLinha) params.set("linhaProjetoId", filtroLinha)
  if (filtroTipo) params.set("tipoVideo", filtroTipo)
  if (filtroProduto) params.set("produtoId", filtroProduto)

  const { data, mutate } = useSWR(`/api/demandas?${params}`, fetcher, { refreshInterval: 15000 })
  const demandasAll = data?.demandas ?? []

  // Esconde finalizados com mais de 30 dias (mantém o board enxuto)
  const TRINTA = 30 * 24 * 60 * 60 * 1000
  const agora = Date.now()
  const demandas = demandasAll.filter((d: { statusInterno: string; finalizadaEm?: string | null }) => {
    if (growthColunaDe(d.statusInterno) !== "finalizado") return true
    const ref = d.finalizadaEm ? new Date(d.finalizadaEm).getTime() : 0
    return agora - ref <= TRINTA
  })

  const handleMove = useCallback(async (demandaId: string, novaColuna: string) => {
    const statusInterno = GROWTH_COLUNA_PARA_STATUS[novaColuna as GrowthColunaId]
    if (!statusInterno) return
    mutate((prev: { demandas: Array<{ id: string; statusInterno: string }> }) => ({
      ...prev,
      demandas: prev.demandas.map((d) => d.id === demandaId ? { ...d, statusInterno } : d),
    }), false)
    const res = await fetch(`/api/demandas/${demandaId}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusInterno, origem: "kanban" }),
    })
    if (!res.ok) {
      // "Erro ao mover" escondia a instrução que a API tinha mandado. A recusa
      // mais comum aqui é a de mandar para aprovação sem arte anexada, e o
      // texto dela diz exatamente o que fazer — quem via só "Erro ao mover"
      // achava que era falta de permissão e ficava tentando de novo.
      mutate()
      toast.error(mensagemDeErro(await erroDaResposta(res), "Não foi possível mover o card."))
    } else mutate()
  }, [mutate])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Excluir esta demanda?")) return
    await fetch(`/api/demandas/${id}`, { method: "DELETE" }); mutate()
  }, [mutate])

  const handleDuplicate = useCallback(async (id: string) => {
    await fetch(`/api/demandas/${id}/duplicate`, { method: "POST" }); mutate()
  }, [mutate])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-400" /> Growth · Demandas</h1>
        <button onClick={() => setShowNova(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"><Plus className="w-4 h-4" /> Nova Demanda</button>
        <button onClick={() => setShowImportar(true)} title="Criar várias demandas a partir de uma planilha" className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-medium px-3 py-1.5 rounded-lg"><FileSpreadsheet className="w-4 h-4" /> Importar planilha</button>
      </div>

      {/* Filtros — pessoas/responsável, linha/projeto, tipo de conteúdo e produto */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar demanda..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500 w-56"
          />
        </div>
        <select value={filtroResp} onChange={(e) => setFiltroResp(e.target.value)} className={selCls}>
          <option value="">Todos responsáveis</option>
          {responsaveis.map((r) => (<option key={r.id} value={r.id}>{r.label ?? r.nome}</option>))}
        </select>
        <select value={filtroLinha} onChange={(e) => setFiltroLinha(e.target.value)} className={selCls}>
          <option value="">Todas linhas/projetos</option>
          {linhas.map((l) => (<option key={l.id} value={l.id}>{l.nome}</option>))}
        </select>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className={selCls}>
          <option value="">Todos os tipos</option>
          {TIPOS_CONTEUDO.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
        </select>
        <select value={filtroProduto} onChange={(e) => setFiltroProduto(e.target.value)} className={selCls}>
          <option value="">Todos produtos</option>
          {produtos.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
        </select>
        <button
          type="button"
          onClick={() => { setSoMinhas(v => !v); if (!soMinhas) setFiltroResp("") }}
          aria-pressed={soMinhas}
          title="Só as demandas em que eu sou responsável, designer, social, gestor ou solicitante"
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            soMinhas
              ? "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40"
              : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200"
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" /> Só minhas
        </button>
        {temFiltrosAtivos && (
          <button onClick={limparFiltros}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-2 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
            <XCircle className="w-3.5 h-3.5" /> Limpar filtros
          </button>
        )}
        <SlidersHorizontal className="w-4 h-4 text-zinc-600" />
        <span className="text-xs text-zinc-500 ml-auto">{demandas.length} demandas</span>
      </div>

      <div className="px-4 pt-1 pb-3">
        <BarraVisao
          demandas={demandas}
          visao={visao}
          onVisao={trocarVisao}
          aba={aba}
          onAba={setAba}
          total={demandas.length}
        />
      </div>

      {visao === "kanban" ? (
        <div className="flex-1 min-h-0 p-4 overflow-hidden">
          <KanbanBoard
            demandas={demandas}
            onMove={handleMove}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            userTipo={session?.user?.tipo}
            colunas={GROWTH_COLUNAS}
            getColuna={(d) => growthColunaDe(d.statusInterno)}
            openMode="modal"
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-4 pb-6 overflow-y-auto">
          {visao === "lista"
            ? <DemandasLista demandas={demandas} onAbrir={(id) => router.push(`/demandas/${id}`)} />
            : <DemandasTabela demandas={demandas} onAbrir={(id) => router.push(`/demandas/${id}`)} />}
        </div>
      )}

      {showImportar && (
        <ImportarPlanilhaModal area="design" onClose={() => setShowImportar(false)} onImportado={() => mutate()} />
      )}

      <NovaDemandaGrowthModal
        open={showNova}
        onClose={() => setShowNova(false)}
        onCreated={() => { setShowNova(false); mutate() }}
      />
    </div>
  )
}

type Responsavel = { id: string; nome: string; email: string | null; tipo: string; label: string }
