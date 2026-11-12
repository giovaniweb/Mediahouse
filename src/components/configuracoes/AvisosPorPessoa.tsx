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
import { AVISOS_FORA_DA_PAGINA, CATEGORIAS_AVISO, SETORES, ehRecorte, ehSetor, type CategoriaAviso, type Setor } from "@/lib/avisos-categorias"
import { PERFIS_AVISO, estadoDoPerfil, perfilDoEstado, type PerfilAviso } from "@/lib/avisos-perfis"
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

const ROTULO_RECORTE = {
  tudo: "De todos os cards que já recebe",
  setor: "Só do setor dela (e dos em que está)",
  meus: "Só dos cards em que está",
  pedi: "Só dos cards que ela pediu",
} as const

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
  // Setor usado pelo recorte "setor": o que já está salvo, ou o primeiro da atuação da pessoa.
  const [setorEscolhido, setSetorEscolhido] = useState<Setor | null>(null)
  const setor: Setor = setorEscolhido ?? estado.find((e) => e.setor)?.setor ?? (r?.pessoa.areas.find(ehSetor) as Setor | undefined) ?? "audiovisual"
  const perfilAtual = perfilDoEstado(estado)

  function mudar(categoria: CategoriaAviso, parte: Partial<EstadoCategoria>) {
    setEstado((atual) => atual.map((e) => (e.categoria === categoria ? { ...e, ...parte } : e)))
  }
  function aplicarPerfil(perfil: PerfilAviso) {
    const novo = new Map(estadoDoPerfil(perfil, setor).map((e) => [e.categoria, e]))
    setEstado((atual) => atual.map((e) => (e.travada && !gestao ? e : { ...e, ...novo.get(e.categoria)! })))
  }
  function mudarSetor(s: Setor) {
    setSetorEscolhido(s)
    setEstado((atual) => atual.map((e) => (e.recorte === "setor" && !(e.travada && !gestao) ? { ...e, setor: s } : e)))
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

  const ajustadas = estado.filter((e) => !e.sino || !e.email || !e.whatsapp || e.recorte !== "tudo").length

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
          <select aria-label="Pessoa" value={escolhida || r.pessoa.id} onChange={(e) => { setEscolhida(e.target.value); setRascunho(null); setSetorEscolhido(null) }} className={`${campo} mt-1`}>
            {r.pessoas.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}{p.ajustes ? ` · ${p.ajustes} ajuste(s)` : ""}</option>
            ))}
          </select>
        </label>
      )}

      <section aria-label="Perfis prontos" className="rounded-xl border border-white/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium text-zinc-100">Perfis prontos</p>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
            Setor
            <select aria-label="Setor da pessoa" value={setor} onChange={(e) => ehSetor(e.target.value) && mudarSetor(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200">
              {Object.entries(SETORES).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-1 text-xs text-zinc-400">Um clique marca as caixas; nada muda até Salvar. O perfil só tira avisos — o que é trabalho da pessoa chega sempre.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2" data-perfis>
          {(Object.keys(PERFIS_AVISO) as PerfilAviso[]).map((p) => {
            const info = PERFIS_AVISO[p]
            const ativo = perfilAtual === p
            return (
              <button key={p} type="button" onClick={() => aplicarPerfil(p)} aria-pressed={ativo} aria-label={`Perfil: ${info.titulo}${info.precisaDeSetor ? ` (${SETORES[setor]})` : ""}`}
                className={`rounded-lg border p-3 text-left text-sm hover:bg-white/5 ${ativo ? "border-emerald-400/60 bg-emerald-400/5" : "border-white/10"}`}>
                <span className="block font-medium text-zinc-100">{info.titulo}{info.precisaDeSetor ? ` (${SETORES[setor]})` : ""}</span>
                <span className="mt-0.5 block text-xs text-zinc-400">{info.resumo}</span>
              </button>
            )
          })}
        </div>
      </section>

      <p className="text-sm text-zinc-400" data-resumo>
        {perfilAtual && perfilAtual !== "padrao" ? `Perfil: ${PERFIS_AVISO[perfilAtual].titulo}${perfilAtual === "setor" ? ` (${SETORES[setor]})` : ""}. ` : ""}
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
                    onChange={(ev) => ehRecorte(ev.target.value) && mudar(e.categoria, { recorte: ev.target.value, setor: ev.target.value === "setor" ? (e.setor ?? setor) : null })}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200">
                    {(Object.keys(ROTULO_RECORTE) as (keyof typeof ROTULO_RECORTE)[]).map((rc) => (
                      <option key={rc} value={rc}>{rc === "setor" ? `Só do setor ${SETORES[e.setor ?? setor]} (e dos em que está)` : ROTULO_RECORTE[rc]}</option>
                    ))}
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
