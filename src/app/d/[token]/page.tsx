"use client"

import useSWR from "swr"
import { useParams } from "next/navigation"
import { Loader2, CalendarDays, CheckCircle2, Clock, Film, Sparkles, Download } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { formatarData } from "@/lib/datas"

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
  return formatarData(d, { day: "2-digit", month: "short", year: "numeric" }) || null
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

  const etapaLabel = ETAPAS[etapaAtual]?.label ?? "Em andamento"
  const progresso = Math.round(((etapaAtual + 1) / ETAPAS.length) * 100)

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Cabeçalho com a marca de quem compartilhou — a página é a cara da
          empresa para o cliente, não do NuFlow. */}
      <header className="border-b border-zinc-900 px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {d.organizacao?.logoUrl ? (
            <img
              src={d.organizacao.logoUrl}
              alt={d.organizacao.nome}
              className="w-8 h-8 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
              <Icone className="w-4 h-4 text-zinc-300" />
            </div>
          )}
          <span className="text-sm font-medium text-zinc-300">{d.organizacao?.nome ?? "NuFlow"}</span>
          <span className="ml-auto text-xs font-mono text-zinc-600">{d.codigo}</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-8">
        {/* O estado atual é a resposta que a pessoa veio buscar: vem primeiro,
            antes de título e descrição. */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className={
              entregue
                ? "text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30"
            }
          >
            {etapaLabel}
          </span>
          {fmt(d.dataLimite) && !entregue && (
            <span className="text-xs text-zinc-500">previsão {fmt(d.dataLimite)}</span>
          )}
          {fmt(d.finalizadaEm) && (
            <span className="text-xs text-emerald-400">entregue em {fmt(d.finalizadaEm)}</span>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">{d.titulo}</h1>
        {d.descricao && (
          <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed mb-8">{d.descricao}</p>
        )}

        {/* Material final em destaque, com prévia — é o que interessa quando
            chega. Antes era uma lista de links no fim da página. */}
        {entregue && finais.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
              Material final
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {finais.map((url, i) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900/60 hover:border-emerald-500/50 transition-colors"
                >
                  {d.thumbnailUrl && i === 0 ? (
                    <img src={d.thumbnailUrl} alt="" className="w-full aspect-video object-cover" />
                  ) : (
                    <div className="w-full aspect-video bg-zinc-800/60 flex items-center justify-center">
                      <Icone className="w-6 h-6 text-zinc-600" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <Download className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400 transition-colors shrink-0" />
                    <span className="text-xs text-zinc-300 truncate">
                      {d.arquivos[i]?.nomeArquivo ?? `Arquivo ${i + 1}`}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Linha do tempo horizontal: as seis etapas de uma vez, com quanto já
            andou. A lista vertical anterior obrigava a ler item por item. */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Andamento</h2>
            <span className="text-xs text-zinc-600">{progresso}%</span>
          </div>

          <div className="h-1 rounded-full bg-zinc-800 overflow-hidden mb-5">
            <div
              className={entregue ? "h-full bg-emerald-500" : "h-full bg-blue-500"}
              style={{ width: `${progresso}%` }}
            />
          </div>

          <ol className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4">
            {ETAPAS.map((etapa, i) => {
              const concluida = i < etapaAtual
              const atual = i === etapaAtual
              return (
                <li key={etapa.id} className="flex items-center gap-2">
                  {concluida ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : atual ? (
                    <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-zinc-700 shrink-0" />
                  )}
                  <span
                    className={
                      atual
                        ? "text-xs text-blue-300 font-medium"
                        : concluida
                        ? "text-xs text-zinc-400"
                        : "text-xs text-zinc-600"
                    }
                  >
                    {etapa.label}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500 mt-5">
          {fmt(d.createdAt) && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Aberta em {fmt(d.createdAt)}
            </span>
          )}
          {fmt(d.dataEvento) && <span>Evento em {fmt(d.dataEvento)}</span>}
        </div>

        <p className="text-[11px] text-zinc-700 mt-10">
          Acompanhamento somente leitura · NuFlow
        </p>
      </div>
    </main>
  )
}
