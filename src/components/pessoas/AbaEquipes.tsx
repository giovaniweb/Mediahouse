"use client"

// Aba Equipes — as áreas de atuação vistas como time, não como checkbox.
//
// Equipe aqui NÃO é um model novo: é `areas` da membership, o mesmo campo que
// decide qual quadro de demandas a pessoa enxerga. Foi de propósito — um model
// `Equipe` duplicaria a fonte da verdade e criaria o dia em que a pessoa está
// no time Audiovisual e não vê o quadro do Audiovisual.
//
// A barra mede quanto do time está de pé, não produtividade: "9 de 12 ativos"
// é o que faz alguém agir numa tela de cadastro.

import { Film, Sparkles, CalendarRange, Users, UserX } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type PessoaLista, AREA_LABEL, AREA_ACENTO, AREA_PONTO, nivelDe,
  iniciais, corAvatar,
} from "@/lib/pessoas-ui"

const ICONE_AREA: Record<string, React.ElementType> = {
  audiovisual: Film,
  growth: Sparkles,
  eventos: CalendarRange,
}

function areasVisiveis(): string[] {
  return [
    "audiovisual",
    "growth",
    "eventos",
  ]
}

function PilhaAvatares({ pessoas }: { pessoas: PessoaLista[] }) {
  const mostrar = pessoas.slice(0, 5)
  const resto = pessoas.length - mostrar.length
  return (
    <div className="flex items-center">
      {mostrar.map((p, i) => (
        <div
          key={p.id}
          title={p.nome}
          style={{ zIndex: mostrar.length - i }}
          className={cn(
            "w-7 h-7 rounded-full ring-2 ring-zinc-900 flex items-center justify-center text-[10px] font-semibold overflow-hidden",
            i > 0 && "-ml-2",
            corAvatar(p.id),
          )}
        >
          {p.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
            : iniciais(p.nome)}
        </div>
      ))}
      {resto > 0 && (
        <div className="-ml-2 w-7 h-7 rounded-full ring-2 ring-zinc-900 bg-zinc-800 text-zinc-400 flex items-center justify-center text-[10px] font-semibold">
          +{resto}
        </div>
      )}
    </div>
  )
}

function CardEquipe({ area, pessoas, onAbrir }: {
  area: string
  pessoas: PessoaLista[]
  onAbrir: () => void
}) {
  const Icone = ICONE_AREA[area] ?? Users
  const ativos = pessoas.filter(p => p.status === "ativo").length
  const lideres = pessoas.filter(p => ["supervisor", "lider"].includes(nivelDe(p))).length
  const pct = pessoas.length > 0 ? Math.round((ativos / pessoas.length) * 100) : 0

  return (
    <button
      onClick={onAbrir}
      className="text-left rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-700 hover:bg-zinc-900 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", AREA_ACENTO[area] ?? "bg-zinc-800 text-zinc-400")}>
          <Icone className="w-4 h-4" />
        </div>
      </div>
      <p className="text-sm font-semibold text-zinc-100 mt-3">{AREA_LABEL[area] ?? area}</p>
      <p className="text-xs text-zinc-500 mt-0.5">
        {pessoas.length} {pessoas.length === 1 ? "pessoa" : "pessoas"}
        {lideres > 0 && ` · ${lideres} ${lideres === 1 ? "líder" : "líderes"}`}
      </p>

      <div className="mt-3 h-8 flex items-center">
        {pessoas.length > 0 ? <PilhaAvatares pessoas={pessoas} /> : <span className="text-xs text-zinc-600 italic">time vazio</span>}
      </div>

      <div className="mt-3">
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", AREA_PONTO[area] ?? "bg-zinc-500")} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-zinc-500 mt-1.5">
          {ativos}/{pessoas.length} {ativos === 1 ? "ativo" : "ativos"} · {pct}%
        </p>
      </div>
    </button>
  )
}

export function AbaEquipes({ pessoas, onAbrirEquipe }: {
  pessoas: PessoaLista[]
  /** Leva para a aba Pessoas já filtrada por essa equipe (`""` = sem equipe). */
  onAbrirEquipe: (area: string) => void
}) {
  const areas = areasVisiveis()
  const semEquipe = pessoas.filter(p => (p.areas?.length ?? 0) === 0)

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Equipe é a área em que a pessoa atua — a mesma que decide o quadro de demandas que ela enxerga.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {areas.map(area => (
          <CardEquipe
            key={area}
            area={area}
            pessoas={pessoas.filter(p => (p.areas ?? []).includes(area))}
            onAbrir={() => onAbrirEquipe(area)}
          />
        ))}

        {semEquipe.length > 0 && (
          <button
            onClick={() => onAbrirEquipe("")}
            className="text-left rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-4 hover:border-zinc-700 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-zinc-800 text-zinc-500 flex items-center justify-center">
              <UserX className="w-4 h-4" />
            </div>
            <p className="text-sm font-semibold text-zinc-300 mt-3">Sem equipe</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {semEquipe.length} {semEquipe.length === 1 ? "pessoa" : "pessoas"}
            </p>
            <div className="mt-3 h-8 flex items-center">
              <PilhaAvatares pessoas={semEquipe} />
            </div>
            <p className="text-[11px] text-zinc-500 mt-3 pt-[7px]">
              Não aparecem em nenhum quadro de demandas.
            </p>
          </button>
        )}
      </div>
    </div>
  )
}
