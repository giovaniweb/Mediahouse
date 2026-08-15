"use client"

// Aba Equipes — quem trabalha junto, e quanta carga o grupo aguenta.
//
// Substitui a necessidade da aba "Videomakers Internos", que existia dentro de
// usuários e misturava duas perguntas: "quem são as pessoas" e "como está a
// equipe". A primeira é a aba Pessoas; esta é a segunda.
//
// Sem tabela nova: as equipes vêm de `areas`, que já existe na membership. Uma
// tabela própria só se justifica quando houver equipe fora das áreas atuais.

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { Users, AlertTriangle, ChevronDown, ChevronRight, Crown } from "lucide-react"

type Membro = { id: string; nome: string; funcao: string; lider: boolean; capacidade: number | null; emAndamento: number }
type Equipe = {
  nome: string; totalMembros: number; lideres: string[]
  capacidadeTotal: number | null; emAndamento: number; sobrecarregados: number
  membros: Membro[]
}

export function AbaEquipes({ onAbrirPessoa }: { onAbrirPessoa: (id: string) => void }) {
  const [aberta, setAberta] = useState<string | null>(null)
  const { data, isLoading, error } = useSWR<{ equipes: Equipe[] }>("/api/equipes", fetcher)

  if (error) return <p className="text-sm text-rose-400">Não foi possível carregar as equipes.</p>
  if (isLoading && !data) return <p className="text-sm text-zinc-500">Carregando…</p>

  const equipes = data?.equipes ?? []

  return (
    <div className="space-y-3">
      {equipes.map((e) => {
        const expandida = aberta === e.nome
        const acima = e.capacidadeTotal !== null && e.emAndamento > e.capacidadeTotal
        return (
          <div key={e.nome} className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <button
              onClick={() => setAberta(expandida ? null : e.nome)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors"
            >
              {expandida ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
              <span className="flex-1 min-w-0">
                <span className="block text-zinc-100 font-medium">{e.nome}</span>
                <span className="block text-[11px] text-zinc-500 truncate">
                  {e.totalMembros} {e.totalMembros === 1 ? "pessoa" : "pessoas"}
                  {e.lideres.length > 0 && ` · lidera: ${e.lideres.slice(0, 2).join(", ")}`}
                </span>
              </span>

              <span className="flex items-center gap-4 shrink-0">
                <Metrica rotulo="Em curso" valor={e.emAndamento} />
                <Metrica
                  rotulo="Capacidade"
                  valor={e.capacidadeTotal ?? "—"}
                  cor={acima ? "text-amber-400" : undefined}
                />
                {e.sobrecarregados > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-rose-400" title={`${e.sobrecarregados} acima da capacidade`}>
                    <AlertTriangle className="w-3.5 h-3.5" /> {e.sobrecarregados}
                  </span>
                )}
              </span>
            </button>

            {expandida && (
              <div className="border-t border-zinc-800 divide-y divide-zinc-800/60">
                {e.membros.map((m) => {
                  const sobrecarregado = m.capacidade !== null && m.emAndamento > m.capacidade
                  return (
                    <button
                      key={m.id}
                      onClick={() => onAbrirPessoa(m.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-800/40 transition-colors"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 text-sm text-zinc-200">
                          {m.nome}
                          {m.lider && <Crown className="w-3 h-3 text-amber-400" aria-label="Líder" />}
                        </span>
                        <span className="block text-[11px] text-zinc-500 truncate">{m.funcao || "—"}</span>
                      </span>
                      <span className={`text-xs tabular-nums shrink-0 ${sobrecarregado ? "text-rose-400" : "text-zinc-400"}`}>
                        {m.emAndamento}{m.capacidade !== null ? ` / ${m.capacidade}` : ""}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {equipes.length === 0 && (
        <p className="text-sm text-zinc-500 text-center py-10">
          <Users className="w-6 h-6 mx-auto mb-2 opacity-40" />
          Nenhuma equipe com pessoas ativas.
        </p>
      )}
    </div>
  )
}

function Metrica({ rotulo, valor, cor }: { rotulo: string; valor: number | string; cor?: string }) {
  return (
    <span className="text-right">
      <span className="block text-[10px] uppercase tracking-wide text-zinc-600">{rotulo}</span>
      <span className={`block text-sm font-semibold tabular-nums ${cor ?? "text-zinc-300"}`}>{valor}</span>
    </span>
  )
}
