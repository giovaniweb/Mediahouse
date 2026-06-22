"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { toast } from "sonner"
import {
  Ban,
  Check,
  CircleAlert,
  ExternalLink,
  Inbox,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { Header } from "@/components/layout/Header"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then(async (res) => {
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Falha ao carregar")
  return data
})

interface ParsedFields {
  solicitanteNome?: string
  motivoViagem?: string
  viajanteNome?: string
  clienteEvento?: string
  enderecoCompleto?: string
  dataAgendamentoRaw?: string
  equipamento?: string
  precisaVideomaker?: boolean
  precisaCaixaMineira?: boolean
  observacoes?: string
}

interface InboxEmail {
  id: string
  assunto: string
  remetenteNome: string | null
  remetenteEmail: string
  recebidoEm: string
  corpoTexto: string
  status: string
  erro: string | null
  dadosExtraidos: {
    fields?: ParsedFields
  } | null
  demanda: { id: string; codigo: string; titulo: string } | null
}

interface MessagesResponse {
  emails: InboxEmail[]
  counts: { total: number; revisao: number; criados: number; erros: number }
}

const statusStyle: Record<string, { label: string; className: string }> = {
  pronto: { label: "Pronto", className: "text-emerald-300 bg-emerald-950/60 border-emerald-900" },
  revisao: { label: "Revisar", className: "text-amber-300 bg-amber-950/60 border-amber-900" },
  processando: { label: "Processando", className: "text-blue-300 bg-blue-950/60 border-blue-900" },
  criado: { label: "Demanda criada", className: "text-emerald-300 bg-emerald-950/60 border-emerald-900" },
  ignorado: { label: "Ignorado", className: "text-zinc-400 bg-zinc-800 border-zinc-700" },
  erro: { label: "Erro", className: "text-red-300 bg-red-950/60 border-red-900" },
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))
}

export default function CaixaEntradaPage() {
  const [filter, setFilter] = useState("todos")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const messagesUrl = `/api/email-inbox/messages?status=${filter}&limit=100`
  const { data, mutate, error } = useSWR<MessagesResponse>(messagesUrl, fetcher, {
    refreshInterval: 30000,
  })

  const tabs = useMemo(() => [
    { id: "todos", label: "Todos", count: data?.counts.total ?? 0 },
    { id: "revisao", label: "A revisar", count: data?.counts.revisao ?? 0 },
    { id: "criado", label: "Criados", count: data?.counts.criados ?? 0 },
    { id: "erro", label: "Erros", count: data?.counts.erros ?? 0 },
  ], [data])

  async function emailAction(id: string, acao: "criar_demanda" | "reprocessar" | "ignorar") {
    setActionId(id)
    try {
      const res = await fetch(`/api/email-inbox/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Falha na ação")
      toast.success(
        acao === "criar_demanda"
          ? `Demanda ${json.codigo} criada`
          : acao === "ignorar"
            ? "E-mail ignorado"
            : "E-mail reprocessado"
      )
      await mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setActionId(null)
    }
  }

  return (
    <>
      <Header title="Caixa de Entrada" />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex items-center gap-1 border-b border-zinc-800">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={cn(
                  "h-10 border-b-2 px-3 text-sm transition-colors",
                  filter === tab.id
                    ? "border-zinc-100 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                )}
              >
                {tab.label} <span className="ml-1 text-xs text-zinc-600">{tab.count}</span>
              </button>
            ))}
          </div>

          {error ? (
            <div className="border-y border-red-950 bg-red-950/20 px-4 py-8 text-center text-sm text-red-300">
              {error.message}
            </div>
          ) : !data ? (
            <div className="flex h-40 items-center justify-center text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : data.emails.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center border-b border-zinc-800 text-center">
              <Inbox className="mb-3 h-8 w-8 text-zinc-700" />
              <p className="text-sm text-zinc-400">Nenhum e-mail recebido</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800 border-y border-zinc-800">
              {data.emails.map((email) => {
                const status = statusStyle[email.status] ?? statusStyle.revisao
                const fields = email.dadosExtraidos?.fields
                const isExpanded = expanded === email.id
                const busy = actionId === email.id
                return (
                  <article key={email.id} className="py-4">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : email.id)}
                      className="flex w-full items-start gap-4 text-left"
                    >
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-zinc-600" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-zinc-100">{email.assunto}</p>
                          <span className={cn("rounded border px-1.5 py-0.5 text-[11px]", status.className)}>
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          {email.remetenteNome || email.remetenteEmail} · {formatDate(email.recebidoEm)}
                        </p>
                      </div>
                      {email.demanda && (
                        <span className="shrink-0 text-xs text-emerald-400">{email.demanda.codigo}</span>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="ml-6 mt-4 border-l border-zinc-800 pl-4">
                        {fields && (
                          <dl className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
                            {[
                              ["Solicitante", fields.solicitanteNome],
                              ["Viajante", fields.viajanteNome],
                              ["Cliente / evento", fields.clienteEvento],
                              ["Agendamento", fields.dataAgendamentoRaw],
                              ["Equipamento", fields.equipamento],
                              ["Videomaker", fields.precisaVideomaker === undefined ? null : fields.precisaVideomaker ? "Sim" : "Não"],
                              ["Endereço", fields.enderecoCompleto],
                              ["Observações", fields.observacoes],
                            ].filter(([, value]) => value).map(([label, value]) => (
                              <div key={String(label)}>
                                <dt className="text-xs text-zinc-600">{label}</dt>
                                <dd className="mt-0.5 whitespace-pre-wrap text-zinc-300">{String(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        )}

                        {email.erro && (
                          <p className="mt-4 flex items-start gap-2 text-xs text-amber-400">
                            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {email.erro}
                          </p>
                        )}

                        <details className="mt-4">
                          <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400">
                            Ver e-mail original
                          </summary>
                          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
                            {email.corpoTexto}
                          </pre>
                        </details>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {email.demanda ? (
                            <Link
                              href={`/demandas/${email.demanda.id}`}
                              className="inline-flex h-8 items-center gap-2 rounded-md bg-zinc-100 px-3 text-xs font-medium text-zinc-950 hover:bg-white"
                            >
                              Abrir demanda <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          ) : (
                            <button
                              onClick={() => emailAction(email.id, "criar_demanda")}
                              disabled={busy}
                              className="inline-flex h-8 items-center gap-2 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              Criar demanda
                            </button>
                          )}
                          {!email.demanda && (
                            <>
                              <button
                                onClick={() => emailAction(email.id, "reprocessar")}
                                disabled={busy}
                                className="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                              >
                                <RefreshCw className="h-3.5 w-3.5" /> Reprocessar
                              </button>
                              <button
                                onClick={() => emailAction(email.id, "ignorar")}
                                disabled={busy}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
                                title="Ignorar entrada"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
