"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight, AlertTriangle, Clock, CheckCircle2, Hourglass, Sparkles, Eye, Users } from "lucide-react"
import { FluxoEtapas } from "./FluxoEtapas"
import type { GargaloEtapa } from "@/lib/gargalos"
import { NOME_DEPARTAMENTO, DIAS_PARADO, type Contagem, type Departamento, type PedidoEmAlerta, type PessoaComCarga } from "@/lib/painel-departamento"
import styles from "./DashboardPreview.module.css"

// Painéis de Growth e Social Media no mesmo desenho do Audiovisual
// (DashboardPreview): números no alto, onde está o trabalho, e a coluna da
// direita com o que pede ação. Cada um com as palavras do seu quadro.

export function SeletorDepartamento({ opcoes, valor, onChange }: {
  opcoes: Departamento[]
  valor: Departamento
  onChange: (d: Departamento) => void
}) {
  // Com um departamento só, não há o que escolher.
  if (opcoes.length < 2) return null
  return <div className={styles.departamentos} role="group" aria-label="Departamento">
    {opcoes.map(d => <button key={d} type="button" aria-pressed={d === valor} onClick={() => onChange(d)}>{NOME_DEPARTAMENTO[d]}</button>)}
  </div>
}

const n = (loading: boolean, v: number | undefined) => (loading || v == null ? "—" : v)
const dias = (d: number | null) => (d === null ? "" : ` há ${d} ${d === 1 ? "dia" : "dias"}`)

function Cabecalho({ departamento, titulo, texto, seletor, acao }: { departamento: Departamento; titulo: string; texto: string; seletor: ReactNode; acao: { href: string; rotulo: string } }) {
  return <div className={styles.heading}>
    <div><p className={styles.eyebrow}>VISÃO DA OPERAÇÃO · {NOME_DEPARTAMENTO[departamento].toUpperCase()}</p><h1>{titulo}</h1><p>{texto}</p>{seletor}</div>
    <Link className={styles.action} href={acao.href}>{acao.rotulo} <ArrowUpRight size={16} /></Link>
  </div>
}

type Metrica = { label: string; n: number | undefined; help: string; href: string; Icon: typeof Clock; color: string }

function Metricas({ itens, loading }: { itens: Metrica[]; loading: boolean }) {
  return <div className={styles.metrics}>
    {itens.map(({ label, n: v, help, href, Icon, color }) => <Link key={label} href={href} className={styles.metric}>
      <div><span>{label}</span><Icon size={19} style={{ color }} /></div>
      <strong>{n(loading, v)}</strong><small>{help}</small>
    </Link>)}
  </div>
}

const CORES = ["#8f93a8", "#7cc4f3", "#8f9bff", "#b39aff", "#f3c57c", "#77dab8", "#ff9baf"]

function OndeEsta({ titulo, subtitulo, linhas, href, loading, nota }: { titulo: string; subtitulo: string; linhas: Contagem[]; href: (id: string) => string; loading: boolean; nota?: string }) {
  const max = Math.max(1, ...linhas.map(l => l.demandas))
  return <section className={styles.panel} aria-labelledby="onde-titulo">
    <div className={styles.panelHeading}><div><h2 id="onde-titulo">{titulo}</h2><p>{subtitulo}</p></div><Link href={href("")}>Ver quadro ↗</Link></div>
    <div className={styles.chart}>
      {linhas.map((l, i) => <Link key={l.id} href={href(l.id)} className={styles.chartRow}>
        <span>{l.label}</span><div className={styles.track} aria-hidden="true"><i style={{ width: `${l.demandas / max * 100}%`, background: CORES[i % CORES.length] }} /></div><strong>{n(loading, l.demandas)}</strong>
      </Link>)}
    </div>
    {nota && <p className={styles.note}>{nota}</p>}
  </section>
}

// ── Growth ──────────────────────────────────────────────────────────────────

export type DadosGrowth = {
  growth?: { colunas: Contagem[]; ativas: number; urgentes: number; atrasadas: number; paraAprovar: number; pessoas: PessoaComCarga[]; semResponsavel: number }
  operacional?: { entregaveis?: number; noPrazoPercentual: number | null; tempoMedioDias: number | null } | null
  gargalos?: GargaloEtapa[]
}

export function DashboardGrowth({ data, loading, seletor }: { data?: DadosGrowth; loading: boolean; seletor: ReactNode }) {
  const g = data?.growth
  return <main className={styles.dashboard} aria-busy={loading}>
    <Cabecalho departamento="growth" titulo="Seus conteúdos, em perspectiva." texto="Onde cada peça está, o que venceu e quem está com o quê." seletor={seletor} acao={{ href: "/design", rotulo: "Abrir quadro" }} />
    {loading && <p role="status" className={styles.muted}>Carregando indicadores…</p>}
    <Metricas loading={loading} itens={[
      { label: "Em aberto", n: g?.ativas, help: "Do backlog ao programado", href: "/design", Icon: Sparkles, color: "#b39aff" },
      { label: "Para aprovação", n: g?.paraAprovar, help: "Esperando o ok de alguém", href: "/aprovacoes/growth", Icon: Eye, color: "#f3c57c" },
      { label: "Atrasadas", n: g?.atrasadas, help: "Prazo vencido · antes da aprovação", href: "/design?atrasadas=1", Icon: Clock, color: "#ff9baf" },
      { label: "Entregues no mês", n: data?.operacional?.entregaveis, help: "Mês atual · finalizadas", href: "/historico/growth", Icon: CheckCircle2, color: "#77dab8" },
    ]} />
    <div className={styles.columns}>
      <OndeEsta titulo="Onde estão os conteúdos" subtitulo="Peças por coluna do quadro · agora" linhas={g?.colunas ?? []} href={() => "/design"} loading={loading} />
      <section className={styles.panel} aria-labelledby="pessoas-titulo">
        <div className={styles.panelHeading}><div><h2 id="pessoas-titulo">Quem está com o quê</h2><p>Responsáveis com peças em aberto</p></div><Link href="/growth/equipe">Ver equipe ↗</Link></div>
        <div className={styles.team}>
          {!loading && !g?.pessoas.length && <p className={styles.muted}>Ninguém assumiu uma peça ainda.</p>}
          {g?.pessoas.map(p => <div key={p.id} className={styles.person}>
            <span className={styles.avatar} aria-hidden="true">{p.nome.slice(0, 1)}</span>
            <div><strong>{p.nome}</strong><small>{p.abertas} {p.abertas === 1 ? "peça" : "peças"} em aberto</small></div>
          </div>)}
        </div>
        {!!g?.semResponsavel && <p className={styles.note}>{g.semResponsavel} {g.semResponsavel === 1 ? "peça ainda sem responsável" : "peças ainda sem responsável"}.</p>}
      </section>
    </div>
    <FluxoEtapas gargalos={data?.gargalos ?? []} operacional={data?.operacional} isLoading={loading} hrefEtapa={() => "/design"} />
  </main>
}

// ── Social Media ────────────────────────────────────────────────────────────

export type DadosSocial = {
  social?: { etapas: Contagem[]; comEquipe: number; atrasados: PedidoEmAlerta[]; parados: PedidoEmAlerta[] }
}

export function DashboardSocial({ data, loading, seletor }: { data?: DadosSocial; loading: boolean; seletor: ReactNode }) {
  const s = data?.social
  const revisar = s?.etapas.find(e => e.id === "revisar")?.demandas
  // Um pedido atrasado E parado aparece uma vez, como atrasado: é o mais grave.
  const atrasados = new Set(s?.atrasados.map(p => p.id))
  const alertas = [
    ...(s?.atrasados ?? []).map(p => ({ ...p, tipo: "atrasado" as const })),
    ...(s?.parados ?? []).filter(p => !atrasados.has(p.id)).map(p => ({ ...p, tipo: "parado" as const })),
  ]
  return <main className={styles.dashboard} aria-busy={loading}>
    <Cabecalho departamento="social" titulo="Seus pedidos, em perspectiva." texto="O que a equipe está fazendo para as suas postagens, e o que precisa de cobrança." seletor={seletor} acao={{ href: "/social", rotulo: "Abrir planejamento" }} />
    {loading && <p role="status" className={styles.muted}>Carregando indicadores…</p>}
    <Metricas loading={loading} itens={[
      { label: "Com a equipe", n: s?.comEquipe, help: "Recebidos, produzindo ou para revisar", href: "/social", Icon: Users, color: "#b39aff" },
      { label: "Para revisar", n: revisar, help: "A equipe entregou, falta o seu ok", href: "/social", Icon: Eye, color: "#f3c57c" },
      { label: "Atrasados", n: s?.atrasados.length, help: "Prazo vencido · antes da revisão", href: "/social", Icon: AlertTriangle, color: "#ff9baf" },
      { label: "Parados", n: s?.parados.length, help: `Sem mudança há ${DIAS_PARADO} dias ou mais`, href: "/social", Icon: Hourglass, color: "#8f9bff" },
    ]} />
    <div className={styles.columns}>
      <OndeEsta titulo="Onde estão os pedidos" subtitulo="Pedidos da social por etapa · agora" linhas={s?.etapas ?? []} href={() => "/social"} loading={loading}
        nota="Pronto é o que foi entregue e ainda não foi postado." />
      <section className={styles.panel} aria-labelledby="cobrar-titulo">
        <div className={styles.panelHeading}><div><h2 id="cobrar-titulo">Atrasados e parados</h2><p>O que vale cobrar hoje</p></div><Link href="/social">Ver planejamento ↗</Link></div>
        <div className={styles.team}>
          {!loading && alertas.length === 0 && <p className={styles.muted}>Nenhum pedido atrasado ou parado.</p>}
          {alertas.map(p => <Link key={p.id} href={`/demandas/${p.id}`} className={styles.alerta}>
            <div><strong>{p.titulo}</strong><small>{p.codigo}{p.linha ? ` · ${p.linha}` : ""} · {p.etapa}</small></div>
            <span className={styles.badge} data-state={p.tipo === "atrasado" ? "sobrecarga" : "atencao"}>{p.tipo === "atrasado" ? `Atrasado${dias(p.dias)}` : `Parado${dias(p.dias)}`}</span>
          </Link>)}
        </div>
      </section>
    </div>
  </main>
}
