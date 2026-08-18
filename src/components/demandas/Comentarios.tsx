"use client"

import { useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { MessageCircle, Send, Loader2, AtSign } from "lucide-react"
import { iniciais } from "@/lib/pessoas-ui"
import { fetcher } from "@/lib/fetcher"


// Menção guardada como @[Nome](userId): o id evita casar por nome (dois "Gabriel",
// grafia diferente) e é o que o servidor valida antes de notificar.
const REGEX_MENCAO = /@\[([^\]]+)\]\(([a-z0-9]+)\)/gi

export interface ComentarioItem {
  id: string
  comentario: string
  createdAt: string
  usuario?: { id: string; nome: string } | null
}

interface Pessoa { id: string; nome: string; label?: string }

/** Converte o texto guardado em pedaços renderizáveis, destacando as menções. */
function partes(texto: string) {
  const saida: { tipo: "texto" | "mencao"; valor: string }[] = []
  let ultimo = 0
  for (const m of texto.matchAll(REGEX_MENCAO)) {
    const i = m.index ?? 0
    if (i > ultimo) saida.push({ tipo: "texto", valor: texto.slice(ultimo, i) })
    saida.push({ tipo: "mencao", valor: m[1] })
    ultimo = i + m[0].length
  }
  if (ultimo < texto.length) saida.push({ tipo: "texto", valor: texto.slice(ultimo) })
  return saida
}

export function Comentarios({ demandaId, comentarios, onEnviado }: {
  demandaId: string
  comentarios: ComentarioItem[]
  onEnviado: () => void
}) {
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [buscaMencao, setBuscaMencao] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Toda a casa pode ser marcada, não só quem atua na área da demanda.
  const { data: dataPessoas } = useSWR<{ responsaveis: Pessoa[] }>(
    "/api/growth/responsaveis?area=todas", fetcher
  )
  const pessoas = dataPessoas?.responsaveis ?? []

  const sugestoes = useMemo(() => {
    if (buscaMencao === null) return []
    const termo = buscaMencao.toLowerCase()
    return pessoas.filter((p) => p.nome.toLowerCase().includes(termo)).slice(0, 6)
  }, [buscaMencao, pessoas])

  function aoDigitar(valor: string) {
    setTexto(valor)
    // Abre a lista quando há um @ sendo digitado no fim do texto.
    const m = valor.slice(0, inputRef.current?.selectionStart ?? valor.length).match(/@([\p{L}\s]{0,20})$/u)
    setBuscaMencao(m ? m[1] : null)
  }

  function escolher(p: Pessoa) {
    const cursor = inputRef.current?.selectionStart ?? texto.length
    const antes = texto.slice(0, cursor).replace(/@([\p{L}\s]{0,20})$/u, "")
    setTexto(`${antes}@[${p.nome}](${p.id}) ${texto.slice(cursor)}`)
    setBuscaMencao(null)
    inputRef.current?.focus()
  }

  async function enviar() {
    if (!texto.trim() || enviando) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/demandas/${demandaId}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comentario: texto.trim() }),
      })
      if (res.ok) { setTexto(""); onEnviado() }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-zinc-500" />
        <h2 className="font-semibold text-zinc-300">Comentários</h2>
        {comentarios.length > 0 && (
          <span className="text-xs text-zinc-500">{comentarios.length}</span>
        )}
      </div>

      <div className="divide-y divide-zinc-800/70 max-h-80 overflow-y-auto">
        {comentarios.length === 0 && (
          <p className="p-6 text-sm text-zinc-500 text-center">
            Nenhum comentário ainda. Use <b>@</b> para marcar alguém — a pessoa é avisada.
          </p>
        )}
        {comentarios.map((c) => (
          <div key={c.id} className="p-4 flex gap-3">
            <span className="w-7 h-7 rounded-full bg-zinc-700 text-[10px] font-bold text-zinc-200 flex items-center justify-center shrink-0">
              {iniciais(c.usuario?.nome ?? "Sistema")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-sm font-medium text-zinc-200">{c.usuario?.nome ?? "Sistema"}</span>
                <span className="text-[11px] text-zinc-500">
                  {format(new Date(c.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
              <p className="text-sm text-zinc-400 whitespace-pre-wrap break-words">
                {partes(c.comentario ?? "").map((p, i) =>
                  p.tipo === "mencao"
                    ? <span key={i} className="text-purple-300 bg-purple-500/15 rounded px-1">@{p.valor}</span>
                    : <span key={i}>{p.valor}</span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-zinc-800 relative">
        {sugestoes.length > 0 && (
          <ul className="absolute bottom-full left-3 right-3 mb-1 max-h-52 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl z-10">
            {sugestoes.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => escolher(p)}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition-colors"
                >
                  <span className="w-5 h-5 rounded-full bg-zinc-700 text-[9px] font-bold text-zinc-200 flex items-center justify-center shrink-0">
                    {iniciais(p.nome)}
                  </span>
                  <span className="text-sm text-zinc-200 truncate">{p.nome}</span>
                  {p.label && <span className="text-[10px] text-zinc-500 ml-auto shrink-0">{p.label}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={texto}
            onChange={(e) => aoDigitar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setBuscaMencao(null)
              // Enter envia; Shift+Enter quebra linha. Com a lista de menção
              // aberta, Enter é para escolher a pessoa, não para enviar.
              if (e.key === "Enter" && !e.shiftKey && sugestoes.length === 0) {
                e.preventDefault()
                void enviar()
              }
            }}
            rows={2}
            placeholder="Escreva um comentário… use @ para marcar alguém"
            className="flex-1 text-sm bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200 placeholder:text-zinc-500 resize-none"
          />
          <button
            onClick={enviar}
            disabled={enviando || !texto.trim()}
            className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 shrink-0"
            aria-label="Enviar comentário"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="flex items-center gap-1 text-[11px] text-zinc-600 mt-1.5">
          <AtSign className="w-3 h-3" /> Quem você marcar recebe aviso no sino e no WhatsApp.
        </p>
      </div>
    </div>
  )
}
