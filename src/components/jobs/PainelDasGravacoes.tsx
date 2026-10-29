"use client"

import { useMemo } from "react"
import {
  AlertTriangle, CheckCircle2, Clock, FileWarning, Hourglass, Inbox, RotateCcw, Send, UserX, Wallet,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { hojeEmSaoPaulo } from "@/lib/datas"
import { alertasDasGravacoes, type GravacaoDoPainel, type IdDoAlerta } from "@/lib/painel-gravacoes"
import styles from "@/components/dashboard/DashboardPreview.module.css"

// O painel das Gravações Externas: alertas do que precisa ser feito, no
// desenho do Dashboard. Cada alerta mostra quantas são e as primeiras, para
// abrir direto. O que está em dia vira uma linha só no fim. As regras estão em
// lib/painel-gravacoes.ts.

const ICONE: Record<IdDoAlerta, LucideIcon> = {
  sem_videomaker: UserX,
  sem_confirmacao: Hourglass,
  material_atrasado: AlertTriangle,
  edicao_atrasada: Clock,
  para_enviar: Send,
  nota_compras: Inbox,
  nota_refazer: RotateCcw,
  nota_falta: FileWarning,
  pagamento: Wallet,
}

const COR = { urgente: "#ff9baf", atencao: "#f3c57c" } as const

/** Quantas gravações cada alerta mostra antes do "e mais N". */
const VISIVEIS = 5

export function PainelDasGravacoes({ gravacoes, carregando, onAbrir }: {
  gravacoes: GravacaoDoPainel[]
  carregando: boolean
  onAbrir: (id: string) => void
}) {
  const hoje = hojeEmSaoPaulo()
  const alertas = useMemo(() => alertasDasGravacoes(gravacoes, hoje), [gravacoes, hoje])
  const pendentes = alertas.filter((a) => a.itens.length > 0)
  const emDia = alertas.filter((a) => a.itens.length === 0)

  // O card abre no painel lateral, como no quadro; Ctrl/Cmd+clique abre a página.
  const abrir = (id: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    onAbrir(id)
  }

  if (carregando) return <p role="status" className={cn(styles.muted, "px-4 py-8")}>Carregando…</p>

  return <div className={cn(styles.dashboard, "px-4! pt-2! bg-transparent!")}>
    {pendentes.length === 0 && <section className={styles.panel}>
      <div className="flex items-center gap-3"><CheckCircle2 size={22} className="text-[#77dab8]" aria-hidden /><h2 className="text-lg font-medium">Nada pendente nas gravações.</h2></div>
    </section>}

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {pendentes.map((a) => {
        const Icone = ICONE[a.id]
        return <section key={a.id} className={cn(styles.panel, "p-5!")} aria-labelledby={`alerta-${a.id}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`alerta-${a.id}`} className="text-[15px] font-medium text-[#eeedf5]">{a.titulo}</h2>
              <p className="mt-1 text-xs text-[#a0a4b8]">{a.acao}</p>
            </div>
            <Icone size={19} style={{ color: COR[a.tom] }} aria-hidden className="shrink-0" />
          </div>
          <strong className="mt-3 block text-[40px] font-normal leading-tight tabular-nums" style={{ color: COR[a.tom] }}>{a.itens.length}</strong>
          <div className="mt-2">
            {a.itens.slice(0, VISIVEIS).map((g) => <a key={g.id} href={`/jobs/${g.id}`} onClick={abrir(g.id)} className={styles.alerta}>
              <div><strong>{g.cliente}</strong><small>{[g.codigo, g.detalhe].filter(Boolean).join(" · ")}</small></div>
            </a>)}
          </div>
          {a.itens.length > VISIVEIS && <p className={cn(styles.note, "mt-3!")}>e mais {a.itens.length - VISIVEIS}.</p>}
        </section>
      })}
    </div>

    {emDia.length > 0 && <p className={cn(styles.note, "mt-0! flex flex-wrap items-center gap-x-2 gap-y-1")}>
      <CheckCircle2 size={14} className="text-[#77dab8]" aria-hidden />
      <span>Em dia: {emDia.map((a) => a.titulo).join(" · ")}.</span>
    </p>}
  </div>
}
