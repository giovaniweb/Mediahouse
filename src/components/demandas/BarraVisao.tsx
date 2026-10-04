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
  demandas, visao, onVisao, aba, onAba, total, filters, paginacao, aviso,
}: {
  filters?: ReactNode
  /** Paginação da fila e link do histórico, à direita da primeira linha. */
  paginacao?: ReactNode
  /** Aviso que precisa ser lido (ex.: concluídos antigos sem data). */
  aviso?: ReactNode
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

  // Duas linhas, e não cinco: o título grande, os números, as abas, os filtros e
  // os recortes empilhados deixavam ao quadro só o rodapé da tela. O nome da
  // página já está na barra de cima.
  return <section className={styles.overview} aria-label="Controles do quadro">
    <div className={styles.topRow}>
      <div className={styles.tabs} aria-label="Visualização do quadro">
        {VISOES.map(({id, label, icone: Icon}) => <button key={id} type="button" aria-label={`Ver como ${label.toLowerCase()}`} aria-pressed={visao === id} onClick={() => onVisao(id)}><Icon size={16} />{label}</button>)}
      </div>
      <div className={styles.counts} aria-label="Resumo das demandas filtradas">
        <span><strong>{kpi.abertas}</strong> {contagem(kpi.abertas, "aberta", "abertas")}</span>
        <span data-tone="late"><strong>{kpi.atrasadas}</strong> {contagem(kpi.atrasadas, "atrasada", "atrasadas")}</span>
        <span data-tone="approval"><strong>{kpi.aprovacao}</strong> em aprovação</span>
        <span data-tone="done"><strong>{kpi.concluidasHoje}</strong> {contagem(kpi.concluidasHoje, "concluída", "concluídas")} hoje</span>
      </div>
      <div className={styles.right}>
        {paginacao}
        <label className={styles.opening}><span>Abrir em</span><select aria-label="Abrir detalhes" value={presentation} onChange={e => setPresentation(e.target.value as "drawer" | "modal")}><option value="drawer">Painel lateral</option><option value="modal">Janela ampliada</option></select></label>
      </div>
    </div>
    <div className={styles.controlsRow}>
      <div className={styles.scopes} aria-label="Recortes das demandas">
        {ABAS.map(item => <button key={item.id} type="button" aria-pressed={aba === item.id} onClick={() => onAba(item.id)}>{item.label}{aba === item.id && <span>{total}</span>}</button>)}
      </div>
      <div className={styles.filters}>{filters}</div>
    </div>
    {aviso && <div className={styles.aviso}>{aviso}</div>}
  </section>
}
