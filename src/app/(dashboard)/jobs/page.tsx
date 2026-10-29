"use client"

import { Suspense, useMemo, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Header } from "@/components/layout/Header"
import { JobsQuadro } from "@/components/jobs/JobsQuadro"
import { DemandaModal } from "@/components/demandas/DemandaModal"
import FormularioGravacao from "@/components/gravacao/FormularioGravacao"
import actionStyles from "@/components/demandas/DemandAction.module.css"
import { useMe } from "@/hooks/usePermissoes"
import { movimentoDoJob } from "@/lib/jobs-quadro"
import type { MapaPermissoes } from "@/lib/permissoes"
import type { JobDoQuadro } from "@/components/jobs/JobCard"
import { fetcher } from "@/lib/fetcher"
import { hojeEmSaoPaulo } from "@/lib/datas"
import { momentoDoJob, rotuloDoMomento } from "@/lib/ficha-do-job"
import { STATUS_PARA_COLUNA, estaAtrasada } from "@/lib/status"
import { ROTULO_DA_ETAPA, acaoDaGravacao, type EtapaDaGravacao } from "@/lib/etapas-da-gravacao"
import { foiAprovada, responsavelAtual } from "@/lib/job-fase"
import { FiltrosQuadro, lerPeriodo } from "@/components/kanban/FiltrosQuadro"
import { opcoesDePessoa, parametroDaPessoa } from "@/components/kanban/filtroPessoa"
import styles from "@/components/jobs/JobsPreview.module.css"
import topo from "@/components/demandas/BoardOverview.module.css"
import { LayoutGrid, List, ChevronRight, Plus } from "lucide-react"

// Quadro operacional de Gravações Externas (antes "Jobs"; o endereço continua
// /jobs para não quebrar link salvo).
//
// ESCOPO: gravações JÁ APROVADAS. As três responsabilidades são separadas —
// /demandas é o kanban geral do audiovisual, /aprovacoes é a caixa de entrada
// das solicitações, e este quadro é a operação do que passou pela aprovação.
//
// O que é Job vai na URL (`quadro=jobs`, regra em lib/quadro-do-card.ts):
// videomaker externo escalado, ou cobertura ainda sem videomaker. É a mesma
// regra com que /demandas pede o complemento. O portão de aprovação
// (`foiAprovada`) é aplicado aqui, sobre a lista carregada: a API só faz
// igualdade em `statusInterno`, e a regra precisa de "fora destes dois estados
// E não recusada".
//
// Consome a mesma rota do quadro atual, sem alteração nenhuma nela. Ela já
// devolve videomaker, editor, designer, responsável, datas e status; tudo o que
// o card mostra é DERIVADO disso.

type Aba = "todos" | "meus" | "hoje" | "atrasados"

const ABAS: { id: Aba; label: string }[] = [
  { id: "todos",     label: "Todas" },
  { id: "meus",      label: "Minhas" },
  { id: "hoje",      label: "Hoje" },
  { id: "atrasados", label: "Atrasadas" },
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
  const { data: me } = useMe()
  const [aberto, setAberto] = useState<string | null>(null)
  const [novoJob, setNovoJob] = useState(false)
  const [view, setView] = useState<"kanban" | "list">("kanban")
  const [aba, setAba] = useState<Aba>("todos")
  const [busca, setBusca] = useState("")
  const [pessoa, setPessoa] = useState("")
  const [regiao, setRegiao] = useState("")
  const [captacao, setCaptacao] = useState("")

  // A origem é fixa: este quadro não é o das demandas gerais.
  const params = new URLSearchParams({ area: "audiovisual", quadro: "jobs" })
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
  const hoje = hojeEmSaoPaulo()

  // As opções de região saem dos próprios jobs: sem cadastro paralelo, e a
  // lista nunca oferece um filtro que não devolveria nada. Não há filtro de
  // Tipo: o que define o Job é quem grava, não o tipo do vídeo.
  const regioes = useMemo(
    () => [...new Set(todos.map((j) => j.cidade).filter(Boolean))].sort() as string[],
    [todos]
  )

  const jobs = useMemo(() => {
    // O portão: fora as que ainda esperam decisão e as recusadas. Sem isto, a
    // caixa de entrada de Aprovações vazaria para dentro do quadro de operação.
    let lista = todos.filter(foiAprovada)
    // "Hoje" é a gravação de hoje — a pergunta é "o que acontece hoje", não
    // "o que vence hoje". Quem quer prazo usa Atrasados. O dia é o da ficha do
    // Job (captação, ou o evento do pedido público), no fuso de São Paulo.
    if (aba === "hoje") lista = lista.filter((j) => momentoDoJob(j)?.dia === hoje)
    if (regiao) lista = lista.filter((j) => j.cidade === regiao)
    const { de, ate } = lerPeriodo(captacao)
    if (de || ate) lista = lista.filter((j) => {
      const dia = momentoDoJob(j)?.dia
      return !!dia && (!de || dia >= de) && (!ate || dia <= ate)
    })
    return lista
  }, [todos, aba, regiao, captacao, hoje])

  const atrasados = jobs.filter(estaAtrasada).length

  // O card abre o Job no painel lateral, com "Ampliar", como em Demandas e no
  // Growth — o mesmo detalhe de /jobs/[id], sem sair do quadro.
  const abrir = (id: string) => setAberto(id)

  // Soltar o card numa coluna. A guarda do servidor roda antes, aqui mesmo: o
  // que ela recusaria não sai do lugar, e a frase diz por quê.
  async function mover(id: string, coluna: string) {
    const job = todos.find((j) => j.id === id)
    if (!job) return
    const ator = me ? {
      id: me.id,
      papel: me.membership?.papel ?? null,
      // /api/me devolve a permissão EFETIVA (pode vir null, e null nega).
      permissoes: (me.permissoes as unknown as MapaPermissoes | null) ?? null,
      videomakerId: me.videomakerRef?.id ?? null,
    } : null
    const m = movimentoDoJob(job, coluna, ator)
    if (!m.ok) { toast.error(m.motivo); return }
    if (!m.mudou) return
    const anterior = data
    void mutate((prev) => prev && { ...prev, demandas: prev.demandas.map((j) => j.id === id ? { ...j, statusVisivel: STATUS_PARA_COLUNA[m.statusInterno], statusInterno: m.statusInterno } : j) }, false)
    try {
      const res = await fetch(`/api/demandas/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusInterno: m.statusInterno, origem: "kanban" }),
      })
      if (!res.ok) {
        const erro = await res.json().catch(() => ({}))
        void mutate(anterior, false)
        toast.error(typeof erro.error === "string" ? erro.error : `Não foi possível mover (${res.status})`)
        return
      }
      toast.success(`Gravação movida para ${ROTULO_DA_ETAPA[coluna as EtapaDaGravacao] ?? coluna}`)
      void mutate()
    } catch {
      void mutate(anterior, false)
      toast.error("Sem conexão. A gravação voltou para onde estava.")
    }
  }

  const pessoas = opcoesDePessoa([
    ...vms.map((v) => ({ papel: "vm" as const, id: v.id, nome: v.nome, funcao: "Videomaker" })),
    ...editores.map((e) => ({ papel: "ed" as const, id: e.id, nome: e.nome, funcao: "Editor" })),
  ])

  const captacoesHoje = jobs.filter((j) => momentoDoJob(j)?.dia === hoje).length
  // Na lista: quando é e quem vai, as duas perguntas do dia da gravação.
  const quandoEQuem = (j: JobDoQuadro) => {
    const m = momentoDoJob(j)
    return [m ? rotuloDoMomento(m) : "Sem data", j.videomaker?.nome ?? "sem videomaker"].join(" · ")
  }
  const contagem = (n: number, um: string, varios: string) => (n === 1 ? um : varios)

  return (
    <>
      {/* "+ Nova gravação" no mesmo lugar e desenho do "+ Nova Demanda" de /demandas.
          O formulário é o do pedido de gravação, com os campos de dentro. */}
      <Header
        title="Gravações Externas"
        actions={
          <button onClick={() => setNovoJob(true)} className={actionStyles.newDemand}>
            <Plus className="w-4 h-4" /> Nova gravação
          </button>
        }
      />

      {/* Topo do quadro no mesmo desenho do de Demandas (BarraVisao): duas
          linhas — visão e números; recortes e filtros. O nome da página já
          está na barra de cima, e o quadro precisa da altura da tela. */}
      <div className="px-4 pt-1 pb-3">
        <section className={topo.overview} aria-label="Controles do quadro">
          <div className={topo.topRow}>
            <div className={topo.tabs} aria-label="Visualização das gravações">
              <button type="button" aria-label="Ver como kanban" aria-pressed={view === "kanban"} onClick={() => setView("kanban")}><LayoutGrid size={16} />Kanban</button>
              <button type="button" aria-label="Ver como lista" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={16} />Lista</button>
            </div>
            <div className={topo.counts} aria-label="Resumo das gravações filtradas">
              <span><strong>{jobs.length}</strong> {contagem(jobs.length, "gravação", "gravações")}</span>
              <span data-tone="late"><strong>{atrasados}</strong> {contagem(atrasados, "atrasada", "atrasadas")}</span>
              <span data-tone="approval"><strong>{captacoesHoje}</strong> {contagem(captacoesHoje, "gravação", "gravações")} hoje</span>
            </div>
          </div>
          <div className={topo.controlsRow}>
            {/* Recortes principais (§35) */}
            <div className={topo.scopes} aria-label="Recortes das gravações">
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
                  { id: "captacao", rotulo: "Data da gravação", tipo: "periodo", valor: captacao, onChange: setCaptacao },
                  { id: "pessoa", rotulo: "Pessoa", valor: pessoa, onChange: setPessoa, opcoes: pessoas },
                  { id: "regiao", rotulo: "Região", valor: regiao, onChange: setRegiao, opcoes: regioes.map((r) => ({ valor: r, rotulo: r })) },
                ]}
              />
            </div>
          </div>
        </section>
      </div>

      {error && <div role="alert" className={styles.error}>Não foi possível atualizar as gravações. <button onClick={() => void mutate()}>Tentar novamente</button></div>}
      {/* Kanban com altura ancorada na viewport, como em Demandas: a barra de
          rolagem horizontal fica no rodapé. A lista rola com a página. */}
      {isLoading && todos.length === 0 ? (
        <p className="text-sm text-zinc-500 px-6 py-8">Carregando…</p>
      ) : error && !data ? null : view === "list" ? (
        <div className="flex-1 min-h-0 px-4 pb-6 overflow-y-auto">
          <section className={styles.list} aria-label="Lista de gravações">
            {jobs.map(job => <a key={job.id} href={`/jobs/${job.id}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); abrir(job.id) }}><div><small>{job.codigo}</small><strong>{job.clienteFinalNome || job.titulo}</strong>{job.clienteFinalNome && <p>{job.titulo}</p>}<p>{quandoEQuem(job)}</p><span>{acaoDaGravacao(job, hoje)}</span><p>{responsavelAtual(job).nome || responsavelAtual(job).papel}{job.cidade ? ` · ${job.cidade}` : ""}</p></div><ChevronRight size={18}/></a>)}
            {jobs.length === 0 && <p>Nenhuma gravação com os filtros selecionados.</p>}
          </section>
        </div>
      ) : (
        <div className="flex-1 min-h-[560px] px-4 pb-4 pt-2 overflow-hidden">
          <JobsQuadro jobs={jobs} onAbrir={abrir} onMover={mover} />
        </div>
      )}
      <DemandaModal demandaId={aberto} onClose={() => { setAberto(null); void mutate() }} />
      {/* Aprovado, o card aparece no quadro na hora. Pendente só depois de
          Aprovações — o aviso de onde ele está sai do próprio formulário. */}
      {novoJob && (
        <FormularioGravacao interno={{ aoFechar: () => setNovoJob(false), aoCriar: () => void mutate() }} />
      )}
    </>
  )
}
