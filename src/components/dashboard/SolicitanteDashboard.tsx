"use client"

import useSWR from "swr"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Loader2, Plus, Inbox, AlertTriangle, CalendarDays, MapPin } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { formatarData } from "@/lib/datas"
import { cn } from "@/lib/utils"
import type { ResumoDoPedido } from "@/lib/meus-pedidos"

// "Meus Pedidos" — o painel de quem pede (solicitante). Sem quadro: a pessoa
// quer saber em que pé está cada pedido, e a próxima jogada, se for dela.
// Os textos vêm prontos de /api/meus-pedidos (lib/meus-pedidos.ts).

type Pedido = ResumoDoPedido & {
  id: string
  codigo: string
  titulo: string
  cliente: string | null
  prazo: string | null
  criadoEm: string
  atualizadoEm: string
  entregueEm: string | null
}

const PILULA: Record<Pedido["tom"], string> = {
  andamento: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  alerta: "bg-zinc-700/40 text-zinc-300 border-zinc-600/50",
  voce: "bg-amber-500/15 text-amber-300 border-amber-500/40",
}

const PASSO: Record<Pedido["passos"][number]["estado"], string> = {
  feito: "bg-emerald-500/70",
  agora: "bg-blue-400",
  depois: "bg-zinc-700",
  pulado: "bg-zinc-800",
}

function dia(d: string | null) {
  return d ? formatarData(d, { day: "2-digit", month: "short" }) : null
}

function LinhaDoPedido({ p }: { p: Pedido }) {
  const agora = p.passos.find((s) => s.estado === "agora")
  return (
    <Link
      href={`/demandas/${p.id}`}
      className={cn(
        "block bg-zinc-900 border rounded-xl p-4 hover:border-zinc-600 transition-colors",
        p.esperandoVoce ? "border-amber-500/40" : "border-zinc-800",
      )}
    >
      {/* No celular a etiqueta desce: lado a lado, uma frase longa espremia o título. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100 truncate">{p.cliente ?? p.titulo}</p>
          <p className="text-xs text-zinc-500 truncate">{p.codigo}{p.cliente ? ` · ${p.titulo}` : ""}</p>
        </div>
        <span className={cn("self-start text-xs px-2.5 py-1 rounded-full border shrink-0", PILULA[p.tom])}>{p.situacao}</span>
      </div>

      {p.passos.length > 0 && (
        <div className="mt-3">
          <div className="flex gap-1" aria-hidden>
            {p.passos.map((s, i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", PASSO[s.estado])} />)}
          </div>
          <p className="sr-only">Etapas: {p.passos.map((s) => `${s.rotulo} (${s.estado})`).join(", ")}</p>
          {agora && p.aberto && <p className="mt-1.5 text-[11px] text-zinc-500">Etapa agora: {agora.rotulo}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        {p.quando && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{p.quando}</span>}
        {p.onde && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{p.onde}</span>}
        {p.aberto && p.prazo && (
          <span className={cn("flex items-center gap-1", p.atrasada && "text-red-400")}>
            {p.atrasada && <AlertTriangle className="w-3 h-3" />}Prazo {dia(p.prazo)}{p.atrasada ? " (atrasado)" : ""}
          </span>
        )}
        {!p.aberto && p.entregueEm && <span>Concluído em {dia(p.entregueEm)}</span>}
        <span>Pedido em {dia(p.criadoEm)}</span>
        <span>Atualizado em {dia(p.atualizadoEm)}</span>
      </div>
    </Link>
  )
}

function Contador({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className={cn("bg-zinc-900 border rounded-xl px-4 py-3", destaque ? "border-amber-500/40" : "border-zinc-800")}>
      <p className={cn("text-2xl font-semibold", destaque ? "text-amber-300" : "text-zinc-100")}>{valor}</p>
      <p className="text-xs text-zinc-500">{rotulo}</p>
    </div>
  )
}

export function SolicitanteDashboard() {
  const { data: session } = useSession()
  const { data, isLoading, error } = useSWR<{ pedidos: Pedido[]; totalEncerrados: number }>(
    "/api/meus-pedidos", fetcher, { refreshInterval: 30000 },
  )
  const pedidos = data?.pedidos ?? []
  const esperando = pedidos.filter((p) => p.esperandoVoce)
  const andamento = pedidos.filter((p) => p.aberto && !p.esperandoVoce)
  const encerrados = pedidos.filter((p) => !p.aberto)
  const primeiroNome = session?.user?.name?.split(" ")[0]

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">{primeiroNome ? `Olá, ${primeiroNome}` : "Meus pedidos"}</h1>
          <p className="text-sm text-zinc-500">Em que pé está cada coisa que você pediu.</p>
        </div>
        <Link href="/demandas/nova" className="flex items-center gap-1.5 text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-2 rounded-lg">
          <Plus className="w-4 h-4" /> Novo pedido
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
      ) : error ? (
        <p className="text-sm text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-6 text-center">Não foi possível carregar seus pedidos agora. Tente de novo em instantes.</p>
      ) : pedidos.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Você ainda não fez nenhum pedido.</p>
        </div>
      ) : (
        <div className="space-y-7">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Contador valor={andamento.length} rotulo="Em andamento" />
            <Contador valor={esperando.length} rotulo="Esperando você" destaque={esperando.length > 0} />
            <Contador valor={data?.totalEncerrados ?? encerrados.length} rotulo="Concluídos" />
          </div>

          {esperando.length > 0 && (
            <section aria-labelledby="titulo-esperando">
              <h2 id="titulo-esperando" className="text-sm font-semibold text-amber-300 mb-2">Esperando você aprovar</h2>
              <div className="grid gap-2">{esperando.map((p) => <LinhaDoPedido key={p.id} p={p} />)}</div>
            </section>
          )}

          <section aria-labelledby="titulo-andamento">
            <h2 id="titulo-andamento" className="text-sm font-semibold text-zinc-300 mb-2">Em andamento</h2>
            {andamento.length === 0
              ? <p className="text-sm text-zinc-500">Nada em andamento.</p>
              : <div className="grid gap-2">{andamento.map((p) => <LinhaDoPedido key={p.id} p={p} />)}</div>}
          </section>

          {encerrados.length > 0 && (
            <section aria-labelledby="titulo-concluidos">
              <h2 id="titulo-concluidos" className="text-sm font-semibold text-zinc-300 mb-2">
                Concluídos{data && data.totalEncerrados > encerrados.length ? ` (os ${encerrados.length} mais recentes)` : ""}
              </h2>
              <div className="grid gap-2">{encerrados.map((p) => <LinhaDoPedido key={p.id} p={p} />)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
