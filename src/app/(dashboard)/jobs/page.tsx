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
import { momentoDoJob } from "@/lib/ficha-do-job"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { ROTULO_DA_ETAPA, etapaDaGravacao, type EtapaDaGravacao } from "@/lib/etapas-da-gravacao"
import { pendenciasDasGravacoes, type IdDaPendencia } from "@/lib/pendencias-gravacoes"
import { cn } from "@/lib/utils"
import { foiAprovada } from "@/lib/job-fase"
import { FiltrosQuadro, lerPeriodo } from "@/components/kanban/FiltrosQuadro"
import { opcoesDePessoa, parametroDaPessoa } from "@/components/kanban/filtroPessoa"
import styles from "@/components/jobs/JobsPreview.module.css"
import topo from "@/components/demandas/BoardOverview.module.css"
import { Plus, BookOpen } from "lucide-react"
import { KitDoVideomaker } from "@/components/jobs/KitDoVideomaker"

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
//
// Só o kanban (29/10/2026: a Lista saiu do sistema e o painel à parte repetia o
// quadro). Os recortes do topo são as pendências deste fluxo — sem videomaker,
// material atrasado, falta a nota… (lib/pendencias-gravacoes.ts) — no lugar de
// Minhas, Hoje e Atrasadas, que não serviam a ele.

// As cores dos números do topo do quadro: vermelho trava, âmbar é despachar.
const COR_DO_CHIP = { urgente: "#e497ab", atencao: "#edc27b" } as const

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
  const [kitAberto, setKitAberto] = useState(false)
  const [pendencia, setPendencia] = useState<IdDaPendencia | null>(null)
  const [busca, setBusca] = useState("")
  const [pessoa, setPessoa] = useState("")
  const [regiao, setRegiao] = useState("")
  const [captacao, setCaptacao] = useState("")

  // A origem é fixa: este quadro não é o das demandas gerais.
  const params = new URLSearchParams({ area: "audiovisual", quadro: "jobs" })
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

  const base = useMemo(() => {
    // O portão: fora as que ainda esperam decisão e as recusadas. Sem isto, a
    // caixa de entrada de Aprovações vazaria para dentro do quadro de operação.
    let lista = todos.filter(foiAprovada)
    if (regiao) lista = lista.filter((j) => j.cidade === regiao)
    const { de, ate } = lerPeriodo(captacao)
    if (de || ate) lista = lista.filter((j) => {
      const dia = momentoDoJob(j)?.dia
      return !!dia && (!de || dia >= de) && (!ate || dia <= ate)
    })
    return lista
  }, [todos, regiao, captacao])

  // Os chips contam sobre o que a busca e o "Filtrar por…" deixaram; chip
  // zerado não aparece. Clicar filtra o quadro para aquelas gravações — e abre
  // o Concluído quando elas estão lá (nota e pagamento correm depois da entrega).
  const pendencias = useMemo(() => pendenciasDasGravacoes(base, hoje).filter((p) => p.itens.length > 0), [base, hoje])
  const ativa = pendencias.find((p) => p.id === pendencia) ?? null
  const jobs = useMemo(() => {
    if (!ativa) return base
    const ids = new Set(ativa.itens.map((i) => i.id))
    return base.filter((j) => ids.has(j.id))
  }, [base, ativa])
  const abrirConcluido = !!ativa && jobs.some((j) => etapaDaGravacao(j) === "concluido")

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

  return (
    <>
      {/* "+ Nova gravação" no mesmo lugar e desenho do "+ Nova Demanda" de /demandas.
          O formulário é o do pedido de gravação, com os campos de dentro. */}
      <Header
        title="Gravações Externas"
        actions={
          <div className="flex items-center gap-2">
            {/* O guia, as referências e a colinha que vão para o videomaker. */}
            <button type="button" onClick={() => setKitAberto(true)} className="flex items-center gap-1.5 text-sm border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg hover:bg-zinc-800">
              <BookOpen className="w-4 h-4" aria-hidden /> Kit do videomaker
            </button>
            <button onClick={() => setNovoJob(true)} className={actionStyles.newDemand}>
              <Plus className="w-4 h-4" /> Nova gravação
            </button>
          </div>
        }
      />

      {/* Topo numa linha só, no desenho do de Demandas (BoardOverview): os
          chips de pendência e, ao lado, a busca e o "Filtrar por…". O nome da
          página já está na barra de cima, e o quadro precisa da altura da tela. */}
      <div className="px-4 pt-1 pb-3">
        <section className={topo.overview} aria-label="Controles do quadro">
          <div className={topo.controlsRow}>
            <div className={cn(topo.scopes, "max-md:flex-nowrap! max-md:overflow-x-auto max-md:pb-1")} aria-label="Pendências das gravações">
              <button type="button" aria-label={`Todas: ${base.length}`} aria-pressed={!ativa} onClick={() => setPendencia(null)}>Todas<span>{base.length}</span></button>
              {pendencias.map((p) => (
                <button key={p.id} type="button" title={p.acao} aria-label={`${p.titulo}: ${p.itens.length}. ${p.acao}`} aria-pressed={ativa?.id === p.id}
                  onClick={() => setPendencia(ativa?.id === p.id ? null : p.id)}>
                  <i aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_DO_CHIP[p.tom] }} />
                  {p.titulo}<span style={{ color: COR_DO_CHIP[p.tom] }}>{p.itens.length}</span>
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
          rolagem horizontal fica no rodapé. */}
      {isLoading && todos.length === 0 ? (
        <p className="text-sm text-zinc-500 px-6 py-8">Carregando…</p>
      ) : error && !data ? null : (
        <div className="flex-1 min-h-[560px] px-4 pb-4 pt-2 overflow-hidden">
          <JobsQuadro jobs={jobs} onAbrir={abrir} onMover={mover} abrirConcluido={abrirConcluido} />
        </div>
      )}
      <DemandaModal demandaId={aberto} onClose={() => { setAberto(null); void mutate() }} />
      {/* Aprovado, o card aparece no quadro na hora. Pendente só depois de
          Aprovações — o aviso de onde ele está sai do próprio formulário. */}
      {kitAberto && <KitDoVideomaker aoFechar={() => setKitAberto(false)} />}
      {novoJob && (
        <FormularioGravacao interno={{ aoFechar: () => setNovoJob(false), aoCriar: () => void mutate() }} />
      )}
    </>
  )
}
