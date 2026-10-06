"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { ExternalLink, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { useMe } from "@/hooks/usePermissoes"
import { FiltrosQuadro, lerPeriodo } from "@/components/kanban/FiltrosQuadro"
import { departamentosVisiveis, lerDepartamento, NOME_DEPARTAMENTO, type Departamento } from "@/lib/painel-departamento"
import { TIPOS_CONTEUDO } from "@/lib/growth-conteudo"
import dash from "@/components/dashboard/DashboardPreview.module.css"
import styles from "@/components/layout/TeamSurface.module.css"

interface Demanda {
  id: string
  codigo: string
  titulo: string
  tipoVideo: string
  departamento: string
  finalizadaEm: string | null
  updatedAt: string
  videomaker?: { nome: string } | null
  editor?: { nome: string } | null
  designer?: { nome: string } | null
  responsavel?: { nome: string } | null
  responsaveis?: { usuario: { nome: string } }[]
  produtos?: { produto: { nome: string } }[]
}

// Quem fez, em qualquer departamento: no vídeo, videomaker e editor; na arte,
// designer e responsáveis. Uma coluna só em vez de uma por papel.
function quemFez(d: Demanda): string {
  const nomes = [d.videomaker?.nome, d.editor?.nome, d.designer?.nome, d.responsavel?.nome, ...(d.responsaveis ?? []).map(r => r.usuario.nome)]
  return [...new Set(nomes.filter((n): n is string => !!n))].join(", ")
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" })
}

const PAGE_SIZE = 50

// Um histórico só, com o departamento no caminho (/historico/growth): é por ele
// que o menu lateral marca o item certo e o topo de cada quadro abre o seu.
export default function HistoricoPage() {
  const router = useRouter()
  const { data: me } = useMe()
  // Lista vazia: /api/me ainda não respondeu. Até lá vale o da URL — trocar de
  // área com o perfil pela metade era o que jogava todo mundo no Audiovisual.
  const opcoes = departamentosVisiveis(me)
  const carregou = opcoes.length > 0
  const daUrl = lerDepartamento(useParams<{ departamento: string }>().departamento)
  const departamento: Departamento = !carregou ? daUrl ?? "audiovisual"
    : daUrl && opcoes.includes(daUrl) ? daUrl : opcoes[0]
  // Departamento que a pessoa não vê (ou inexistente) vira o primeiro que ela vê,
  // também na URL, para o menu acompanhar. A regra é a do menu: o que ele
  // mostra, a página aceita.
  useEffect(() => {
    if (carregou && daUrl !== departamento) router.replace(`/historico/${departamento}`)
  }, [carregou, daUrl, departamento, router])
  const [search, setSearch] = useState("")
  const [tipoVideo, setTipoVideo] = useState("")
  const [concluida, setConcluida] = useState("")
  const [page, setPage] = useState(1)
  const { de: deDate, ate: ateDate } = lerPeriodo(concluida)

  function trocarDepartamento(d: Departamento) {
    setTipoVideo("")
    setPage(1)
    router.replace(`/historico/${d}`, { scroll: false })
  }

  const params = new URLSearchParams()
  params.set("statusVisivel", "finalizado")
  // Social Media são os pedidos dela, de vídeo ou de arte; os outros dois são a área.
  if (departamento === "social") params.set("social", "1")
  else params.set("area", departamento === "growth" ? "design" : "audiovisual")
  params.set("limit", String(PAGE_SIZE))
  params.set("offset", String((page - 1) * PAGE_SIZE))
  if (search) params.set("search", search)
  if (tipoVideo) params.set("tipoVideo", tipoVideo)
  if (deDate) params.set("de", deDate)
  if (ateDate) params.set("ate", ateDate)

  const url = `/api/demandas?${params}`
  const { data, error, isLoading, isValidating, mutate } = useSWR(!carregou ? null : url, fetcher, { keepPreviousData: true })

  // Rótulos dos tipos vêm de Configurações → Parâmetros, para o filtro e a
  // tabela falarem a mesma língua do resto do sistema.
  const { data: dataTipos } = useSWR<{ parametros: { valor: string; label: string }[] }>(
    "/api/configuracoes/parametros?grupo=tipos_video", fetcher
  )
  // Growth usa os tipos de conteúdo; a social mistura vídeo e arte, então o
  // rótulo procura nas duas listas e o filtro de tipo não aparece.
  const tiposVideo = dataTipos?.parametros ?? []
  const tiposConteudo = TIPOS_CONTEUDO.map((t) => ({ valor: t.key, label: t.label }))
  const tipos = departamento === "growth" ? tiposConteudo : departamento === "audiovisual" ? tiposVideo : []
  const rotuloTipo = (valor: string) => [...tiposVideo, ...tiposConteudo].find((t) => t.valor === valor)?.label ?? valor

  const demandas: Demanda[] = data?.demandas ?? []
  const total: number = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const temFiltros = !!(tipoVideo || concluida)

  function limparFiltros() {
    setTipoVideo("")
    setConcluida("")
    setPage(1)
  }

  function handleSearch(v: string) {
    setSearch(v)
    setPage(1)
  }

  return (
    <>
      <Header title={`Histórico · ${NOME_DEPARTAMENTO[departamento]}`} />

      <main className={styles.page} style={{ paddingBottom: 100 }}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div>
              <p className={styles.eyebrow}>{NOME_DEPARTAMENTO[departamento].toUpperCase()} / HISTÓRICO</p>
              <h1 className={styles.title}>O trabalho que já virou entrega.</h1>
              <p className="text-xs text-zinc-400">Serviços e custos continuam acessíveis na demanda, mesmo sem arquivo. Filtros de data usam apenas conclusões registradas.</p>
              <p className="text-sm text-zinc-400">
                {error ? "Histórico indisponível no momento" : isLoading ? "Carregando…" : `${total.toLocaleString("pt-BR")} ${total === 1 ? "demanda concluída" : "demandas concluídas"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/galeria"
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Ver Galeria Pública
            </Link>
          </div>
        </div>

        {/* Departamento, busca e filtros */}
        <div className="flex flex-col gap-3 mb-5">
          {opcoes.length > 1 && <div className={dash.departamentos} style={{ marginTop: 0, alignSelf: "flex-start" }} role="group" aria-label="Departamento">
            {opcoes.map(d => <button key={d} type="button" aria-pressed={d === departamento} onClick={() => trocarDepartamento(d)}>{NOME_DEPARTAMENTO[d]}</button>)}
          </div>}
          <FiltrosQuadro
            busca={search}
            onBusca={handleSearch}
            placeholder="Buscar por título ou código…"
            filtros={[
              { id: "concluida", rotulo: "Concluída em", tipo: "periodo", valor: concluida, onChange: v => { setConcluida(v); setPage(1) } },
              { id: "tipo", rotulo: departamento === "growth" ? "Tipo de conteúdo" : "Tipo de vídeo", valor: tipoVideo, onChange: v => { setTipoVideo(v); setPage(1) }, opcoes: tipos.map(t => ({ valor: t.valor, rotulo: t.label })) },
            ]}
          />
        </div>


        {/* Tabela */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wide">
                <th className="hidden sm:table-cell text-left px-4 py-3">Código</th>
                <th className="text-left px-4 py-3">Título</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Tipo</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Quem fez</th>
                <th className="hidden sm:table-cell text-left px-4 py-3">Concluído em</th>
              </tr>
            </thead>
            <tbody>
              {error && <tr><td colSpan={5} className="p-6"><div role="alert"><p>Não foi possível carregar o histórico.</p><button disabled={isValidating} onClick={() => mutate()} className="text-purple-300">Tentar novamente</button></div></td></tr>}
              {!error && isLoading && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-zinc-500">Carregando…</td>
                </tr>
              )}
              {!error && !isLoading && demandas.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <CheckCircle2 className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <p className="text-zinc-400">Nenhuma demanda encontrada</p>
                    {temFiltros && (
                      <button onClick={limparFiltros} className="mt-2 text-sm text-purple-400 hover:underline">
                        Limpar filtros
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {!error && !isLoading && demandas.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="hidden sm:table-cell px-4 py-3">
                    <Link href={`/demandas/${d.id}`} className="font-mono text-xs text-zinc-400 hover:text-purple-400 transition-colors">
                      {d.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/demandas/${d.id}`} className="text-zinc-200 hover:text-white font-medium transition-colors block break-words [overflow-wrap:anywhere]">
                      {d.titulo}
                    </Link>
                    <p className="sm:hidden text-xs text-zinc-400 mt-2 break-all">{d.codigo} · {fmtDate(d.finalizadaEm ?? d.updatedAt)}</p>
                    {d.produtos?.[0]?.produto?.nome && (
                      <span className="text-xs text-zinc-500">{d.produtos[0].produto.nome}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700">
                      {rotuloTipo(d.tipoVideo)}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-zinc-400 text-xs">
                    {quemFez(d) || <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                    {d.finalizadaEm ? fmtDate(d.finalizadaEm) : "Legado: conclusão sem data"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {!error && !isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-zinc-500">
              Página {page} de {totalPages} · {total} demandas
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Próxima <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
