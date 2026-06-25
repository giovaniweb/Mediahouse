"use client"

import useSWR from "swr"
import { Users, Mail, Phone } from "lucide-react"

type Membro = {
  id: string; nome: string; email: string | null; telefone: string | null
  papel: string; funcao: string; areas: string[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PAPEL_LABEL: Record<string, string> = {
  admin: "Admin", gestor: "Gestor", operacao: "Operação", solicitante: "Solicitante",
  social: "Social Media", designer: "Designer", editor: "Editor", videomaker: "Videomaker",
}

export default function EquipeGrowthPage() {
  const { data } = useSWR<{ equipe: Membro[] }>("/api/growth/equipe", fetcher)
  const equipe = data?.equipe ?? []

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2"><Users className="w-6 h-6 text-indigo-400" /> Equipe Growth</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Pessoas internas ativas com atuação em Growth · {equipe.length} no time.</p>
      </div>

      {equipe.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-sm text-zinc-400">Nenhuma pessoa marcada com a área <b>Growth</b> ainda.</p>
          <p className="text-xs text-zinc-600 mt-1">Em Pessoas &amp; Acessos, marque a categoria <b>Equipe interna</b> e a área <b>Growth / Conteúdos</b>.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {equipe.map((m) => (
            <div key={m.id} className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-indigo-500/15 text-indigo-300 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                {m.nome.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{m.nome}</p>
                <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                  {m.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {m.email}</span>}
                  {m.telefone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {m.telefone}</span>}
                </div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-300 border-indigo-500/25">{m.funcao}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full border bg-zinc-700/40 text-zinc-300 border-zinc-600/40">{PAPEL_LABEL[m.papel] ?? m.papel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
