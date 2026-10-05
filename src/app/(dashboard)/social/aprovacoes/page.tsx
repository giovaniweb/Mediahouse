"use client"

// Social Media → Aprovações: o que a social precisa revisar dos próprios
// pedidos. Cada um abre a aprovação que já existe (/aprovar/[token]) — a mesma
// do vídeo e do criativo do Audiovisual e do Growth. Só ela aprova o que pediu.
import useSWR from "swr"
import { ExternalLink } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { fetcher } from "@/lib/fetcher"
import { diaDaPostagem, etapaDoPedido } from "@/lib/social-quadro"
import type { RespostaQuadro } from "@/components/social/tipos"

export default function SocialAprovacoesPage() {
  const { data, error, isLoading } = useSWR<RespostaQuadro>("/api/social", fetcher, { refreshInterval: 30000 })
  const revisar = (data?.cards ?? []).filter((c) =>
    c.demanda && etapaDoPedido(c.demanda.statusVisivel, c.demanda.statusInterno) === "revisar")
  const minhas = revisar.filter((c) => c.podeMexer)
  const outras = revisar.filter((c) => !c.podeMexer)

  return (
    <div className="flex h-full flex-col">
      <Header title="Social Media · Aprovações" />
      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Para revisar</h1>
        <p className="mt-1 text-sm text-zinc-400">A equipe terminou e mandou para você. Abra, confira e aprove ou peça ajuste.</p>
        {error && <p role="alert" className="mt-6 text-sm text-red-400">Não foi possível carregar. Recarregue a página.</p>}
        {isLoading && <p className="mt-6 text-sm text-zinc-500">Carregando…</p>}
        {data && minhas.length === 0 && outras.length === 0 && (
          <p className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-6 text-center text-sm text-zinc-400">Nada para revisar agora.</p>
        )}
        <Lista cards={minhas} acao />
        {outras.length > 0 && (
          <>
            <h2 className="mt-8 text-sm font-semibold text-zinc-300">Das outras linhas (só acompanhar)</h2>
            <p className="text-xs text-zinc-500">Quem aprova é a social media de cada linha.</p>
            <Lista cards={outras} />
          </>
        )}
      </div>
    </div>
  )
}

function Lista({ cards, acao }: { cards: RespostaQuadro["cards"]; acao?: boolean }) {
  if (cards.length === 0) return null
  return (
    <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => {
        const dia = diaDaPostagem(c.dataPostagem)
        return (
          <li key={c.id} className="flex flex-col gap-2 rounded-2xl border border-purple-400/40 bg-zinc-950/70 p-4">
            <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
              <span className={c.area === "design" ? "rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300" : "rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-fuchsia-300"}>
                {c.area === "design" ? "Arte · Growth" : "Vídeo · Audiovisual"}
              </span>
              {c.linha && <span className="rounded-full bg-white/5 px-2 py-0.5 text-zinc-400">{c.linha}</span>}
              {dia && <span className="rounded-full bg-white/5 px-2 py-0.5 tabular-nums text-zinc-400">posta {dia.slice(8, 10)}/{dia.slice(5, 7)}</span>}
            </div>
            <h3 className="text-sm font-semibold text-zinc-100">{c.titulo}</h3>
            <p className="font-mono text-[11px] text-zinc-500">{c.demanda!.codigo} · {c.demanda!.responsaveis.join(", ") || "sem responsável"}</p>
            {c.demanda!.tokenAprovacao
              ? acao && (
                <a href={`/aprovar/${c.demanda!.tokenAprovacao}`} target="_blank" rel="noreferrer"
                  className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500">
                  Revisar e aprovar <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )
              : <p className="text-xs text-zinc-400">A equipe ainda vai mandar a prévia.</p>}
          </li>
        )
      })}
    </ul>
  )
}
