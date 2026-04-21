"use client"

import { Calendar, Clock, AlertTriangle, CreditCard, CheckCircle } from "lucide-react"
import Link from "next/link"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(r => r.json())

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/10 ${className ?? ""}`} />
}

interface EventoHoje {
  id: string
  titulo: string
  inicio: string
  local?: string | null
  videomaker?: { nome: string } | null
  demanda?: { codigo: string; titulo: string } | null
}

interface DemandaCritica {
  id: string
  codigo: string
  titulo: string
  dataLimite: string
  prioridade: string
  videomaker?: { nome: string } | null
}

interface CustoVencendo {
  id: string
  descricao: string
  valor: number
  dataVencimento: string
  videomaker?: { nome: string } | null
}

interface AlertaCritico {
  id: string
  titulo: string
  mensagem: string
  severidade: string
  demanda?: { id: string; codigo: string; titulo: string } | null
}

interface HojeData {
  eventosHoje: EventoHoje[]
  demandasCriticas: DemandaCritica[]
  custosVencendo: CustoVencendo[]
  alertasCriticos: AlertaCritico[]
  geradoEm: string
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function formatData(iso: string) {
  const d = new Date(iso)
  const hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return "Hoje"
  const amanha = new Date(hoje)
  amanha.setDate(hoje.getDate() + 1)
  if (d.toDateString() === amanha.toDateString()) return "Amanhã"
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function formatValor(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
}

function isVencido(iso: string) {
  return new Date(iso) < new Date()
}

export function HojeEmFoco() {
  const { data, isLoading } = useSWR<HojeData>("/api/dashboard/hoje", fetcher, {
    refreshInterval: 60_000,
  })

  const total =
    (data?.eventosHoje.length ?? 0) +
    (data?.demandasCriticas.length ?? 0) +
    (data?.custosVencendo.length ?? 0) +
    (data?.alertasCriticos.length ?? 0)

  return (
    <div className="mb-8 rounded-2xl bg-gradient-to-br from-indigo-950/80 via-purple-950/60 to-zinc-900/80 border border-indigo-800/40 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-indigo-800/30">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <h2 className="font-semibold text-white text-base">Hoje em Foco</h2>
          {!isLoading && data && (
            <span className="text-xs text-indigo-300/70 ml-1">
              {data.geradoEm && `atualizado às ${new Date(data.geradoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
            </span>
          )}
        </div>
        {!isLoading && total === 0 && (
          <div className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            Agenda limpa 🎉
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-indigo-800/30">

        {/* Eventos Hoje */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-semibold text-sky-300 uppercase tracking-wider">Eventos hoje</span>
            {!isLoading && data && (
              <span className="ml-auto text-xs bg-sky-900/50 text-sky-300 rounded-full px-2 py-0.5">
                {data.eventosHoje.length}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : data?.eventosHoje.length ? (
            <ul className="space-y-2">
              {data.eventosHoje.map(ev => (
                <li key={ev.id} className="bg-sky-950/40 rounded-lg px-3 py-2 border border-sky-800/30">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm text-white font-medium leading-tight line-clamp-1">{ev.titulo}</span>
                    <span className="text-xs text-sky-300 whitespace-nowrap shrink-0">{formatHora(ev.inicio)}</span>
                  </div>
                  {ev.videomaker && (
                    <span className="text-xs text-sky-400/70">{ev.videomaker.nome}</span>
                  )}
                  {ev.local && (
                    <span className="text-xs text-zinc-400 block truncate">📍 {ev.local}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500 italic">Nenhum evento hoje</p>
          )}
        </div>

        {/* Prazos Hoje/Amanhã */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Prazos urgentes</span>
            {!isLoading && data && (
              <span className="ml-auto text-xs bg-amber-900/50 text-amber-300 rounded-full px-2 py-0.5">
                {data.demandasCriticas.length}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : data?.demandasCriticas.length ? (
            <ul className="space-y-2">
              {data.demandasCriticas.map(d => (
                <li key={d.id} className="bg-amber-950/40 rounded-lg px-3 py-2 border border-amber-800/30">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/demandas/${d.id}`} className="text-sm text-white font-medium leading-tight line-clamp-1 hover:text-amber-300 transition-colors">
                      {d.codigo}
                    </Link>
                    <span className={`text-xs whitespace-nowrap shrink-0 font-medium ${isVencido(d.dataLimite) ? "text-red-400" : "text-amber-300"}`}>
                      {formatData(d.dataLimite)}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400 block truncate">{d.titulo}</span>
                  {d.videomaker && (
                    <span className="text-xs text-amber-400/70">{d.videomaker.nome}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500 italic">Nenhum prazo urgente</p>
          )}
        </div>

        {/* Cobranças Vencendo */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-rose-400" />
            <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">Cobranças</span>
            {!isLoading && data && (
              <span className={`ml-auto text-xs rounded-full px-2 py-0.5 ${data.custosVencendo.length > 0 ? "bg-rose-900/70 text-rose-300" : "bg-zinc-800 text-zinc-400"}`}>
                {data.custosVencendo.length}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : data?.custosVencendo.length ? (
            <ul className="space-y-2">
              {data.custosVencendo.map(c => (
                <li key={c.id} className="bg-rose-950/40 rounded-lg px-3 py-2 border border-rose-800/30">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm text-white font-medium leading-tight line-clamp-1">{c.descricao}</span>
                    <span className="text-xs text-rose-300 whitespace-nowrap shrink-0 font-semibold">
                      R$ {formatValor(c.valor)}
                    </span>
                  </div>
                  {c.videomaker && (
                    <span className="text-xs text-rose-400/70">{c.videomaker.nome}</span>
                  )}
                  {c.dataVencimento && (
                    <span className={`text-xs font-medium ${isVencido(c.dataVencimento) ? "text-red-400" : "text-amber-300"}`}>
                      {isVencido(c.dataVencimento) ? "⚠️ Vencido" : `Vence ${formatData(c.dataVencimento)}`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500 italic">Nenhuma cobrança pendente</p>
          )}
        </div>

        {/* Alertas Críticos */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs font-semibold text-red-300 uppercase tracking-wider">Alertas críticos</span>
            {!isLoading && data && (
              <span className={`ml-auto text-xs rounded-full px-2 py-0.5 ${data.alertasCriticos.length > 0 ? "bg-red-900/70 text-red-300" : "bg-zinc-800 text-zinc-400"}`}>
                {data.alertasCriticos.length}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : data?.alertasCriticos.length ? (
            <ul className="space-y-2">
              {data.alertasCriticos.map(a => (
                <li key={a.id} className="bg-red-950/40 rounded-lg px-3 py-2 border border-red-800/30">
                  <p className="text-sm text-white font-medium leading-tight line-clamp-1">{a.titulo}</p>
                  <p className="text-xs text-zinc-400 line-clamp-1">{a.mensagem}</p>
                  {a.demanda && (
                    <Link href={`/demandas/${a.demanda.id}`} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                      {a.demanda.codigo}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500 italic">Nenhum alerta crítico</p>
          )}
        </div>

      </div>
    </div>
  )
}
