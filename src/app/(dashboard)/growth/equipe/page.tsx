"use client"

import useSWR from "swr"
import styles from "@/components/layout/TeamSurface.module.css"
import { Mail, Phone } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

type Membro = {
  id: string; nome: string; email: string | null; telefone: string | null
  papel: string; funcao: string; areas: string[]
}


const PAPEL_LABEL: Record<string, string> = {
  admin: "Admin", gestor: "Gestor", operacao: "Operação", solicitante: "Solicitante",
  social: "Social Media", designer: "Designer", editor: "Editor", videomaker: "Videomaker",
}

export default function EquipeGrowthPage() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<{ equipe: Membro[] }>("/api/growth/equipe", fetcher)
  const equipe = data?.equipe ?? []

  return (
    <main className={styles.page}>
      <div className="mb-5">
        <p className={styles.eyebrow}>GROWTH / EQUIPE</p>
        <h1 className={styles.title}>Quem transforma ideias em conteúdo.</h1>
        <p className={styles.subtitle}>Pessoas internas ativas com atuação em Growth.{!error && data ? ` ${equipe.length} no time.` : ""}</p>
      </div>

      {error ? <div role="alert" className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <p>Não foi possível carregar a equipe Growth.</p>
        <button disabled={isValidating} onClick={() => mutate()} className="mt-3 px-4 border rounded-lg">{isValidating ? "Tentando novamente…" : "Tentar novamente"}</button>
      </div> : isLoading ? <p role="status">Carregando equipe Growth…</p> : equipe.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-sm text-zinc-400">Nenhuma pessoa marcada com a área <b>Growth</b> ainda.</p>
          <p className="text-xs text-zinc-600 mt-1">Em Pessoas &amp; Acessos, marque a categoria <b>Equipe interna</b> e a área <b>Growth / Conteúdos</b>.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {equipe.map((m) => (
            <div key={m.id} className="grid grid-cols-[36px_minmax(0,1fr)] sm:grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-4 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-4">
              <div className="w-9 h-9 rounded-full bg-indigo-500/15 text-indigo-300 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                {m.nome.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 break-words">{m.nome}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 mt-0.5">
                  {m.email && <span className="flex items-start gap-1 min-w-0"><Mail className="w-3 h-3 shrink-0 mt-0.5" /><span className="break-all">{m.email}</span></span>}
                  {m.telefone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {m.telefone}</span>}
                </div>
              </div>
              <div className="col-start-2 sm:col-start-3 flex flex-wrap gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-300 border-indigo-500/25">{m.funcao}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full border bg-zinc-700/40 text-zinc-300 border-zinc-600/40">{PAPEL_LABEL[m.papel] ?? m.papel}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
