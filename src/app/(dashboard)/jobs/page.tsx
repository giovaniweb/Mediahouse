"use client"

import Link from "next/link"
import { Suspense, useMemo, useState } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { JobsQuadro } from "@/components/jobs/JobsQuadro"
import type { JobDoQuadro } from "@/components/jobs/JobCard"
import { fetcher } from "@/lib/fetcher"
import { dataCalendario, ehHoje } from "@/lib/datas"
import { estaAtrasada } from "@/lib/status"
import { TIPO_COBERTURA, ehJob, proximaAcao, responsavelAtual } from "@/lib/job-fase"
import { FiltrosQuadro, lerPeriodo } from "@/components/kanban/FiltrosQuadro"
import { opcoesDePessoa, parametroDaPessoa } from "@/components/kanban/filtroPessoa"
import styles from "@/components/jobs/JobsPreview.module.css"
import topo from "@/components/demandas/BoardOverview.module.css"
import { LayoutGrid, List, ChevronRight } from "lucide-react"

// Quadro operacional de Jobs.
//
// ESCOPO: só coberturas JÁ APROVADAS. As três responsabilidades são separadas —
// /demandas é o kanban geral do audiovisual, /aprovacoes é a caixa de entrada
// das solicitações, e este quadro é a operação do que passou pela aprovação.
// A regra vive em `ehJob` (lib/job-fase.ts), com teste.
//
// A restrição de origem vai na URL (`tipoVideo=cobertura_evento`) para não
// trazer as 467 demandas do audiovisual e mostrar 28. O portão de aprovação é
// aplicado aqui, sobre a lista carregada: a API só faz igualdade em
// `statusInterno`, e a regra precisa de "fora destes dois estados E não
// recusada" — expressá-la no servidor exigiria mexer em /api/demandas, que
// pertence ao módulo de Demandas e não pode ser alterado nesta etapa.
//
// Consome a mesma rota do quadro atual, sem alteração nenhuma nela. Ela já
// devolve videomaker, editor, designer, responsável, datas e status; tudo o que
// o card mostra é DERIVADO disso.

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
  const [view, setView] = useState<"kanban" | "list">("kanban")
  const [aba, setAba] = useState<Aba>("todos")
  const [busca, setBusca] = useState("")
  const [pessoa, setPessoa] = useState("")
  const [regiao, setRegiao] = useState("")
  const [captacao, setCaptacao] = useState("")

  // A origem é fixa: este quadro não é o das demandas gerais.
  const params = new URLSearchParams({ area: "audiovisual", tipoVideo: TIPO_COBERTURA })
  if (aba === "meus") params.set("mine", "1")
  if (aba === "atrasados") params.set("atrasadas", "1")
  if (busca.trim()) params.set("search", busca.trim())
  const filtroPessoa = parametroDaPessoa(pessoa)
  if (filtroPessoa) params.set(...filtroPessoa)
  // Região NÃO vai para a API de propósito: as opções saem da lista carregada,
  // e filtrar no servidor faria a lista de opções encolher para o próprio valor
  // escolhido — sem como trocar de região sem antes limpar o filtro. A data da
  // captação fica no cliente pelo mesmo caminho (a API só filtra por prazo e
  // conclusão). Pessoa pode ir: as opções vêm de endpoints próprios.

  const { data, isLoading, error, mutate } = useSWR<{ demandas: JobDoQuadro[] }>(
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

  // As opções de região saem dos próprios jobs: sem cadastro paralelo, e a
  // lista nunca oferece um filtro que não devolveria nada. Não há filtro de
  // Tipo — todo Job aqui é cobertura, o seletor teria uma opção só.
  const regioes = useMemo(
    () => [...new Set(todos.map((j) => j.cidade).filter(Boolean))].sort() as string[],
    [todos]
  )

  const jobs = useMemo(() => {
    // O portão: fora as que ainda esperam decisão e as recusadas. Sem isto, a
    // caixa de entrada de Aprovações vazaria para dentro do quadro de operação.
    let lista = todos.filter(ehJob)
    // "Hoje" é a captação de hoje — a pergunta é "o que acontece hoje", não
    // "o que vence hoje". Quem quer prazo usa Atrasados.
    if (aba === "hoje") lista = lista.filter((j) => j.dataCaptacao && ehHoje(j.dataCaptacao))
    if (regiao) lista = lista.filter((j) => j.cidade === regiao)
    const { de, ate } = lerPeriodo(captacao)
    if (de || ate) lista = lista.filter((j) => {
      // Mesmo dia de calendário que a aba "Hoje" usa (ehHoje).
      const dia = j.dataCaptacao ? dataCalendario(j.dataCaptacao) : null
      return !!dia && (!de || dia >= de) && (!ate || dia <= ate)
    })
    return lista
  }, [todos, aba, regiao, captacao])

  const atrasados = jobs.filter(estaAtrasada).length

  // O card abre o Job, não a demanda: /jobs/[id] responde às perguntas do §64 e
  // oferece a próxima ação. A tela de Demandas continua existindo para a gestão.
  const abrir = (id: string) => router.push(`/jobs/${id}`)

  const pessoas = opcoesDePessoa([
    ...vms.map((v) => ({ papel: "vm" as const, id: v.id, nome: v.nome, funcao: "Videomaker" })),
    ...editores.map((e) => ({ papel: "ed" as const, id: e.id, nome: e.nome, funcao: "Editor" })),
  ])

  const captacoesHoje = jobs.filter((j) => j.dataCaptacao && ehHoje(j.dataCaptacao)).length
  const contagem = (n: number, um: string, varios: string) => (n === 1 ? um : varios)

  return (
    <>
      <Header title="Jobs" />

      {/* Topo do quadro no mesmo desenho do de Demandas (BarraVisao): duas
          linhas — visão e números; recortes e filtros. O nome da página já
          está na barra de cima, e o quadro precisa da altura da tela. */}
      <div className="px-4 pt-1 pb-3">
        <section className={topo.overview} aria-label="Controles do quadro">
          <div className={topo.topRow}>
            <div className={topo.tabs} aria-label="Visualização de Jobs">
              <button type="button" aria-label="Ver como kanban" aria-pressed={view === "kanban"} onClick={() => setView("kanban")}><LayoutGrid size={16} />Kanban</button>
              <button type="button" aria-label="Ver como lista" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={16} />Lista</button>
            </div>
            <div className={topo.counts} aria-label="Resumo dos jobs filtrados">
              <span><strong>{jobs.length}</strong> {contagem(jobs.length, "job", "jobs")}</span>
              <span data-tone="late"><strong>{atrasados}</strong> {contagem(atrasados, "atrasado", "atrasados")}</span>
              <span data-tone="approval"><strong>{captacoesHoje}</strong> {contagem(captacoesHoje, "captação", "captações")} hoje</span>
            </div>
          </div>
          <div className={topo.controlsRow}>
            {/* Recortes principais (§35) */}
            <div className={topo.scopes} aria-label="Recortes dos jobs">
              {ABAS.map((a) => (
                <button key={a.id} type="button" aria-pressed={aba === a.id} onClick={() => setAba(a.id)}>
                  {a.label}{aba === a.id && <span>{jobs.length}</span>}
                </button>
              ))}
            </div>

            {/* Busca e recortes secundários */}
            <div className={topo.filters}>
              <FiltrosQuadro
                busca={busca}
                onBusca={setBusca}
                placeholder="Buscar por código, título…"
                filtros={[
                  { id: "captacao", rotulo: "Data da captação", tipo: "periodo", valor: captacao, onChange: setCaptacao },
                  { id: "pessoa", rotulo: "Pessoa", valor: pessoa, onChange: setPessoa, opcoes: pessoas },
                  { id: "regiao", rotulo: "Região", valor: regiao, onChange: setRegiao, opcoes: regioes.map((r) => ({ valor: r, rotulo: r })) },
                ]}
              />
            </div>
          </div>
        </section>
      </div>

      {error && <div role="alert" className={styles.error}>Não foi possível atualizar os jobs. <button onClick={() => void mutate()}>Tentar novamente</button></div>}
      {/* Kanban com altura ancorada na viewport, como em Demandas: a barra de
          rolagem horizontal fica no rodapé. A lista rola com a página. */}
      {isLoading && todos.length === 0 ? (
        <p className="text-sm text-zinc-500 px-6 py-8">Carregando…</p>
      ) : error && !data ? null : view === "list" ? (
        <div className="flex-1 min-h-0 px-4 pb-6 overflow-y-auto">
          <section className={styles.list} aria-label="Lista de Jobs">
            {jobs.map(job => <Link key={job.id} href={`/jobs/${job.id}`}><div><small>{job.codigo}</small><strong>{job.clienteFinalNome || job.titulo}</strong>{job.clienteFinalNome && <p>{job.titulo}</p>}<span>{proximaAcao(job)}</span><p>{responsavelAtual(job).nome || responsavelAtual(job).papel}{job.cidade ? ` · ${job.cidade}` : ""}</p></div><ChevronRight size={18}/></Link>)}
            {jobs.length === 0 && <p>Nenhum job com os filtros selecionados.</p>}
          </section>
        </div>
      ) : (
        <div className="flex-1 min-h-[560px] px-4 pb-4 pt-2 overflow-hidden">
          <JobsQuadro jobs={jobs} onAbrir={abrir} />
        </div>
      )}
    </>
  )
}
