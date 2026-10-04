"use client"

import type { ReactNode } from "react"
import styles from "./BoardOverview.module.css"
import { LayoutGrid, List } from "lucide-react"
import { useDetailPresentation } from "./useDetailPresentation"
import { cn } from "@/lib/utils"
import type { Visao, AbaRapida, DemandaLista } from "./tipos-visao"
import { calcularKpis } from "./tipos-visao"

// Topo do quadro: os números que respondem "como estamos", o seletor de visão e
// os recortes de uso diário. Fica igual nas duas visões — muda o desenho embaixo,
// não a navegação.

const VISOES: { id: Visao; label: string; icone: typeof LayoutGrid }[] = [
  { id: "kanban", label: "Kanban", icone: LayoutGrid },
  { id: "lista", label: "Lista", icone: List },
]

// "1 abertas" aparecia toda vez que o filtro deixava uma demanda só.
const contagem = (n: number, um: string, varios: string) => (n === 1 ? um : varios)

const ABAS: { id: AbaRapida; label: string }[] = [
  { id: "todos", label: "Todas" },
  { id: "minhas", label: "Minhas" },
  { id: "criadas", label: "Criadas por mim" },
  { id: "atrasadas", label: "Atrasadas" },
]

export function BarraVisao({
  demandas, visao, onVisao, aba, onAba, total, filters, area = "audiovisual",
}: {
  filters?: ReactNode
  area?: "audiovisual" | "growth"
  demandas: DemandaLista[]
  visao: Visao
  onVisao: (v: Visao) => void
  aba: AbaRapida
  onAba: (a: AbaRapida) => void
  total: number
}) {
  const { presentation, setPresentation } = useDetailPresentation()
  const kpi = calcularKpis(demandas)

  return <section className={styles.overview} aria-label="Controles do quadro">
    <div className={styles.heading}>
      <h1>{area === "growth" ? "Conteúdo que move." : "Produção em movimento."}</h1>
      <p>{area === "growth" ? "Copy, criação e aprovação no mesmo fluxo." : "Do briefing à publicação, sem perder o contexto."}</p>
    </div>
    <div className={styles.counts} aria-label="Resumo das demandas filtradas">
      <span><strong>{kpi.abertas}</strong> {contagem(kpi.abertas, "aberta", "abertas")}</span>
      <span data-tone="late"><strong>{kpi.atrasadas}</strong> {contagem(kpi.atrasadas, "atrasada", "atrasadas")}</span>
      <span data-tone="approval"><strong>{kpi.aprovacao}</strong> em aprovação</span>
      <span data-tone="done"><strong>{kpi.concluidasHoje}</strong> {contagem(kpi.concluidasHoje, "concluída", "concluídas")} hoje</span>
    </div>
    <div className={styles.viewRow}>
      <div className={styles.tabs} aria-label="Visualização do quadro">
        {VISOES.map(({id, label, icone: Icon}) => <button key={id} type="button" aria-label={`Ver como ${label.toLowerCase()}`} aria-pressed={visao === id} onClick={() => onVisao(id)}><Icon size={17} />{label}</button>)}
      </div>
      <label className={styles.opening}>Abrir detalhes<select aria-label="Abrir detalhes" value={presentation} onChange={e => setPresentation(e.target.value as "drawer" | "modal")}><option value="drawer">Painel lateral</option><option value="modal">Janela ampliada</option></select></label>
    </div>
    <div className={styles.filters}>{filters}</div>
    <div className={styles.scopes} aria-label="Recortes das demandas">
      {ABAS.map(item => <button key={item.id} type="button" aria-pressed={aba === item.id} onClick={() => onAba(item.id)}>{item.label}{aba === item.id && <span>{total}</span>}</button>)}
    </div>
  </section>
}
