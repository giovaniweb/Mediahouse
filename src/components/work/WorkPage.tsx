"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ChevronRight, RefreshCw } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { fetcher } from "@/lib/fetcher"
import { estaAtrasada } from "@/lib/status"
import { proximaAcao, type JobParaLeitura } from "@/lib/job-fase"
import styles from "./work.module.css"

type Trabalho = JobParaLeitura & { id: string; titulo: string; codigo: string; area: string; statusVisivel: string; dataLimite?: string | null }
const etapas: Record<string,string> = {entrada:"Entrada",producao:"Produção",edicao:"Edição",aprovacao:"Aprovação",para_postar:"Para postar",finalizado:"Concluído"}
function acao(d: Trabalho) {
  if (d.area === "design") {
    if (["editando","fila_edicao","editor_atribuido"].includes(d.statusInterno)) return "Preparar criativo para revisão"
    if (d.statusInterno === "videomaker_notificado") return "Aguardar aceite do responsável"
  }
  return proximaAcao(d)
}
export function WorkPage({ today = false }: { today?: boolean }) {
  const [agora, setAgora] = useState<number | null>(null)
  useEffect(() => {
    setAgora(Date.now())
    const timer = setInterval(() => setAgora(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])
  const agenda = useSWR<{eventos: {id:string;titulo:string;inicio:string;fim:string;status:string;diaTodo:boolean;local?:string|null}[]}>(today ? "/api/agenda" : null, fetcher, {refreshInterval:60000})
  const proximos = (agenda.data?.eventos ?? []).filter(e => !["cancelado","concluido"].includes(e.status) && agora !== null && new Date(e.fim).getTime() >= agora && new Date(e.inicio).getTime() <= agora + 7*86400000).slice(0,3)
  const [filtro,setFiltro] = useState<"minhas"|"todas"|"atrasadas">("minhas")
  const {data,error,isLoading,mutate} = useSWR<{demandas:Trabalho[]}>(`/api/demandas${filtro === "todas" ? "" : "?mine=1"}`,fetcher, {refreshInterval:60000})
  const trabalhos = useMemo(() => (data?.demandas ?? []).filter(d => d.statusVisivel !== "finalizado" && !["encerrado","expirado"].includes(d.statusInterno) && (filtro !== "atrasadas" || estaAtrasada(d))).sort((a,b) => (a.dataLimite ? new Date(a.dataLimite).getTime() : Infinity) - (b.dataLimite ? new Date(b.dataLimite).getTime() : Infinity)),[data,filtro])
  return <><Header title={today ? "Workspace / Hoje" : "Workspace / Meu trabalho"}/><main className={styles.page}>
    <p className={styles.eyebrow}>SEU ESPAÇO DE TRABALHO</p><h1>{today ? "Hoje, um passo de cada vez." : "Meu trabalho"}</h1><p className={styles.subtitle}>{today ? "O que pede sua atenção e os próximos compromissos." : "Próximos passos e prazos dos trabalhos em andamento."}</p>
    {!today && <nav className={styles.filters} aria-label="Filtrar trabalhos">{([['minhas','Minhas'],['todas','Todas'],['atrasadas','Atrasadas']] as const).map(([id,label])=><button key={id} aria-pressed={filtro===id} onClick={()=>setFiltro(id)}>{label}</button>)}</nav>}
    <p className={styles.hint}>{filtro === "todas" ? "Trabalhos que seu perfil tem permissão para acompanhar." : "Trabalhos ligados a você como solicitante, responsável ou integrante da execução."}</p>
    <section className={styles.panel} aria-label="Trabalhos em andamento" aria-busy={isLoading}>
      {today && <h2 className={styles.sectionTitle}>Seu próximo passo</h2>}
      {isLoading ? <p role="status">Carregando seus trabalhos…</p> : error ? <div role="alert"><p>Não foi possível carregar os trabalhos.</p><button className={styles.retry} onClick={()=>mutate()}><RefreshCw size={16}/>Tentar novamente</button></div> : trabalhos.length === 0 ? <div className={styles.empty}><h2>{filtro === "atrasadas" ? "Nenhum prazo atrasado nesta lista." : "Nenhum trabalho em andamento nesta lista."}</h2><p>Novos trabalhos aparecerão aqui conforme forem registrados e vinculados.</p></div> : (today ? trabalhos.slice(0,3) : trabalhos).map(d=><Link className={styles.row} key={d.id} href={`/demandas/${d.id}`}>
        <div><h2>{d.titulo}</h2><p className={styles.action}>{acao(d)}</p><p className={styles.meta}>{d.area === "design" ? "Growth" : "Audiovisual"} · {d.codigo} · {d.dataLimite ? new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",timeZone:"America/Sao_Paulo"}).format(new Date(d.dataLimite)) : "Sem prazo"}{estaAtrasada(d) && <span className={styles.late}> · Prazo vencido</span>}</p></div>
        <span className={styles.stage} data-stage={d.statusVisivel}>{etapas[d.statusVisivel] ?? d.statusVisivel}</span><ChevronRight size={18} aria-hidden="true"/>
      </Link>)}
      {today && <Link className={styles.more} href="/meu-trabalho">Ver meu trabalho →</Link>}
    </section>
    {today && <section className={styles.panel} aria-label="Próximos compromissos">
      <h2 className={styles.sectionTitle}>Próximos compromissos</h2><p className={styles.hint}>Até os próximos 7 dias · agenda disponível para seu perfil · horário de Brasília.</p>
      {agenda.isLoading || agora === null ? <p role="status">Carregando agenda…</p> : agenda.error ? <div role="alert"><p>Não foi possível carregar a agenda.</p><button className={styles.retry} onClick={()=>agenda.mutate()}>Tentar novamente</button></div> : proximos.length === 0 ? <p className={styles.hint}>Nenhum compromisso neste período.</p> : proximos.map(e => <Link key={e.id} href="/agenda" className={styles.row}><div><h3>{e.titulo}</h3><p className={styles.meta}>{new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",...(e.diaTodo ? {} : {hour:"2-digit",minute:"2-digit"}),timeZone:"America/Sao_Paulo"}).format(new Date(e.inicio))}{e.diaTodo && " · Dia todo"}{e.local && ` · ${e.local}`}</p></div><ChevronRight size={18} aria-hidden="true"/></Link>)}
      <Link href="/agenda" className={styles.more}>Abrir agenda →</Link>
    </section>}
  </main></>
}
