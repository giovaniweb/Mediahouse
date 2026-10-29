"use client"

import { useMemo } from "react"
import { AlertTriangle, CalendarClock, CalendarPlus, Send, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { hojeEmSaoPaulo } from "@/lib/datas"
import { distanciaDoMomento, rotuloDoMomento } from "@/lib/ficha-do-job"
import { painelDasGravacoes, type GravacaoDoPainel, type Proxima } from "@/lib/painel-gravacoes"
import styles from "@/components/dashboard/DashboardPreview.module.css"

// O painel das Gravações Externas, no desenho do Dashboard (números no alto,
// onde está o trabalho, e o que pede ação). As contas estão em
// lib/painel-gravacoes.ts e correm sobre a lista do quadro, com os filtros dele.

const SITUACAO: Record<Proxima["situacao"], { texto: string; estado?: "sobrecarga" | "atencao" }> = {
  sem_videomaker: { texto: "Sem videomaker", estado: "sobrecarga" },
  a_confirmar: { texto: "A confirmar", estado: "atencao" },
  agendada: { texto: "Confirmada" },
}

// As cores do Dashboard, com o verde no fim: concluído é o que deu certo.
const COR_DA_ETAPA: Record<string, string> = {
  a_agendar: "#8f9bff", agendado: "#7cc4f3", em_edicao: "#f3c57c", para_enviar: "#b39aff", concluido: "#77dab8",
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function PainelDasGravacoes({ gravacoes, carregando, onAbrir, onVerQuadro }: {
  gravacoes: GravacaoDoPainel[]
  carregando: boolean
  onAbrir: (id: string) => void
  onVerQuadro: () => void
}) {
  const hoje = hojeEmSaoPaulo()
  const p = useMemo(() => painelDasGravacoes(gravacoes, hoje), [gravacoes, hoje])
  const v = (n: number) => (carregando ? "—" : n)
  const max = Math.max(1, ...p.etapas.map((e) => e.demandas))

  // O card abre no painel lateral, como no quadro; Ctrl/Cmd+clique abre a página.
  const abrir = (id: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    onAbrir(id)
  }

  const metricas: { label: string; n: number; help: string; Icon: LucideIcon; color: string }[] = [
    { label: "A agendar", n: p.numeros.aAgendar, help: "Ninguém confirmou ainda", Icon: CalendarPlus, color: "#b39aff" },
    { label: "Próximos 7 dias", n: p.numeros.proximos, help: "Gravações de hoje a 7 dias", Icon: CalendarClock, color: "#7cc4f3" },
    { label: "Falta o material", n: p.numeros.faltaMaterial, help: "Gravou e não entregou", Icon: AlertTriangle, color: "#ff9baf" },
    { label: "Para enviar ao cliente", n: p.numeros.paraEnviar, help: "Pronto, falta mandar", Icon: Send, color: "#77dab8" },
  ]

  return <div className={cn(styles.dashboard, "px-4! pt-2! bg-transparent!")} aria-busy={carregando}>
    <div className={styles.metrics}>
      {metricas.map(({ label, n, help, Icon, color }) => <button key={label} type="button" onClick={onVerQuadro} className={cn(styles.metric, "text-left")}>
        <div><span>{label}</span><Icon size={19} style={{ color }} aria-hidden /></div>
        <strong>{v(n)}</strong><small>{help}</small>
      </button>)}
    </div>

    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="painel-etapas">
        <div className={styles.panelHeading}><div><h2 id="painel-etapas">Onde estão as gravações</h2><p>Gravações por etapa do quadro · agora</p></div>
          <button type="button" onClick={onVerQuadro} className="text-xs text-[#c8b1ff] whitespace-nowrap">Ver quadro ↗</button></div>
        <div className={styles.chart}>
          {p.etapas.map((e) => <div key={e.id} className={styles.chartRow}>
            <span>{e.label}</span><div className={styles.track} aria-hidden="true"><i style={{ width: `${e.demandas / max * 100}%`, background: COR_DA_ETAPA[e.id] }} /></div><strong>{v(e.demandas)}</strong>
          </div>)}
        </div>
        <p className={styles.note}>Concluído conta só o que foi enviado ao cliente neste mês.</p>
      </section>

      <section className={styles.panel} aria-labelledby="painel-travas">
        <div className={styles.panelHeading}><div><h2 id="painel-travas">O que travou</h2><p>Sem videomaker perto da data, material atrasado, nota a refazer</p></div></div>
        <div className={styles.team}>
          {!carregando && p.travas.length === 0 && <p className={styles.muted}>Nada travado.</p>}
          {p.travas.map((t) => <a key={t.id} href={`/jobs/${t.id}`} onClick={abrir(t.id)} className={styles.alerta}>
            <div><strong>{t.cliente}</strong><small>{t.codigo}</small></div>
            <span className={styles.badge} data-state={t.tom}>{t.motivo}</span>
          </a>)}
        </div>
      </section>
    </div>

    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="painel-proximas">
        <div className={styles.panelHeading}><div><h2 id="painel-proximas">Próximos 7 dias</h2><p>Quando, onde e quem vai</p></div></div>
        <div className={styles.team}>
          {!carregando && p.proximas.length === 0 && <p className={styles.muted}>Nenhuma gravação nos próximos 7 dias.</p>}
          {p.proximas.map((x) => {
            const s = SITUACAO[x.situacao]
            return <a key={x.id} href={`/jobs/${x.id}`} onClick={abrir(x.id)} className={styles.alerta}>
              <div><strong>{x.cliente}</strong><small>{rotuloDoMomento(x.momento)} ({distanciaDoMomento(x.momento, hoje)}){x.tipo ? ` · ${x.tipo}` : ""}{x.videomaker ? ` · ${x.videomaker}` : ""}</small></div>
              <span className={styles.badge} data-state={s.estado}>{s.texto}</span>
            </a>
          })}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="painel-mes">
        <div className={styles.panelHeading}><div><h2 id="painel-mes">No mês</h2><p>{carregando ? "…" : plural(p.mes.total, "gravação", "gravações")} com videomaker confirmado</p></div></div>
        <div className={styles.team}>
          {!carregando && p.mes.porVideomaker.length === 0 && <p className={styles.muted}>Nenhuma gravação neste mês ainda.</p>}
          {p.mes.porVideomaker.map((vm) => <div key={vm.id} className={styles.person}>
            <span className={styles.avatar} aria-hidden="true">{vm.nome.slice(0, 1)}</span>
            <div><strong>{vm.nome}</strong><small>{plural(vm.gravacoes, "gravação", "gravações")}</small></div>
          </div>)}
        </div>
        {p.mes.porTipo.length > 0 && <p className={styles.note}>{p.mes.porTipo.map((t) => `${t.label}: ${t.demandas}`).join(" · ")}</p>}
      </section>
    </div>

    {/* Só para quem vê nota do videomaker: sem a permissão, a lista nem traz custos. */}
    {p.notas && <section className={styles.panel} aria-labelledby="painel-notas">
      <div className={styles.panelHeading}><div><h2 id="painel-notas">Nota e pagamento</h2><p>Gravações com material entregue e pagamento ainda não feito</p></div></div>
      <div className={styles.distribution}>
        <div><span>Falta a nota</span><strong>{v(p.notas.falta)}</strong><small>O videomaker ainda não mandou</small></div>
        <div><span>Nota recebida</span><strong>{v(p.notas.recebida)}</strong><small>Falta enviar para compras</small></div>
        <div><span>Em compras</span><strong>{v(p.notas.compras)}</strong><small>Esperando o pagamento</small></div>
      </div>
      {p.notas.contestada > 0 && <p className={styles.note}>{plural(p.notas.contestada, "nota a refazer", "notas a refazer")}: aparece em O que travou.</p>}
    </section>}
  </div>
}
