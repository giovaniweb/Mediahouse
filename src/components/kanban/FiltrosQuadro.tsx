"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ChevronLeft, ListFilter, Search, X } from "lucide-react"
import styles from "./FiltrosQuadro.module.css"

// Busca + "Filtrar por…" dos quadros (Demandas, Growth, Jobs e o da Social).
//
// Os selects ficavam todos à vista e quebravam o topo em duas linhas; quase
// sempre estavam em "Todos". Depois foram para um painel com todos os selects
// juntos, e ainda era preciso abrir o painel para saber o que estava valendo.
// Agora a pessoa escolhe o critério (prazo, linha, pessoa…), depois o valor, e
// cada filtro ativo fica à vista como um chip com X — sem isso o quadro aparece
// parcial e parece que sumiram cards.
//
// A página só descreve os critérios (rótulo, valor, opções); menu, chips e
// "Limpar" são daqui, para as telas se comportarem igual.

export interface FiltroQuadro {
  id: string
  /** Nome do critério no menu e no chip: "Pessoa", "Linha de produto"… */
  rotulo: string
  /** "" = sem filtro. No período, "AAAA-MM-DD|AAAA-MM-DD" (um lado pode faltar). */
  valor: string
  onChange: (valor: string) => void
  /** Escolha de uma opção (padrão) ou intervalo de datas. */
  tipo?: "lista" | "periodo"
  opcoes?: { valor: string; rotulo: string }[]
}

export function lerPeriodo(valor: string): { de: string; ate: string } {
  const [de = "", ate = ""] = valor.split("|")
  return { de, ate }
}

export const valorPeriodo = (de: string, ate: string) => (de || ate ? `${de}|${ate}` : "")

const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(2, 4)}`

function textoDoValor(f: FiltroQuadro): string {
  if (f.tipo === "periodo") {
    const { de, ate } = lerPeriodo(f.valor)
    if (de && ate) return de === ate ? diaCurto(de) : `${diaCurto(de)} a ${diaCurto(ate)}`
    return de ? `a partir de ${diaCurto(de)}` : `até ${diaCurto(ate)}`
  }
  return f.opcoes?.find(o => o.valor === f.valor)?.rotulo ?? f.valor
}

// Lista longa (pessoas, produtos) ganha uma busca própria; curta não precisa.
const OPCOES_COM_BUSCA = 8

export function FiltrosQuadro({ busca, onBusca, placeholder = "Buscar…", filtros: todos, children }: {
  /** Sem `onBusca` não há campo de busca (o quadro da social não tem). */
  busca?: string
  onBusca?: (valor: string) => void
  placeholder?: string
  filtros: FiltroQuadro[]
  /** Avisos ao lado dos chips (ex.: recorte que veio por link do dashboard). */
  children?: ReactNode
}) {
  // null = fechado; "menu" = lista de critérios; outro valor = id do critério aberto.
  const [aberto, setAberto] = useState<string | null>(null)
  // Critério sem opção nenhuma (empresa sem linha cadastrada, sem evento…) não
  // entra no menu: seria um caminho que não leva a nada.
  const filtros = todos.filter(f => f.tipo === "periodo" || f.valor || (f.opcoes?.length ?? 0) > 0)
  const [aDireita, setADireita] = useState(false)
  const ancora = useRef<HTMLDivElement>(null)
  const painel = useRef<HTMLDivElement>(null)
  const painelId = useId()
  const ativos = filtros.filter(f => f.valor)
  const criterio = filtros.find(f => f.id === aberto)

  // Fecha com Esc ou com clique fora, como qualquer menu.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => { if (!ancora.current?.contains(e.target as Node)) setAberto(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(null) }
    document.addEventListener("pointerdown", fora)
    document.addEventListener("keydown", esc)
    painel.current?.querySelector<HTMLElement>("input, button:not([data-voltar])")?.focus()
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc) }
  }, [aberto])

  // O botão anda conforme os chips: o menu abre para a direita e, se não
  // couber, se alinha pela borda direita do botão.
  useLayoutEffect(() => {
    if (!aberto || !ancora.current || !painel.current) return
    const botao = ancora.current.getBoundingClientRect()
    setADireita(botao.left + painel.current.offsetWidth > window.innerWidth - 16)
  }, [aberto])

  const escolher = (f: FiltroQuadro, valor: string) => { f.onChange(valor); setAberto(null) }

  return <div className={styles.filtros}>
    {onBusca && <label className={styles.busca}>
      <Search size={15} aria-hidden />
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={busca ?? ""} onChange={e => onBusca(e.target.value)} />
      {busca && <button type="button" aria-label="Limpar busca" onClick={() => onBusca("")}><X size={14} /></button>}
    </label>}

    {ativos.map(f => <span key={f.id} className={styles.chip}>
      <button type="button" title={`Trocar ${f.rotulo.toLowerCase()}`} onClick={() => setAberto(f.id)}>
        <span>{f.rotulo}:</span> {textoDoValor(f)}
      </button>
      <button type="button" aria-label={`Tirar o filtro ${f.rotulo}`} onClick={() => f.onChange("")}><X size={13} /></button>
    </span>)}

    {filtros.length > 0 && <div ref={ancora} className={styles.ancora}>
      <button type="button" className={styles.botao} aria-expanded={!!aberto} aria-controls={painelId} onClick={() => setAberto(v => v ? null : "menu")}>
        <ListFilter size={15} aria-hidden /> Filtrar por…
      </button>
      {aberto && <div id={painelId} ref={painel} role="group" aria-label={criterio ? `Filtrar por ${criterio.rotulo}` : "Filtrar por"} className={styles.painel} data-lado={aDireita ? "direita" : undefined}>
        {criterio
          ? <Criterio key={criterio.id} f={criterio} onVoltar={() => setAberto("menu")} onEscolher={v => escolher(criterio, v)} />
          : <ul className={styles.menu}>
              {filtros.map(f => <li key={f.id}>
                <button type="button" onClick={() => setAberto(f.id)}>
                  {f.rotulo}
                  {f.valor && <small>{textoDoValor(f)}</small>}
                </button>
              </li>)}
            </ul>}
      </div>}
    </div>}

    {ativos.length > 1 && <button type="button" className={styles.limpar} onClick={() => ativos.forEach(f => f.onChange(""))}>Limpar</button>}
    {children}
  </div>
}

function Criterio({ f, onVoltar, onEscolher }: { f: FiltroQuadro; onVoltar: () => void; onEscolher: (valor: string) => void }) {
  const [procura, setProcura] = useState("")
  const inicial = lerPeriodo(f.valor)
  const [de, setDe] = useState(inicial.de)
  const [ate, setAte] = useState(inicial.ate)
  const invertido = !!(de && ate && de > ate)
  const opcoes = f.opcoes ?? []
  const termo = procura.trim().toLowerCase()
  const visiveis = termo ? opcoes.filter(o => o.rotulo.toLowerCase().includes(termo)) : opcoes

  return <>
    <button type="button" data-voltar className={styles.voltar} onClick={onVoltar}><ChevronLeft size={14} aria-hidden /> {f.rotulo}</button>
    {f.tipo === "periodo"
      ? <form className={styles.periodo} onSubmit={e => { e.preventDefault(); if (!invertido) onEscolher(valorPeriodo(de, ate)) }}>
          <label><span>De</span><input type="date" aria-label={`${f.rotulo}: de`} value={de} onChange={e => setDe(e.target.value)} /></label>
          <label><span>Até</span><input type="date" aria-label={`${f.rotulo}: até`} value={ate} aria-invalid={invertido} onChange={e => setAte(e.target.value)} /></label>
          {invertido && <p role="alert">A data final vem depois da inicial.</p>}
          <button type="submit" className={styles.aplicar} disabled={invertido || (!de && !ate)}>Aplicar</button>
        </form>
      : <>
          {opcoes.length > OPCOES_COM_BUSCA && <label className={styles.procura}>
            <Search size={14} aria-hidden />
            <input type="search" aria-label={`Procurar em ${f.rotulo}`} placeholder="Procurar…" value={procura} onChange={e => setProcura(e.target.value)} />
          </label>}
          <ul className={styles.opcoes}>
            {visiveis.map(o => <li key={o.valor}>
              <button type="button" aria-pressed={o.valor === f.valor} onClick={() => onEscolher(o.valor)}>{o.rotulo}</button>
            </li>)}
            {visiveis.length === 0 && <li className={styles.vazio}>{opcoes.length ? "Nada com esse nome." : "Nenhuma opção cadastrada."}</li>}
          </ul>
        </>}
  </>
}
