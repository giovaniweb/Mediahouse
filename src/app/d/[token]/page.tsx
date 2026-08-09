"use client"

import useSWR from "swr"
import { useParams } from "next/navigation"
import { Loader2, CalendarDays, CheckCircle2, Clock, Film, Sparkles } from "lucide-react"

// Acompanhamento público de uma demanda (somente leitura). Quem abre não tem
// conta no sistema — vê o andamento e o material final, nada além disso.

type Arquivo = { url: string; nomeArquivo: string | null; sequencia: number | null }
type Demanda = {
  codigo: string
  titulo: string
  descricao: string
  statusVisivel: string
  area: string
  tipoVideo: string | null
  dataLimite: string | null
  dataEvento: string | null
  finalizadaEm: string | null
  createdAt: string
  linkFinal: string | null
  thumbnailUrl: string | null
  arquivos: Arquivo[]
  organizacao: { nome: string; logoUrl: string | null } | null
}

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))

// Etapas na linguagem de quem acompanha de fora — sem jargão interno.
const ETAPAS = [
  { id: "entrada", label: "Recebido" },
  { id: "producao", label: "Em produção" },
  { id: "edicao", label: "Em edição" },
  { id: "aprovacao", label: "Em aprovação" },
  { id: "para_postar", label: "Aprovado" },
  { id: "finalizado", label: "Entregue" },
]

function fmt(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

export default function DemandaPublicaPage() {
  const params = useParams<{ token: string }>()
  const { data, error, isLoading } = useSWR<{ demanda: Demanda }>(
    params.token ? `/api/publico/demanda/${params.token}` : null,
    fetcher
  )

  if (isLoading) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-zinc-500" />
      </main>
    )
  }

  if (error || !data?.demanda) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-lg font-semibold text-zinc-200">Link indisponível</p>
          <p className="text-sm text-zinc-400 mt-2 max-w-sm">
            Este link de acompanhamento não existe mais ou foi revogado por quem compartilhou.
          </p>
        </div>
      </main>
    )
  }

  const d = data.demanda
  const etapaAtual = Math.max(0, ETAPAS.findIndex((e) => e.id === d.statusVisivel))
  const entregue = d.statusVisivel === "finalizado" || d.statusVisivel === "para_postar"
  const finais = d.arquivos.length > 0 ? d.arquivos.map((a) => a.url) : d.linkFinal ? [d.linkFinal] : []
  const Icone = d.area === "design" ? Sparkles : Film

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <header className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
            <Icone className="w-4 h-4 text-zinc-300" />
          </div>
          <div>
            <p className="text-xs text-zinc-500">{d.organizacao?.nome ?? "NuFlow"}</p>
            <p className="text-sm font-medium text-zinc-300">Acompanhamento · {d.codigo}</p>
          </div>
        </header>

        <h1 className="text-2xl font-bold mb-2">{d.titulo}</h1>
        <p className="text-sm text-zinc-400 whitespace-pre-wrap mb-8">{d.descricao}</p>

        {/* Linha do tempo */}
        <div className="border border-zinc-800 rounded-xl p-4 mb-6 bg-zinc-900/40">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">Andamento</p>
          <ol className="space-y-3">
            {ETAPAS.map((etapa, i) => {
              const concluida = i < etapaAtual
              const atual = i === etapaAtual
              return (
                <li key={etapa.id} className="flex items-center gap-3">
                  {concluida ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : atual ? (
                    <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-zinc-700 shrink-0" />
                  )}
                  <span
                    className={
                      atual ? "text-sm text-blue-300 font-medium" : concluida ? "text-sm text-zinc-300" : "text-sm text-zinc-600"
                    }
                  >
                    {etapa.label}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>

        {/* Datas */}
        <div className="flex flex-wrap gap-4 text-xs text-zinc-400 mb-8">
          {fmt(d.createdAt) && (
            <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Aberta em {fmt(d.createdAt)}</span>
          )}
          {fmt(d.dataEvento) && <span>Evento: {fmt(d.dataEvento)}</span>}
          {fmt(d.dataLimite) && <span>Prazo: {fmt(d.dataLimite)}</span>}
          {fmt(d.finalizadaEm) && <span className="text-emerald-400">Entregue em {fmt(d.finalizadaEm)}</span>}
        </div>

        {/* Material final */}
        {entregue && finais.length > 0 && (
          <div className="border border-emerald-800/50 rounded-xl p-4 bg-emerald-500/5">
            <p className="text-sm font-semibold text-emerald-300 mb-3">Material final</p>
            <ul className="space-y-2">
              {finais.map((url, i) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-emerald-200 hover:text-emerald-100 underline underline-offset-2 break-all"
                  >
                    {d.arquivos[i]?.nomeArquivo ?? `Arquivo ${i + 1}`}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] text-zinc-600 mt-10">
          Página de acompanhamento somente leitura · NuFlow
        </p>
      </div>
    </main>
  )
}
