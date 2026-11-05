"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import { filtrarGrupos, textoDaOpcao, type GrupoDaLista, type OpcaoDaLista } from "@/lib/busca-na-lista"
import { cn } from "@/lib/utils"

/**
 * Uma lista de escolha com um campo de busca dentro (Giovani, 05/11/2026: "um
 * campo de pesquisa que fica na lista, a medida que for escrevendo vai
 * filtrando"). Substitui o <select> de videomaker e de editor: os mesmos
 * grupos (Externos / Internos), a opção "vazia" no topo ("— Sem videomaker —")
 * e o mesmo texto "Nome · Cidade". A busca é por nome ou cidade, sem acento nem
 * maiúscula (lib/busca-na-lista.ts).
 *
 * Teclado: seta para baixo abre; com a lista aberta, setas andam, Enter
 * escolhe, Esc fecha e devolve o foco ao botão. No celular, o campo tem 16px
 * (o iOS não dá zoom) e a lista rola dentro dela.
 */
export function EscolhaComBusca({
  id,
  value,
  onChange,
  grupos,
  vazio,
  rotuloAtual,
  disabled = false,
  className,
  icone,
  ariaLabel,
  abrirSinal,
  placeholderBusca = "Buscar por nome ou cidade",
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  grupos: GrupoDaLista[]
  /** O texto da opção vazia, sempre no topo: "— Sem videomaker —", "Escalar depois". */
  vazio: string
  /** O que mostrar se o valor atual não está nas opções (ex.: o nome já gravado no card). */
  rotuloAtual?: string | null
  disabled?: boolean
  /** Classes do botão, para ficar igual ao campo que ele substitui. */
  className?: string
  /** Ícone à esquerda, dentro do botão. */
  icone?: ReactNode
  ariaLabel?: string
  /** Mudou o número, a lista abre (o "Escalar videomaker" do "Agora" leva até ela). */
  abrirSinal?: number
  placeholderBusca?: string
}) {
  const uid = useId()
  const idDaLista = `${uid}-lista`
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState("")
  const [ativo, setAtivo] = useState(0)
  const caixaRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const todas = grupos.flatMap((g) => g.opcoes)
  const escolhida = todas.find((o) => o.value === value) ?? null
  const visiveis = filtrarGrupos(grupos, termo)
  // A lista plana na ordem da tela: a vazia (índice 0) e as que casam com a busca.
  const plana: OpcaoDaLista[] = [{ value: "", label: vazio }, ...visiveis.flatMap((g) => g.opcoes)]

  function abrir() {
    if (disabled) return
    setTermo("")
    setAtivo(Math.max(0, [{ value: "" }, ...todas].findIndex((o) => o.value === value)))
    setAberto(true)
  }

  // O "Escalar videomaker" pede para abrir: ajusta no render, sem efeito.
  const [sinalVisto, setSinalVisto] = useState(abrirSinal)
  if (abrirSinal !== sinalVisto) {
    setSinalVisto(abrirSinal)
    if (!disabled) {
      setTermo("")
      setAtivo(Math.max(0, [{ value: "" }, ...todas].findIndex((o) => o.value === value)))
      setAberto(true)
    }
  }

  function fechar(devolverFoco = false) {
    setAberto(false)
    if (devolverFoco) botaoRef.current?.focus()
  }

  function escolher(o: OpcaoDaLista) {
    fechar(true)
    if (o.value !== value) onChange(o.value)
  }

  function digitar(t: string) {
    setTermo(t)
    // Com busca, a primeira que casa já fica marcada: Enter escolhe.
    setAtivo(t.trim() && filtrarGrupos(grupos, t).length > 0 ? 1 : 0)
  }

  function teclaNaBusca(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((i) => Math.min(i + 1, plana.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)) }
    else if (e.key === "Home") { e.preventDefault(); setAtivo(0) }
    else if (e.key === "End") { e.preventDefault(); setAtivo(plana.length - 1) }
    else if (e.key === "Enter") { e.preventDefault(); const o = plana[ativo]; if (o) escolher(o) }
    else if (e.key === "Escape") { e.preventDefault(); fechar(true) }
    else if (e.key === "Tab") fechar()
  }

  // Clique fora fecha.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener("pointerdown", fora)
    return () => document.removeEventListener("pointerdown", fora)
  }, [aberto])

  // A marcada fica à vista quando anda pelas setas.
  useEffect(() => {
    if (aberto) listaRef.current?.querySelector(`[data-indice="${ativo}"]`)?.scrollIntoView({ block: "nearest" })
  }, [aberto, ativo])

  const textoDoBotao = escolhida ? textoDaOpcao(escolhida) : value ? (rotuloAtual ?? vazio) : vazio
  let indice = 0
  const opcao = (o: OpcaoDaLista, i: number) => {
    const marcada = i === ativo
    const atual = o.value === value
    return (
      <div
        key={o.value || "vazio"}
        id={`${uid}-op-${i}`}
        role="option"
        aria-selected={atual}
        data-indice={i}
        data-ativa={marcada || undefined}
        onPointerMove={() => setAtivo(i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => escolher(o)}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm",
          marcada ? "bg-purple-500/20 text-zinc-50" : "text-zinc-200",
          !o.value && "text-zinc-400",
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {o.value ? <>{o.label}{o.detalhe && <span className="text-zinc-400"> · {o.detalhe}</span>}{o.extra && <span className="text-zinc-500">{o.extra}</span>}</> : o.label}
        </span>
        {atual && <Check className="h-3.5 w-3.5 shrink-0 text-purple-300" aria-hidden />}
      </div>
    )
  }

  return (
    <div ref={caixaRef} className="relative">
      <button
        ref={botaoRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={ariaLabel}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !aberto) { e.preventDefault(); abrir() } }}
        className={cn("relative flex w-full items-center text-left", className)}
      >
        {icone}
        <span className={cn("min-w-0 flex-1 truncate pr-6", !escolhida && !value && "text-zinc-400")}>{textoDoBotao}</span>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
      </button>

      {aberto && (
        <div className="absolute left-0 right-0 z-50 mt-1 min-w-[16rem] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40">
          <div className="relative border-b border-zinc-800 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input
              autoFocus
              type="text"
              role="combobox"
              aria-expanded={true}
              aria-controls={idDaLista}
              aria-activedescendant={`${uid}-op-${ativo}`}
              aria-autocomplete="list"
              aria-label={placeholderBusca}
              placeholder={placeholderBusca}
              value={termo}
              onChange={(e) => digitar(e.target.value)}
              onKeyDown={teclaNaBusca}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 py-2 pl-8 pr-3 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 sm:text-sm"
            />
          </div>
          <div ref={listaRef} id={idDaLista} role="listbox" aria-label={ariaLabel} className="max-h-[min(60vh,20rem)] overflow-y-auto overscroll-contain p-1">
            {opcao(plana[0], indice++)}
            {visiveis.map((g, gi) => (
              <div key={g.rotulo ?? gi} role="group" aria-label={g.rotulo}>
                {g.rotulo && <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{g.rotulo}</p>}
                {g.opcoes.map((o) => opcao(o, indice++))}
              </div>
            ))}
            {termo.trim() && visiveis.length === 0 && (
              <p className="px-2.5 py-3 text-sm text-zinc-500">Ninguém com “{termo.trim()}” no nome ou na cidade.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
