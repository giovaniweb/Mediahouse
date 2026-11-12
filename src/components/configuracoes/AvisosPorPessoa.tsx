"use client"
// Avisos por pessoa (12/11/2026). Em Configurações, a gestão escolhe a pessoa e
// marca, por categoria, os canais (sino, e-mail, WhatsApp) e se ela quer tudo
// ou só os cards em que está. No Perfil, a própria pessoa vê e muda as dela,
// menos o que a gestão travou.
//
// Sem nada marcado de diferente, a pessoa recebe o que sempre recebeu: a tela
// só desliga, nunca dá aviso a mais.
import { useMemo, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Bell, Lock, LockOpen, Loader2, Mail, MessageCircle, RotateCcw, Save } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { erroDaResposta, mensagemDeErro } from "@/lib/erro-cliente"
import { AVISOS_FORA_DA_PAGINA, CATEGORIAS_AVISO, type CategoriaAviso } from "@/lib/avisos-categorias"
import type { EstadoCategoria } from "@/lib/preferencias-aviso-gestao"

type Pessoa = { id: string; nome: string; papel: string; areas: string[]; ajustes?: number }
type Resposta = { pessoa: Pessoa; estado: EstadoCategoria[]; comoGestao: boolean; pessoas: Pessoa[] }

const CANAIS = [
  { id: "sino", rotulo: "Sino", icone: Bell },
  { id: "email", rotulo: "E-mail", icone: Mail },
  { id: "whatsapp", rotulo: "WhatsApp", icone: MessageCircle },
] as const

const botao = "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50"
const campo = "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-500"

/** Atalhos para os casos que motivaram a página. Só marcam as caixas; nada sai sem Salvar. */
const ATALHOS: { rotulo: string; dica: string; aplicar: (c: CategoriaAviso) => Partial<EstadoCategoria> }[] = [
  {
    rotulo: "Só as demandas, nos cards em que estou",
    dica: "Pedidos novos, andamento, comentários e prazos — andamento, comentários e prazos só dos cards dela.",
    aplicar: (c) => ["pedidos", "resumos"].includes(c) ? ligado("tudo")
      : ["andamento", "comentarios", "prazos"].includes(c) ? ligado("meus") : desligado(),
  },
  {
    rotulo: "Só gravações externas e videomakers",
    dica: "Convite, aceite, material, nota fiscal e gravação pronta. O resto desliga.",
    aplicar: (c) => c === "gravacoes" ? ligado("tudo") : desligado(),
  },
  { rotulo: "Tudo, como antes", dica: "Volta ao padrão: recebe o que sempre recebeu.", aplicar: () => ligado("tudo") },
]
function ligado(recorte: "tudo" | "meus") { return { sino: true, email: true, whatsapp: true, recorte } }
function desligado() { return { sino: false, email: false, whatsapp: false, recorte: "tudo" as const } }

export function AvisosPorPessoa({ modo }: { modo: "gestao" | "propria" }) {
  const [escolhida, setEscolhida] = useState("")
  const url = modo === "gestao" && escolhida ? `/api/avisos-por-pessoa?usuarioId=${encodeURIComponent(escolhida)}` : "/api/avisos-por-pessoa"
  const { data: r, error, mutate } = useSWR<Resposta>(url, fetcher)
  // O que está na tela e ainda não foi salvo. null = igual ao que veio do servidor.
  const [rascunho, setRascunho] = useState<EstadoCategoria[] | null>(null)
  const [salvando, setSalvando] = useState(false)
  const estado = useMemo(() => rascunho ?? r?.estado ?? [], [rascunho, r])
  const setEstado = (f: (atual: EstadoCategoria[]) => EstadoCategoria[]) => setRascunho(f(estado))
  const gestao = modo === "gestao" && !!r?.comoGestao
  const mudou = useMemo(() => JSON.stringify(estado) !== JSON.stringify(r?.estado ?? []), [estado, r])

  function mudar(categoria: CategoriaAviso, parte: Partial<EstadoCategoria>) {
    setEstado((atual) => atual.map((e) => (e.categoria === categoria ? { ...e, ...parte } : e)))
  }
  function atalho(a: (typeof ATALHOS)[number]) {
    setEstado((atual) => atual.map((e) => (e.travada && !gestao ? e : { ...e, ...a.aplicar(e.categoria) })))
  }

  async function salvar() {
    if (!r) return
    setSalvando(true)
    try {
      const res = await fetch("/api/avisos-por-pessoa", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId: r.pessoa.id, categorias: estado }),
      })
      if (!res.ok) throw await erroDaResposta(res, "Não foi possível salvar.")
      const j: { alteradas: number } = await res.json()
      toast.success(j.alteradas ? `Avisos de ${r.pessoa.nome} salvos.` : "Nada mudou.")
      await mutate()
      setRascunho(null)
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível salvar."))
    } finally {
      setSalvando(false)
    }
  }

  if (error) return <p role="alert" className="text-sm text-red-300">{mensagemDeErro(error, "Não foi possível carregar os avisos.")}</p>
  if (!r) return <p role="status" className="text-sm text-zinc-400">Carregando os avisos…</p>

  const ajustadas = estado.filter((e) => !e.sino || !e.email || !e.whatsapp || e.recorte === "meus").length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">{modo === "gestao" ? "Avisos por pessoa" : "Meus avisos"}</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {modo === "gestao"
            ? "Escolha o que cada pessoa recebe no sino, no e-mail e no WhatsApp. Sem mudar nada, ela recebe o que sempre recebeu — aqui só se desliga."
            : "Escolha o que você recebe no sino, no e-mail e no WhatsApp. O que tem cadeado foi definido pela gestão."}
        </p>
      </div>

      {modo === "gestao" && (
        <label className="block max-w-sm text-sm text-zinc-300">
          Pessoa
          <select aria-label="Pessoa" value={escolhida || r.pessoa.id} onChange={(e) => { setEscolhida(e.target.value); setRascunho(null) }} className={`${campo} mt-1`}>
            {r.pessoas.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}{p.ajustes ? ` · ${p.ajustes} ajuste(s)` : ""}</option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap gap-2" aria-label="Atalhos">
        {ATALHOS.map((a) => (
          <button key={a.rotulo} type="button" aria-label={a.rotulo} title={a.dica} onClick={() => atalho(a)} className={botao}>{a.rotulo}</button>
        ))}
      </div>

      <p className="text-sm text-zinc-400" data-resumo>
        {ajustadas ? `${r.pessoa.nome} tem ${ajustadas} categoria(s) diferente(s) do padrão.` : `${r.pessoa.nome} recebe tudo, como sempre.`}
      </p>

      <ul className="space-y-3">
        {estado.map((e) => {
          const info = CATEGORIAS_AVISO[e.categoria]
          const bloqueada = e.travada && !gestao
          const tudoDesligado = !e.sino && !e.email && !e.whatsapp
          return (
            <li key={e.categoria} data-categoria={e.categoria} className={`rounded-xl border p-4 ${tudoDesligado ? "border-white/5 bg-zinc-900/40" : "border-white/10 bg-zinc-900"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-100">{info.titulo}{tudoDesligado && <span className="ml-2 text-xs font-normal text-amber-300">desligado</span>}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{info.descricao}</p>
                  <p className="mt-2 rounded-lg bg-black/30 px-3 py-2 text-xs text-zinc-400">Exemplo: {info.exemplo}</p>
                </div>
                {gestao ? (
                  <button type="button" onClick={() => mudar(e.categoria, { travada: !e.travada })} aria-pressed={e.travada}
                    title={e.travada ? "Travada: a pessoa não muda" : "A pessoa pode mudar"} className={`${botao} px-2 py-1 text-xs`}>
                    {e.travada ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />}
                    {e.travada ? "Travada" : "Pessoa pode mudar"}
                  </button>
                ) : e.travada ? (
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-400"><Lock className="h-3.5 w-3.5" aria-hidden="true" />Definido pela gestão</span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                {CANAIS.map((c) => {
                  const Icone = c.icone
                  return (
                    <label key={c.id} className="inline-flex items-center gap-2 text-sm text-zinc-200">
                      <input type="checkbox" checked={e[c.id]} disabled={bloqueada} onChange={(ev) => mudar(e.categoria, { [c.id]: ev.target.checked })}
                        aria-label={`${info.titulo}: ${c.rotulo}`} className="h-4 w-4 accent-emerald-500" />
                      <Icone className="h-4 w-4 text-zinc-400" aria-hidden="true" />{c.rotulo}
                    </label>
                  )
                })}
                {info.temRecorte && (
                  <select aria-label={`${info.titulo}: de quais cards`} value={e.recorte} disabled={bloqueada || tudoDesligado}
                    onChange={(ev) => mudar(e.categoria, { recorte: ev.target.value === "meus" ? "meus" : "tudo" })}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200">
                    <option value="tudo">De todos os cards que já recebe</option>
                    <option value="meus">Só dos cards em que está</option>
                  </select>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={salvar} disabled={!mudou || salvando} className={botao}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}Salvar
        </button>
        <button type="button" onClick={() => setRascunho(null)} disabled={!mudou || salvando} className={botao}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />Desfazer o que não salvei
        </button>
      </div>

      <div className="rounded-xl border border-white/10 p-4 text-sm text-zinc-400">
        <p className="font-medium text-zinc-300">“Estar no card”</p>
        <p className="mt-1">Pediu, é o gestor ou o responsável, edita, grava, desenha ou posta aquela demanda. Aviso que não é de card nenhum continua chegando.</p>
        <p className="mt-3 font-medium text-zinc-300">Sempre chegam, e não aparecem aqui</p>
        <p className="mt-1">{AVISOS_FORA_DA_PAGINA.join(" · ")}. Também chega sempre o aviso que é trabalho da própria pessoa: entrou na fila dela, foi escalada para gravar, convite de gravação, ajuste pedido na peça que ela fez.</p>
      </div>
    </div>
  )
}
