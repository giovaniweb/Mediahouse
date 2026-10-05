"use client"

import { useState, useCallback, useEffect, Suspense } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { useSearchParams, useRouter } from "next/navigation"
import { FiltrosQuadro, lerPeriodo } from "@/components/kanban/FiltrosQuadro"
import { opcoesDePessoa, parametroDaPessoa } from "@/components/kanban/filtroPessoa"
import { KanbanBoard } from "@/components/kanban/KanbanBoard"
import { Header } from "@/components/layout/Header"
import { NovaDemandaModal } from "@/components/demandas/NovaDemandaModal"
import { BarraVisao } from "@/components/demandas/BarraVisao"
import actionStyles from "@/components/demandas/DemandAction.module.css"
import { DemandasLista } from "@/components/demandas/DemandasLista"
import { DemandaModal } from "@/components/demandas/DemandaModal"
import { normalizarVisao } from "@/components/demandas/tipos-visao"
import type { Visao, AbaRapida } from "@/components/demandas/tipos-visao"
import { Plus, XCircle } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { AUDIOVISUAL_COLUNA_PARA_STATUS } from "@/lib/kanban-movimento"
import { useMe } from "@/hooks/usePermissoes"


interface Videomaker { id: string; nome: string }
interface Editor { id: string; nome: string }
interface Produto { id: string; nome: string }
interface Responsavel { id: string; nome: string; tipo: string }

// useSearchParams obriga um limite de Suspense para o Next conseguir
// pré-renderizar a rota — sem ele o build falha em /demandas.
export default function DemandasPage() {
  return (
    <Suspense fallback={null}>
      <DemandasKanban />
    </Suspense>
  )
}

function DemandasKanban() {
  // Módulos desta empresa — antes eram constantes iguais para todas.
  const { data: me } = useMe()
  const { data: session } = useSession()
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [filtroDepto, setFiltroDepto] = useState("")
  const [filtroPessoa, setFiltroPessoa] = useState("")
  const [filtroPrazo, setFiltroPrazo] = useState("")
  const [filtroLinha, setFiltroLinha] = useState("")
  const [filtroProduto, setFiltroProduto] = useState("")
  const [filtroEvento, setFiltroEvento] = useState("")

  // Visão escolhida e recorte rápido. A visão fica guardada por área: quem
  // prefere uma lista abre direto na Lista na próxima vez, sem reconfigurar.
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null)
  const [visao, setVisao] = useState<Visao>("kanban")
  const [aba, setAba] = useState<AbaRapida>("todos")
  const CHAVE_VISAO = "nuflow:visao-demandas-audiovisual"

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

  // Filtros que chegam pela URL — é assim que os cards do dashboard abrem uma
  // lista já recortada. Antes o link mandava ?filtro=atrasadas e nem a página
  // nem a API liam, então o clique só abria o quadro inteiro.
  const searchParamsUrl = useSearchParams()
  const soAtrasadas = searchParamsUrl.get("atrasadas") === "1"
  const prioridadeUrl = searchParamsUrl.get("prioridade") ?? ""
  const statusUrl = searchParamsUrl.get("statusVisivel") ?? ""
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null)
  const [showNovaDemandaModal, setShowNovaDemandaModal] = useState(false)

  // Abrir o formulário por link. Existia uma página cheia em /demandas/nova que
  // fazia a mesma coisa que este modal — e tinha divergido dele. Agora os botões
  // "Nova Demanda" espalhados pelo sistema apontam para cá, e a pessoa que veio
  // pronta no link (ficha do videomaker/editor) chega já escolhida.
  const abrirNova = searchParamsUrl.get("nova") === "1"
  const prefillVideomaker = searchParamsUrl.get("videomakerId") ?? undefined
  const prefillEditor = searchParamsUrl.get("editorId") ?? undefined

  useEffect(() => {
    if (abrirNova) setShowNovaDemandaModal(true)
  }, [abrirNova])

  // Tira os parâmetros da URL ao fechar: sem isso um F5 (ou o Voltar do
  // navegador) reabriria o formulário sozinho.
  function fecharNovaDemanda() {
    setShowNovaDemandaModal(false)
    if (abrirNova) router.replace("/demandas", { scroll: false })
  }

  // Dados para filtros
  const { data: dataVMs } = useSWR<{ videomakers: Videomaker[] }>("/api/videomakers?status=ativo&limit=200", fetcher)
  const { data: dataEds } = useSWR<{ editores: Editor[] }>("/api/editores?status=ativo&limit=200", fetcher)
  const { data: dataProdutos } = useSWR<{ produtos: Produto[] }>("/api/produtos?limit=200", fetcher)
  const { data: dataEventos } = useSWR<{ eventos: { id: string; nome: string }[] }>(me?.modulos?.eventos ? "/api/eventos" : null, fetcher)
  const { data: dataResp } = useSWR<{ responsaveis: Responsavel[] }>("/api/growth/responsaveis?area=audiovisual", fetcher)
  const { data: dataLinhas } = useSWR<{ linhas: { id: string; nome: string }[] }>("/api/growth/linhas-projetos", fetcher)
  const { data: dataDeptos } = useSWR<{ parametros: { valor: string; label: string }[] }>(
    "/api/configuracoes/parametros?grupo=departamentos", fetcher
  )

  const departamentos = dataDeptos?.parametros ?? []
  const videomakers = dataVMs?.videomakers ?? []
  const editores = dataEds?.editores ?? []
  const produtos = dataProdutos?.produtos ?? []
  const eventos = dataEventos?.eventos ?? []
  const responsaveis = dataResp?.responsaveis ?? []
  const linhas = dataLinhas?.linhas ?? []
  const pessoas = opcoesDePessoa([
    ...videomakers.map(v => ({ papel: "vm" as const, id: v.id, nome: v.nome, funcao: "Videomaker" })),
    ...editores.map(e => ({ papel: "ed" as const, id: e.id, nome: e.nome, funcao: "Editor" })),
    ...responsaveis.map(r => ({ papel: "us" as const, id: r.id, nome: r.nome, funcao: r.tipo })),
  ])

  const [navegacaoFila, setNavegacaoFila] = useState({ filtro: "", pagina: 1 })
  const params = new URLSearchParams()
  params.set("filaTrabalho", "1")

  params.set("area", "audiovisual")
  // Cobertura tem quadro próprio (/jobs). Sem isto o mesmo registro aparecia
  // nos dois lugares, e converter em Job não tirava a demanda daqui.
  params.set("semCobertura", "1")
  if (search) params.set("search", search)
  if (filtroDepto) params.set("departamento", filtroDepto)
  const pessoa = parametroDaPessoa(filtroPessoa)
  if (pessoa) params.set(...pessoa)
  const prazo = lerPeriodo(filtroPrazo)
  if (prazo.de) params.set("prazoDe", prazo.de)
  if (prazo.ate) params.set("prazoAte", prazo.ate)
  if (filtroLinha) params.set("linhaProjetoId", filtroLinha)
  if (filtroProduto) params.set("produtoId", filtroProduto)
  if (filtroEvento) params.set("eventoGestaoId", filtroEvento)
  // As abas rápidas são recortes do MESMO conjunto — por isso viram parâmetro da
  // consulta, e não uma filtragem no cliente: as três visões precisam concordar.
  if (aba === "minhas") params.set("mine", "1")
  if (aba === "criadas") params.set("criadasPorMim", "1")
  if (aba === "atrasadas") params.set("atrasadas", "1")
  if (soAtrasadas) params.set("atrasadas", "1")
  if (prioridadeUrl) params.set("prioridade", prioridadeUrl)
  if (statusUrl) params.set("statusVisivel", statusUrl)
  const chaveFiltro = params.toString()
  const paginaFila = navegacaoFila.filtro === chaveFiltro ? navegacaoFila.pagina : 1
  const setPaginaFila = (mudar: (pagina: number) => number) => setNavegacaoFila({ filtro: chaveFiltro, pagina: mudar(paginaFila) })
  params.set("limit", "100")
  params.set("offset", String((paginaFila-1)*100))
  const url = `/api/demandas?${params}`

  const { data, mutate } = useSWR(url, fetcher, { refreshInterval: 15000 })

  // Tamanho da fila sem recorte nem filtro, para o topo dizer "18 de 240 na
  // fila" em vez de chamar o recorte de fila. Uma linha só: interessa o total.
  const fila = new URLSearchParams({ filaTrabalho: "1", area: "audiovisual", semCobertura: "1", limit: "1" })
  const recortado = chaveFiltro !== new URLSearchParams({ filaTrabalho: "1", area: "audiovisual", semCobertura: "1" }).toString()
  const { data: dataFila } = useSWR<{ total: number }>(recortado ? `/api/demandas?${fila}` : null, fetcher, { refreshInterval: 30000 })
  const demandasAll = data?.demandas ?? []

  const demandas = demandasAll


  function showToast(msg: string, tipo: "ok" | "erro") {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  const handleMove = useCallback(
    async (demandaId: string, novoStatusVisivel: string, extra?: { observacao: string }) => {
      // Coluna → statusInterno representativo (dispara notificações WhatsApp)
      const statusInterno = AUDIOVISUAL_COLUNA_PARA_STATUS[novoStatusVisivel]
      if (!statusInterno) return

      // Salvar estado anterior para rollback
      const estadoAnterior = data

      // Optimistic update
      mutate(
        (prev: { demandas: Array<{ id: string; statusVisivel: string }> }) => ({
          ...prev,
          demandas: prev.demandas.map((d: { id: string; statusVisivel: string }) =>
            d.id === demandaId ? { ...d, statusVisivel: novoStatusVisivel } : d
          ),
        }),
        false
      )

      try {
        const res = await fetch(`/api/demandas/${demandaId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statusInterno, origem: "kanban", ...extra }),
        })

        if (!res.ok) {
          const erro = await res.json().catch(() => ({ error: "Erro desconhecido" }))
          // Rollback optimistic update
          mutate(estadoAnterior, false)
          showToast(erro.error || `Erro ao mover (${res.status})`, "erro")
          return
        }

        showToast("Card movido com sucesso", "ok")
        mutate()
      } catch (e) {
        // Rollback on network error
        mutate(estadoAnterior, false)
        showToast("Erro de conexão ao mover card", "erro")
      }
    },
    [mutate, data] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleDelete = useCallback(
    async (demandaId: string) => {
      if (!confirm("Tem certeza que deseja excluir esta demanda?")) return

      try {
        const res = await fetch(`/api/demandas/${demandaId}`, { method: "DELETE" })
        if (!res.ok) {
          const erro = await res.json().catch(() => ({ error: "Erro desconhecido" }))
          showToast(erro.error || "Erro ao excluir", "erro")
          return
        }
        showToast("Demanda excluída", "ok")
        mutate()
      } catch {
        showToast("Erro de conexão ao excluir", "erro")
      }
    },
    [mutate] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleDuplicate = useCallback(
    async (demandaId: string) => {
      try {
        const res = await fetch(`/api/demandas/${demandaId}/duplicate`, { method: "POST" })
        if (!res.ok) {
          const erro = await res.json().catch(() => ({ error: "Erro ao duplicar" }))
          showToast(erro.error || "Erro ao duplicar", "erro")
          return
        }
        showToast("Demanda duplicada! ✅", "ok")
        mutate()
      } catch {
        showToast("Erro de conexão ao duplicar", "erro")
      }
    },
    [mutate] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleMarkPosted = useCallback(
    async (demandaId: string, tipo: string, link?: string) => {
      const res = await fetch(`/api/demandas/${demandaId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statusInterno: "postado",
          postagemTipo: tipo,
          ...(link ? { linkPostagem: link } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao registrar postagem" }))
        showToast(err.error || "Erro ao registrar postagem", "erro")
        throw new Error(err.error)
      }
      showToast("Postagem registrada! ✅", "ok")
      mutate()
    },
    [mutate] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <>
      <Header
        title="Demandas"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNovaDemandaModal(true)}
              className={actionStyles.newDemand}
            >
              <Plus className="w-4 h-4" /> Nova Demanda
            </button>
          </div>
        }
      />


      {/* Toast de feedback */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white transition-all animate-in fade-in slide-in-from-top-2 ${
            toast.tipo === "ok" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Números, recortes, busca e filtros */}
      <div className="px-4 pt-1 pb-3">
        <BarraVisao
          aviso={demandas.some((d: {statusVisivel: string; finalizadaEm?: string | null}) => d.statusVisivel === "finalizado" && !d.finalizadaEm) ? "Há concluídos antigos sem data nesta página. Eles continuam visíveis até a revisão; nenhuma data foi inventada." : undefined}
          area="audiovisual"
          filters={(
            <FiltrosQuadro
              busca={search}
              onBusca={setSearch}
              placeholder="Buscar demanda…"
              filtros={[
                { id: "prazo", rotulo: "Prazo", tipo: "periodo", valor: filtroPrazo, onChange: setFiltroPrazo },
                { id: "pessoa", rotulo: "Pessoa", valor: filtroPessoa, onChange: setFiltroPessoa, opcoes: pessoas },
                { id: "linha", rotulo: "Linha de produto", valor: filtroLinha, onChange: setFiltroLinha, opcoes: linhas.map(l => ({ valor: l.id, rotulo: l.nome })) },
                // Departamentos vêm de Configurações → Parâmetros. Antes eram fixos
                // aqui e já divergiam do banco ("Comercial" e "Social Media" não
                // existiam; "Audiovisual" faltava).
                { id: "departamento", rotulo: "Departamento", valor: filtroDepto, onChange: setFiltroDepto, opcoes: departamentos.map(d => ({ valor: d.valor, rotulo: d.label })) },
                { id: "produto", rotulo: "Produto", valor: filtroProduto, onChange: setFiltroProduto, opcoes: produtos.map(p => ({ valor: p.id, rotulo: p.nome })) },
                ...(me?.modulos?.eventos ? [{ id: "evento", rotulo: "Evento", valor: filtroEvento, onChange: setFiltroEvento, opcoes: eventos.map(ev => ({ valor: ev.id, rotulo: ev.nome })) }] : []),
              ]}
            >
              {/* Recorte que veio de um card do dashboard. Sem este aviso o quadro
                  aparece parcial e parece que sumiram demandas. */}
              {(soAtrasadas || prioridadeUrl || statusUrl) && (
                <a href="/demandas"
                  className="flex min-h-[34px] items-center gap-1 whitespace-nowrap text-xs text-amber-300 border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors">
                  <XCircle className="w-3.5 h-3.5" />
                  {soAtrasadas ? "Só atrasadas" : prioridadeUrl ? `Só ${prioridadeUrl}` : "Recorte ativo"} — ver tudo
                </a>
              )}
            </FiltrosQuadro>
          )}
          demandas={demandas}
          visao={visao}
          onVisao={trocarVisao}
          aba={aba}
          onAba={setAba}
          total={data?.total}
          totalFila={recortado ? dataFila?.total : data?.total}
          pagina={paginaFila}
          onPagina={p => setPaginaFila(() => p)}
        />
      </div>

      {/* A visão escolhida. Kanban precisa de altura ancorada na viewport para a
          barra de rolagem ficar no rodapé; a lista rola com a página. */}
      <DemandaModal demandaId={selectedDetail} onClose={() => setSelectedDetail(null)} />
      {visao === "kanban" ? (
        <div data-kanban-container className="flex-1 min-h-[560px] px-4 pb-4 pt-2 overflow-hidden">
          <KanbanBoard demandas={demandas} onMove={handleMove} onDelete={handleDelete} onDuplicate={handleDuplicate} onMarkPosted={handleMarkPosted} userTipo={session?.user?.tipo} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-4 pb-6 overflow-y-auto">
          <DemandasLista demandas={demandas} onAbrir={setSelectedDetail} />
        </div>
      )}

      {/* Modal Nova Demanda */}
      <NovaDemandaModal
        open={showNovaDemandaModal}
        onClose={fecharNovaDemanda}
        prefill={{ videomakerId: prefillVideomaker, editorId: prefillEditor }}
      />
    </>
  )
}
