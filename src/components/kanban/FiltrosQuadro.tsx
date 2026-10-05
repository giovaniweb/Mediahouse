"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Search, SlidersHorizontal, X, XCircle } from "lucide-react"
import styles from "./FiltrosQuadro.module.css"

// Busca + "Filtros" dos quadros (Demandas, Growth e, depois, Jobs).
//
// Os selects ficavam todos à vista e quebravam o topo em duas linhas; quase
// sempre estavam em "Todos". A busca é o filtro de todo dia e continua aberta;
// o resto vai para um painel, e o botão mostra quantos estão valendo — sem
// isso o quadro aparece parcial e parece que sumiram cards.
//
// A página só descreve os filtros (rótulo, valor, opções); contagem, painel e
// "Limpar filtros" são daqui, para as três telas se comportarem igual.

export interface FiltroQuadro {
  id: string
  /** Rótulo curto, acima do select: "Departamento", "Editor"… */
  rotulo: string
  valor: string
  onChange: (valor: string) => void
  opcoes: { valor: string; rotulo: string }[]
  /** Texto da opção vazia. Padrão: "Todos". */
  todos?: string
}

export function FiltrosQuadro({ busca, onBusca, placeholder = "Buscar…", filtros, children }: {
  busca: string
  onBusca: (valor: string) => void
  placeholder?: string
  filtros: FiltroQuadro[]
  /** Avisos ao lado do botão (ex.: recorte que veio por link do dashboard). */
  children?: ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const [aDireita, setADireita] = useState(false)
  const ancora = useRef<HTMLDivElement>(null)
  const painel = useRef<HTMLDivElement>(null)
  const painelId = useId()
  const ativos = filtros.filter(f => f.valor)
  const resumo = ativos.map(f => `${f.rotulo}: ${f.opcoes.find(o => o.valor === f.valor)?.rotulo ?? f.valor}`).join(" · ")

  // Fecha com Esc ou com clique fora, como qualquer menu.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => { if (!ancora.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false) }
    document.addEventListener("pointerdown", fora)
    document.addEventListener("keydown", esc)
    ancora.current?.querySelector("select")?.focus()
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc) }
  }, [aberto])

  // O botão anda conforme a largura da tela: o painel abre para a direita e,
  // se não couber, se alinha pela borda direita do botão.
  useLayoutEffect(() => {
    if (!aberto || !ancora.current || !painel.current) return
    const botao = ancora.current.getBoundingClientRect()
    setADireita(botao.left + painel.current.offsetWidth > window.innerWidth - 16)
  }, [aberto])

  return <div className={styles.filtros}>
    <label className={styles.busca}>
      <Search size={15} aria-hidden />
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={busca} onChange={e => onBusca(e.target.value)} />
      {busca && <button type="button" aria-label="Limpar busca" onClick={() => onBusca("")}><X size={14} /></button>}
    </label>
    {filtros.length > 0 && <div ref={ancora} className={styles.ancora}>
      <button type="button" className={styles.botao} aria-expanded={aberto} aria-controls={painelId} title={resumo || undefined} data-ativo={ativos.length > 0 || undefined} onClick={() => setAberto(v => !v)}>
        <SlidersHorizontal size={15} aria-hidden /> Filtros
        {ativos.length > 0 && <span aria-label={`${ativos.length} ${ativos.length === 1 ? "ativo" : "ativos"}`}>{ativos.length}</span>}
      </button>
      {aberto && <div id={painelId} ref={painel} role="group" aria-label="Filtros do quadro" className={styles.painel} data-lado={aDireita ? "direita" : undefined}>
        <div className={styles.campos}>
          {filtros.map(f => <label key={f.id}>
            <span>{f.rotulo}</span>
            <select value={f.valor} data-ativo={!!f.valor || undefined} onChange={e => f.onChange(e.target.value)}>
              <option value="">{f.todos ?? "Todos"}</option>
              {f.opcoes.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </label>)}
        </div>
        <div className={styles.rodape}>
          <button type="button" className={styles.limpar} disabled={ativos.length === 0} onClick={() => ativos.forEach(f => f.onChange(""))}><XCircle size={14} aria-hidden /> Limpar filtros</button>
          <button type="button" className={styles.pronto} onClick={() => setAberto(false)}>Pronto</button>
        </div>
      </div>}
    </div>}
    {children}
  </div>
}
