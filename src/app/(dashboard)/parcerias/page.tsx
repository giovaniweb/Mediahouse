"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { fetcher } from "@/lib/fetcher"
import { Header } from "@/components/layout/Header"

type Parceria = {
  parceriaId: string
  organizacaoId: string
  nome: string
  status: "pendente" | "aceita" | "recusada" | "encerrada"
  papel: "convidante" | "convidada"
  criadoEm: string
  respondidoEm: string | null
}

const ROTULO: Record<Parceria["status"], string> = {
  pendente: "Aguardando resposta",
  aceita: "Ativa",
  recusada: "Recusada",
  encerrada: "Encerrada",
}

/**
 * Parcerias entre empresas — o aperto de mão que precede o espelhamento.
 *
 * Sem uma parceria aceita pelos dois lados, nenhuma empresa consegue colocar um
 * card no quadro de outra. É por isso que esta tela existe antes de qualquer
 * botão de "terceirizar": a relação vem primeiro, o job vem depois.
 */
export default function ParceriasPage() {
  const { data, mutate, isLoading } = useSWR<{ parcerias: Parceria[] }>("/api/parcerias", fetcher)
  const [slug, setSlug] = useState("")
  const [ocupado, setOcupado] = useState(false)

  const parcerias = data?.parcerias ?? []
  const ativas = parcerias.filter((p) => p.status === "aceita")
  const aResponder = parcerias.filter((p) => p.status === "pendente" && p.papel === "convidada")
  const enviadas = parcerias.filter((p) => p.status === "pendente" && p.papel === "convidante")
  const antigas = parcerias.filter((p) => p.status === "recusada" || p.status === "encerrada")

  async function convidar() {
    if (!slug.trim()) return
    setOcupado(true)
    try {
      const res = await fetch("/api/parcerias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slug.trim() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "Erro ao convidar")
      toast.success("Convite enviado. A outra empresa precisa aceitar.")
      setSlug("")
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao convidar")
    } finally {
      setOcupado(false)
    }
  }

  async function responder(p: Parceria, acao: "aceitar" | "recusar" | "encerrar") {
    if (acao === "encerrar" && !confirm(
      `Encerrar a parceria com ${p.nome}?\n\nOs cards já terceirizados continuam em execução — encerrar a relação não para um job no meio. Revogue card a card se for isso que você quer.`
    )) return
    setOcupado(true)
    try {
      const res = await fetch(`/api/parcerias/${p.parceriaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro")
      toast.success(acao === "aceitar" ? `Parceria com ${p.nome} ativa.` : "Feito.")
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setOcupado(false)
    }
  }

  const Linha = ({ p, acoes }: { p: Parceria; acoes?: React.ReactNode }) => (
    <li className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800/70 last:border-0">
      <span className="min-w-0">
        <span className="block text-sm text-zinc-200 truncate">{p.nome}</span>
        <span className="text-[11px] text-zinc-500">
          {ROTULO[p.status]}
          {p.papel === "convidante" ? " · você convidou" : " · convidou você"}
        </span>
      </span>
      <span className="flex items-center gap-2 shrink-0">{acoes}</span>
    </li>
  )

  return (
    <>
      <Header title="Parcerias" />
      <div className="p-4 md:p-6 space-y-5 max-w-3xl">
        <p className="text-sm text-zinc-400">
          Uma parceria permite terceirizar a execução de demandas para outra empresa do NuFlow —
          sem que o card mude de dono. Ela precisa ser aceita pelos dois lados antes do primeiro job.
        </p>

        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <h2 className="font-semibold text-zinc-300 mb-1">Convidar uma empresa</h2>
          <p className="text-xs text-zinc-500 mb-3">
            Use o identificador da empresa no NuFlow. Peça a ela — não há lista pública, e é assim
            de propósito.
          </p>
          <div className="flex gap-2">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") convidar() }}
              placeholder="ex.: produtora-parceira"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200"
            />
            <button
              onClick={convidar}
              disabled={!slug.trim() || ocupado}
              className="text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-100 px-4 py-1.5 rounded-lg disabled:opacity-40"
            >
              Convidar
            </button>
          </div>
        </div>

        {aResponder.length > 0 && (
          <section className="bg-zinc-900/50 rounded-xl border border-amber-500/30 overflow-hidden">
            <h2 className="font-semibold text-zinc-300 px-4 pt-3 pb-2">Esperando você</h2>
            <ul>
              {aResponder.map((p) => (
                <Linha key={p.parceriaId} p={p} acoes={
                  <>
                    <button onClick={() => responder(p, "aceitar")} disabled={ocupado}
                      className="text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg disabled:opacity-40">
                      Aceitar
                    </button>
                    <button onClick={() => responder(p, "recusar")} disabled={ocupado}
                      className="text-xs text-zinc-400 hover:text-red-400 px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-40">
                      Recusar
                    </button>
                  </>
                } />
              ))}
            </ul>
          </section>
        )}

        <section className="bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
          <h2 className="font-semibold text-zinc-300 px-4 pt-3 pb-2">Parcerias ativas</h2>
          {isLoading ? (
            <p className="px-4 pb-4 text-sm text-zinc-500">Carregando…</p>
          ) : ativas.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-zinc-500">Nenhuma ainda.</p>
          ) : (
            <ul>
              {ativas.map((p) => (
                <Linha key={p.parceriaId} p={p} acoes={
                  <button onClick={() => responder(p, "encerrar")} disabled={ocupado}
                    className="text-xs text-zinc-400 hover:text-red-400 px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-40">
                    Encerrar
                  </button>
                } />
              ))}
            </ul>
          )}
        </section>

        {enviadas.length > 0 && (
          <section className="bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
            <h2 className="font-semibold text-zinc-300 px-4 pt-3 pb-2">Convites enviados</h2>
            <ul>{enviadas.map((p) => <Linha key={p.parceriaId} p={p} />)}</ul>
          </section>
        )}

        {antigas.length > 0 && (
          <section className="bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden opacity-70">
            <h2 className="font-semibold text-zinc-400 px-4 pt-3 pb-2">Histórico</h2>
            {/* Recusada e encerrada continuam listadas: a prova de que a relação
                existiu é o que uma auditoria pede, e apagar seria reescrever o
                passado para deixar a tela mais limpa. */}
            <ul>{antigas.map((p) => <Linha key={p.parceriaId} p={p} />)}</ul>
          </section>
        )}
      </div>
    </>
  )
}
