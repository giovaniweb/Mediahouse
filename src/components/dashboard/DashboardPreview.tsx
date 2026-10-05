"use client"

import type { ComponentProps, ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight, Film, Clock, AlertTriangle, CheckCircle2 } from "lucide-react"
import { HojeEmFoco } from "./HojeEmFoco"
import { AlertasIA } from "./AlertasIA"
import { FluxoEtapas } from "./FluxoEtapas"
import type { GargaloEtapa } from "@/lib/gargalos"
import styles from "./DashboardPreview.module.css"

type Metrics = {
  emEdicao?: number; urgentesHoje?: number; prazoCritico?: number; concluidasMes?: number;
  aguardandoAprovacao?: number; paraPostar?: number;
}
type Data = {
  metricas?: Metrics;
  alertasAtivos?: ComponentProps<typeof AlertasIA>["alertas"];
  cargaEditores?: { id: string; nome: string; cargaAtual: number; cargaLimite: number; status: string }[];
  // Onde as demandas esperam (PR #86): uma linha por etapa ativa, com dias médios.
  gargalos?: GargaloEtapa[];
  operacional?: { noPrazoPercentual: number | null; tempoMedioDias: number | null } | null;
}
type Distribution = { count?: number; percent?: number }
type Props = {
  data?: Data; loading: boolean;
  /** Escolha de departamento (Audiovisual / Growth / Social Media), no cabeçalho. */
  seletor?: ReactNode;
  b2c?: { b2c?: Distribution; b2b?: Distribution; sem_classificacao?: Distribution; alerta?: boolean; meta?: { b2c_target?: number } };
  ideias?: { totalIdeias: number; novas: number; emAnalise: number; realizadas: number; taxaConversao: number; ideiasEsteMes: number };
}

export function DashboardPreview({ data, loading, b2c, ideias, seletor }: Props) {
  const classifications = [{label:"B2C", data:b2c?.b2c}, {label:"B2B", data:b2c?.b2b}, {label:"Sem classificação", data:b2c?.sem_classificacao}]
  const m = data?.metricas
  const value = (n: number | undefined) => loading || n == null ? "—" : n
  const steps = [
    { name: "Em edição", value: m?.emEdicao, href: "/demandas?statusVisivel=edicao", color: "#b39aff" },
    { name: "Em aprovação", value: m?.aguardandoAprovacao, href: "/demandas?statusVisivel=aprovacao", color: "#f3c57c" },
    { name: "Para postar", value: m?.paraPostar, href: "/demandas?statusVisivel=para_postar", color: "#77dab8" },
  ]
  const max = Math.max(1, ...steps.map(s => s.value ?? 0))
  const metrics = [
    { label: "Em edição", n: m?.emEdicao, help: "Demandas nesta etapa", href: steps[0].href, Icon: Film, color: "#b39aff" },
    { label: "Urgentes", n: m?.urgentesHoje, help: "Prioridade urgente · em aberto", href: "/demandas?prioridade=urgente", Icon: AlertTriangle, color: "#ff9baf" },
    { label: "Atrasadas", n: m?.prazoCritico, help: "Prazo vencido · antes da aprovação", href: "/demandas?atrasadas=1", Icon: Clock, color: "#f3c57c" },
    { label: "Vídeos entregues", n: m?.concluidasMes, help: "Mês atual · arquivos finais e links", href: "/galeria", Icon: CheckCircle2, color: "#77dab8" },
  ]
  return <main className={styles.dashboard} aria-busy={loading}>
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>VISÃO DA OPERAÇÃO · AUDIOVISUAL</p><h1>Sua operação, em perspectiva.</h1><p>Entregas, prazos e capacidade para decidir o próximo passo.</p>{seletor}</div>
      <Link className={styles.action} href="/demandas/nova">Nova demanda <ArrowUpRight size={16} /></Link>
    </div>
    {loading && <p role="status" className={styles.muted}>Carregando indicadores…</p>}
    <div className={styles.metrics}>
      {metrics.map(({label,n,help,href,Icon,color}) => <Link key={label} href={href} className={styles.metric}>
        <div><span>{label}</span><Icon size={19} style={{color}} /></div>
        <strong>{value(n)}</strong><small>{help}</small>
      </Link>)}
    </div>
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="flow-title">
        <div className={styles.panelHeading}><div><h2 id="flow-title">Onde estão as entregas</h2><p>Demandas por etapa · situação atual</p></div><Link href="/demandas">Ver quadro ↗</Link></div>
        <div className={styles.chart}>
          {steps.map(step => <Link key={step.name} href={step.href} className={styles.chartRow}>
            <span>{step.name}</span><div className={styles.track} aria-hidden="true"><i style={{width:`${(step.value ?? 0) / max * 100}%`,background:step.color}} /></div><strong>{value(step.value)}</strong>
          </Link>)}
        </div>
        <p className={styles.note}>Este recorte mostra edição, aprovação e postagem. Não representa todas as demandas abertas.</p>
      </section>
      <section className={styles.panel} aria-labelledby="team-title">
        <div className={styles.panelHeading}><div><h2 id="team-title">Carga da equipe</h2><p>Editores ativos nesta empresa</p></div><Link href="/equipe">Ver equipe ↗</Link></div>
        <div className={styles.team}>
          {!loading && !data?.cargaEditores?.length && <p className={styles.muted}>Nenhum editor cadastrado.</p>}
          {data?.cargaEditores?.map(editor => <Link key={editor.id} href={`/equipe/${editor.id}`} className={styles.person}>
            <span className={styles.avatar} aria-hidden="true">{editor.nome.slice(0,1)}</span>
            <div><strong>{editor.nome}</strong><small>{editor.cargaAtual} demanda(s) em aberto</small></div>
            <span className={styles.badge} data-state={editor.status}>{editor.status === "sobrecarga" ? "Sobrecarga" : editor.status === "atencao" ? "Atenção" : "Dentro do limite"}</span>
          </Link>)}
        </div>
        <p className={styles.note}>O alerta considera o peso dos trabalhos e o limite de carga cadastrado.</p>
      </section>
    </div>
    {/* Complementa "Onde estão as entregas": aqui é há quanto tempo cada etapa segura as demandas. */}
    <FluxoEtapas gargalos={data?.gargalos ?? []} operacional={data?.operacional} isLoading={loading} />
    <section className={styles.panel} aria-labelledby="decisions-title">
      <div className={styles.panelHeading}><div><h2 id="decisions-title">Decisões de hoje</h2><p>Atalhos para o trabalho que precisa avançar</p></div></div>
      <div className={styles.decisions}>
        <Link href="/demandas?statusVisivel=aprovacao"><div><h3>Revisar entregas</h3><p>{value(m?.aguardandoAprovacao)} demandas em aprovação</p></div><ArrowUpRight size={18} /></Link>
        <Link href="/demandas?atrasadas=1"><div><h3>Retomar prazos vencidos</h3><p>{value(m?.prazoCritico)} demandas atrasadas</p></div><ArrowUpRight size={18} /></Link>
        <Link href="/equipe"><div><h3>Revisar distribuição da equipe</h3><p>{loading ? "Carregando capacidade…" : `${data?.cargaEditores?.filter(editor => editor.status === "sobrecarga").length ?? 0} editores com sobrecarga`}</p></div><ArrowUpRight size={18} /></Link>
      </div>
    </section>
    <div className={styles.focus}><HojeEmFoco /></div>
    <div className={styles.alerts}><AlertasIA alertas={data?.alertasAtivos ?? []} isLoading={loading} /></div>
    {(b2c || ideias) && <div className={styles.columns}>
      {b2c && <section className={styles.panel}><div className={styles.panelHeading}><div><h2>Classificação das entregas</h2><p>Distribuição B2C / B2B</p></div></div>
        {b2c.alerta && <p className={styles.warning}>B2C abaixo da meta de {b2c.meta?.b2c_target ?? 70}%.</p>}
        <div className={styles.distribution}>{classifications.map(({label, data:d}) => {
          return <div key={label}><span>{label}</span><strong>{d?.percent == null ? "—" : `${d.percent}%`}</strong><small>{d?.count ?? "—"} vídeos</small></div>
        })}</div>
      </section>}
      {ideias && <section className={styles.panel}><div className={styles.panelHeading}><div><h2>Ideias que viram trabalho</h2><p>Banco de ideias</p></div><Link href="/ideias">Ver ideias ↗</Link></div><div className={styles.distribution}>
        <div><span>Pendentes</span><strong>{ideias.novas + ideias.emAnalise}</strong></div><div><span>Realizadas</span><strong>{ideias.realizadas}</strong><small>de {ideias.totalIdeias} ideias</small></div><div><span>Conversão</span><strong>{ideias.taxaConversao}%</strong></div>
      </div></section>}
    </div>}
  </main>
}
