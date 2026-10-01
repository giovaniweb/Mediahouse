"use client"

import { useState, useCallback, useEffect } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Sparkles, Plus, Search, SlidersHorizontal, XCircle, UserCheck } from "lucide-react"
import { KanbanBoard } from "@/components/kanban/KanbanBoard"
import { GROWTH_COLUNAS, GROWTH_COLUNA_PARA_STATUS, growthColunaDe, type GrowthColunaId } from "@/lib/growth-kanban"
import { TIPOS_CONTEUDO } from "@/lib/growth-conteudo"
import { toast } from "sonner"
import { BarraVisao } from "@/components/demandas/BarraVisao"
import { NovaDemandaGrowthModal } from "@/components/demandas/NovaDemandaGrowthModal"
import { DemandasLista } from "@/components/demandas/DemandasLista"
import { normalizarVisao } from "@/components/demandas/tipos-visao"
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

  // Filtros — adaptados às peculiaridades do Growth (pessoas/responsável,
  // linha/projeto, tipo de conteúdo, produto) em vez de videomaker/editor.
  const [search, setSearch] = useState("")
  const [filtroResp, setFiltroResp] = useState("")
  const [filtroLinha, setFiltroLinha] = useState("")
  const [filtroTipo, setFiltroTipo] = useState("")
  const [filtroProduto, setFiltroProduto] = useState("")
  const [soMinhas, setSoMinhas] = useState(false)

  // Mesmas duas visões do audiovisual, com preferência guardada em separado:
  // quem cuida de Growth pode querer lista e quem cuida de vídeo, kanban.
  const [visao, setVisao] = useState<Visao>("kanban")
  const [aba, setAba] = useState<AbaRapida>("todos")
  const CHAVE_VISAO = "nuflow:visao-demandas-growth"

  useEffect(() => {
    try {
      const salva = normalizarVisao(localStorage.getItem(CHAVE_VISAO))
      setVisao(salva)
      localStorage.setItem(CHAVE_VISAO, salva)
    } catch { /* Preferência indisponível: mantém Kanban. */ }
  }, [])

  function trocarVisao(v: Visao) {
    setVisao(v)
    try { localStorage.setItem(CHAVE_VISAO, v) } catch { /* A navegação continua sem persistência. */ }
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

  const [navegacaoFila,setNavegacaoFila] = useState({filtro:"",pagina:1})
  const params = new URLSearchParams()
  params.set("filaTrabalho","1")
  params.set("area", "design")
  if (search) params.set("search", search)
  if (soMinhas || aba === "minhas") params.set("mine", "1")
  if (aba === "criadas") params.set("criadasPorMim", "1")
  if (aba === "atrasadas") params.set("atrasadas", "1")
  if (filtroResp) params.set("responsavelId", filtroResp)
  if (filtroLinha) params.set("linhaProjetoId", filtroLinha)
  if (filtroTipo) params.set("tipoVideo", filtroTipo)
  if (filtroProduto) params.set("produtoId", filtroProduto)

  const chaveFiltro = params.toString()
  const paginaFila = navegacaoFila.filtro === chaveFiltro ? navegacaoFila.pagina : 1
  const mudarPagina = (pagina:number) => setNavegacaoFila({filtro:chaveFiltro,pagina})
  params.set("limit","100"); params.set("offset",String((paginaFila-1)*100))
  const { data, mutate } = useSWR(`/api/demandas?${params}`, fetcher, { refreshInterval: 15000 })
  const demandasAll = data?.demandas ?? []

  const demandas = demandasAll

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
      // Desfaz o movimento otimista e mostra a mensagem que a API mandou —
      // "Erro ao mover" escondia a instrução e fazia parecer falta de permissão.
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
      </div>

      <div className="flex flex-wrap gap-3 px-4 py-2 text-sm">
        <button disabled={paginaFila===1} onClick={()=>mudarPagina(paginaFila-1)}>Anterior</button><span>Página {paginaFila} · {data?.total ?? 0} demandas na fila</span><button disabled={paginaFila*100 >= (data?.total ?? 0)} onClick={()=>mudarPagina(paginaFila+1)}>Próxima</button><a href="/historico" className="underline">Histórico completo</a>
        {demandas.some((d:{statusVisivel:string;finalizadaEm?:string|null})=>d.statusVisivel==="finalizado" && !d.finalizadaEm) && <p className="text-xs text-amber-400">Há concluídos legados sem data nesta página; continuam visíveis até revisão.</p>}
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
          <DemandasLista demandas={demandas} onAbrir={(id) => router.push(`/demandas/${id}`)} />
        </div>
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
