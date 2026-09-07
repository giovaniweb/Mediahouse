"use client"

import { Suspense, useMemo, useState } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { JobsQuadro } from "@/components/jobs/JobsQuadro"
import type { JobDoQuadro } from "@/components/jobs/JobCard"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import { ehHoje } from "@/lib/datas"
import { estaAtrasada } from "@/lib/status"
import { Search } from "lucide-react"

// Quadro operacional de Jobs.
//
// Consome `/api/demandas?area=audiovisual` — a mesma rota do quadro atual, sem
// alteração nenhuma. Ela já devolve videomaker, editor, designer, responsável,
// datas e status; tudo o que o card mostra é DERIVADO disso em `lib/job-fase.ts`.
// Não havia motivo para rota nova, e rota nova seria a arquitetura paralela que
// a especificação proíbe.
//
// Os recortes que a API entende (meus, atrasados, videomaker, editor, tipo) vão
// na URL; "hoje" e "região" são filtrados aqui, sobre a lista já carregada,
// para não mexer na rota nesta etapa.

type Aba = "todos" | "meus" | "hoje" | "atrasados"

const ABAS: { id: Aba; label: string }[] = [
  { id: "todos",     label: "Todos" },
  { id: "meus",      label: "Meus Jobs" },
  { id: "hoje",      label: "Hoje" },
  { id: "atrasados", label: "Atrasados" },
]

export default function JobsPage() {
  // useSearchParams não é usado aqui, mas o Header e os hooks de sessão pedem
  // o mesmo limite de Suspense que /demandas usa.
  return (
    <Suspense fallback={null}>
      <Quadro />
    </Suspense>
  )
}

type Opcao = { id: string; nome: string }

function Quadro() {
  const router = useRouter()
  const [aba, setAba] = useState<Aba>("todos")
  const [busca, setBusca] = useState("")
  const [videomakerId, setVideomakerId] = useState("")
  const [editorId, setEditorId] = useState("")
  const [tipo, setTipo] = useState("")
  const [regiao, setRegiao] = useState("")

  const params = new URLSearchParams({ area: "audiovisual" })
  if (aba === "meus") params.set("mine", "1")
  if (aba === "atrasados") params.set("atrasadas", "1")
  if (busca.trim()) params.set("search", busca.trim())
  if (videomakerId) params.set("videomakerId", videomakerId)
  if (editorId) params.set("editorId", editorId)
  // Tipo e região NÃO vão para a API de propósito: as opções dos dois selects
  // são derivadas da lista carregada, e filtrar no servidor faria a lista de
  // opções encolher para o próprio valor escolhido — sem como trocar de tipo
  // sem antes limpar o filtro. Videomaker e editor podem ir, porque as opções
  // deles vêm de endpoints próprios e não dependem desta lista.

  const { data, isLoading } = useSWR<{ demandas: JobDoQuadro[] }>(
    `/api/demandas?${params}`,
    fetcher,
    { refreshInterval: 30000, keepPreviousData: true }
  )
  // As duas rotas devolvem objeto embrulhado ({ videomakers }, { editores }),
  // não array — o genérico do SWR é asserção e não avisaria em runtime.
  const { data: vmResp } = useSWR<{ videomakers: Opcao[] }>("/api/videomakers", fetcher)
  const { data: edResp } = useSWR<{ editores: Opcao[] }>("/api/editores", fetcher)
  const vms = vmResp?.videomakers ?? []
  const editores = edResp?.editores ?? []

  const todos = useMemo(() => data?.demandas ?? [], [data])

  // Opções de tipo e região saem dos próprios jobs: sem cadastro paralelo, e a
  // lista nunca oferece um filtro que não devolveria nada.
  const tipos = useMemo(
    () => [...new Set(todos.map((j) => j.tipoVideo).filter(Boolean))].sort() as string[],
    [todos]
  )
  const regioes = useMemo(
    () => [...new Set(todos.map((j) => j.cidade).filter(Boolean))].sort() as string[],
    [todos]
  )

  const jobs = useMemo(() => {
    let lista = todos
    // "Hoje" é a captação de hoje — a pergunta é "o que acontece hoje", não
    // "o que vence hoje". Quem quer prazo usa Atrasados.
    if (aba === "hoje") lista = lista.filter((j) => j.dataCaptacao && ehHoje(j.dataCaptacao))
    if (tipo) lista = lista.filter((j) => j.tipoVideo === tipo)
    if (regiao) lista = lista.filter((j) => j.cidade === regiao)
    return lista
  }, [todos, aba, tipo, regiao])

  const atrasados = jobs.filter(estaAtrasada).length

  const abrir = (id: string) => router.push(`/demandas/${id}`)

  const selectClass =
    "bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600"

  return (
    <div className="flex flex-col h-screen">
      <Header title="Jobs" />

      <div className="px-4 pt-3 pb-2 space-y-2.5">
        {/* Recortes principais (§35) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                aba === a.id
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
              )}
            >
              {a.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
            <span className="tabular-nums">{jobs.length} jobs</span>
            {atrasados > 0 && (
              <span className="text-red-400 tabular-nums">{atrasados} atrasados</span>
            )}
          </div>
        </div>

        {/* Busca e recortes secundários */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código, título…"
              className="bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 w-56 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <select value={videomakerId} onChange={(e) => setVideomakerId(e.target.value)} className={selectClass}>
            <option value="">Videomaker</option>
            {vms.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>

          <select value={editorId} onChange={(e) => setEditorId(e.target.value)} className={selectClass}>
            <option value="">Editor</option>
            {editores.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>

          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={selectClass}>
            <option value="">Tipo</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <select value={regiao} onChange={(e) => setRegiao(e.target.value)} className={selectClass}>
            <option value="">Região</option>
            {regioes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 pb-4">
        {isLoading && todos.length === 0 ? (
          <p className="text-sm text-zinc-500 px-10 py-8">Carregando…</p>
        ) : (
          <JobsQuadro jobs={jobs} onAbrir={abrir} />
        )}
      </div>
    </div>
  )
}
