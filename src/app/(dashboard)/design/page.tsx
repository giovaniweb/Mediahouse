"use client"

import { useState, useCallback, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { Plus } from "lucide-react"
import { FiltrosQuadro, lerPeriodo } from "@/components/kanban/FiltrosQuadro"
import { KanbanBoard } from "@/components/kanban/KanbanBoard"
import { GROWTH_COLUNAS, GROWTH_COLUNA_PARA_STATUS, growthColunaDe, type GrowthColunaId } from "@/lib/growth-kanban"
import { TIPOS_CONTEUDO } from "@/lib/growth-conteudo"
import { toast } from "sonner"
import { BarraVisao } from "@/components/demandas/BarraVisao"
import actionStyles from "@/components/demandas/DemandAction.module.css"
import { NovaDemandaGrowthModal } from "@/components/demandas/NovaDemandaGrowthModal"
import { DemandasLista } from "@/components/demandas/DemandasLista"
import { DemandaModal } from "@/components/demandas/DemandaModal"
import { normalizarVisao } from "@/components/demandas/tipos-visao"
import type { Visao, AbaRapida } from "@/components/demandas/tipos-visao"
import { fetcher } from "@/lib/fetcher"
import { Header } from "@/components/layout/Header"
import { erroDaResposta, mensagemDeErro } from "@/lib/erro-cliente"

// Growth (gestão de conteúdos). Reutiliza a Demanda (area="design" internamente),
// mas com kanban próprio de 8 colunas e SEM qualquer dependência de Eventos.
// useSearchParams pede um limite de Suspense para o build pré-renderizar a rota.
export default function GrowthKanbanPage() {
  return <Suspense fallback={null}><GrowthKanban /></Suspense>
}

function GrowthKanban() {
  const { data: session } = useSession()
  // O card "Atrasadas" do dashboard do Growth chega com ?atrasadas=1 e abre já
  // no recorte, como no Audiovisual.
  const atrasadasUrl = useSearchParams().get("atrasadas") === "1"
  const [showNova, setShowNova] = useState(false)

  // Filtros — adaptados às peculiaridades do Growth (pessoas/responsável,
  // linha/projeto, tipo de conteúdo, produto) em vez de videomaker/editor.
  const [search, setSearch] = useState("")
  const [filtroResp, setFiltroResp] = useState("")
  const [filtroPrazo, setFiltroPrazo] = useState("")
  const [filtroLinha, setFiltroLinha] = useState("")
  const [filtroTipo, setFiltroTipo] = useState("")
  const [filtroProduto, setFiltroProduto] = useState("")

  // Mesmas duas visões do audiovisual, com preferência guardada em separado:
  // quem cuida de Growth pode querer lista e quem cuida de vídeo, kanban.
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null)
  const [visao, setVisao] = useState<Visao>("kanban")
  const [aba, setAba] = useState<AbaRapida>(atrasadasUrl ? "atrasadas" : "todos")
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

  const [navegacaoFila,setNavegacaoFila] = useState({filtro:"",pagina:1})
  const params = new URLSearchParams()
  params.set("filaTrabalho","1")
  params.set("area", "design")
  if (search) params.set("search", search)
  if (aba === "minhas") params.set("mine", "1")
  if (aba === "criadas") params.set("criadasPorMim", "1")
  if (aba === "atrasadas") params.set("atrasadas", "1")
  if (filtroResp) params.set("responsavelId", filtroResp)
  const prazo = lerPeriodo(filtroPrazo)
  if (prazo.de) params.set("prazoDe", prazo.de)
  if (prazo.ate) params.set("prazoAte", prazo.ate)
  if (filtroLinha) params.set("linhaProjetoId", filtroLinha)
  if (filtroTipo) params.set("tipoVideo", filtroTipo)
  if (filtroProduto) params.set("produtoId", filtroProduto)

  const chaveFiltro = params.toString()
  const paginaFila = navegacaoFila.filtro === chaveFiltro ? navegacaoFila.pagina : 1
  const mudarPagina = (pagina:number) => setNavegacaoFila({filtro:chaveFiltro,pagina})
  params.set("limit","100"); params.set("offset",String((paginaFila-1)*100))
  const { data, mutate } = useSWR(`/api/demandas?${params}`, fetcher, { refreshInterval: 15000 })

  // Tamanho da fila sem recorte nem filtro, para o topo dizer "18 de 240 na
  // fila" em vez de chamar o recorte de fila. Uma linha só: interessa o total.
  const recortado = chaveFiltro !== "filaTrabalho=1&area=design"
  const { data: dataFila } = useSWR<{ total: number }>(recortado ? "/api/demandas?filaTrabalho=1&area=design&limit=1" : null, fetcher, { refreshInterval: 30000 })
  const demandasAll = data?.demandas ?? []

  const demandas = demandasAll

  const handleMove = useCallback(async (demandaId: string, novaColuna: string) => {
    const statusInterno = GROWTH_COLUNA_PARA_STATUS[novaColuna as GrowthColunaId]
    if (!statusInterno) return
    const anterior = data?.demandas?.find((d: { id: string }) => d.id === demandaId)?.statusInterno
    const atualizar = (status: string) => mutate((prev: { demandas: Array<{ id: string; statusInterno: string }> } | undefined) => prev ? ({
      ...prev,
      demandas: prev.demandas.map(d => d.id === demandaId ? { ...d, statusInterno: status } : d),
    }) : prev, false)
    await atualizar(statusInterno)
    try {
      const res = await fetch(`/api/demandas/${demandaId}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusInterno, origem: "kanban" }),
      })
      if (!res.ok) {
        if (anterior) await atualizar(anterior)
        toast.error(mensagemDeErro(await erroDaResposta(res), "Não foi possível mover o card."))
      }
      void mutate()
    } catch {
      if (anterior) await atualizar(anterior)
      void mutate()
      toast.error("Erro de conexão. Não foi possível confirmar o movimento do card.")
    }
  }, [mutate, data])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Excluir esta demanda?")) return
    await fetch(`/api/demandas/${id}`, { method: "DELETE" }); mutate()
  }, [mutate])

  const handleDuplicate = useCallback(async (id: string) => {
    await fetch(`/api/demandas/${id}/duplicate`, { method: "POST" }); mutate()
  }, [mutate])

  return (
    <div className="flex flex-col h-full">
      <Header title="Growth · Demandas" actions={<button onClick={() => setShowNova(true)} className={actionStyles.newDemand}><Plus className="w-4 h-4" /> Nova Demanda</button>} />

      <div className="px-4 pt-1 pb-3">
        <BarraVisao
          aviso={demandas.some((d: {statusVisivel: string; finalizadaEm?: string | null}) => d.statusVisivel === "finalizado" && !d.finalizadaEm) ? "Há concluídos antigos sem data nesta página. Eles continuam visíveis até a revisão; nenhuma data foi inventada." : undefined}
          area="growth"
          filters={(
            <FiltrosQuadro
              busca={search}
              onBusca={setSearch}
              placeholder="Buscar demanda…"
              filtros={[
                { id: "prazo", rotulo: "Prazo", tipo: "periodo", valor: filtroPrazo, onChange: setFiltroPrazo },
                // No Growth quem pega o card é sempre alguém da casa (responsável),
                // então "Pessoa" é a lista de responsáveis, sem prefixo de papel.
                { id: "pessoa", rotulo: "Pessoa", valor: filtroResp, onChange: setFiltroResp, opcoes: responsaveis.map(r => ({ valor: r.id, rotulo: r.label ?? r.nome })) },
                { id: "linha", rotulo: "Linha de produto", valor: filtroLinha, onChange: setFiltroLinha, opcoes: linhas.map(l => ({ valor: l.id, rotulo: l.nome })) },
                { id: "tipo", rotulo: "Tipo de conteúdo", valor: filtroTipo, onChange: setFiltroTipo, opcoes: TIPOS_CONTEUDO.map(t => ({ valor: t.key, rotulo: t.label })) },
                { id: "produto", rotulo: "Produto", valor: filtroProduto, onChange: setFiltroProduto, opcoes: produtos.map(p => ({ valor: p.id, rotulo: p.nome })) },
              ]}
            />
          )}
          demandas={demandas}
          visao={visao}
          onVisao={trocarVisao}
          aba={aba}
          onAba={setAba}
          total={data?.total}
          totalFila={recortado ? dataFila?.total : data?.total}
          pagina={paginaFila}
          onPagina={mudarPagina}
        />
      </div>

      <DemandaModal demandaId={selectedDetail} onClose={() => setSelectedDetail(null)} />
      {visao === "kanban" ? (
        <div data-kanban-container className="flex-1 min-h-[560px] px-4 pb-4 pt-2 overflow-hidden">
          <KanbanBoard
            demandas={demandas}
            onMove={handleMove}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            userTipo={session?.user?.tipo}
            colunas={GROWTH_COLUNAS}
            getColuna={(d) => growthColunaDe(d.statusInterno)}
            openMode="modal"
            historico="/historico/growth"
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-4 pb-6 overflow-y-auto">
          <DemandasLista demandas={demandas} onAbrir={setSelectedDetail} />
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
