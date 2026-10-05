"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import styles from "@/components/layout/TeamSurface.module.css"
import { Mail, Phone, MapPin, ExternalLink } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { mensagemDeErro, erroDaResposta } from "@/lib/erro-cliente"

type Membro = {
  id: string; nome: string; email: string | null; telefone: string | null
  papel: string; funcao: string; areas: string[]
}

type DesignerExterno = {
  id: string; nome: string; whatsapp: string | null; email: string | null
  cidade: string | null; estado: string | null; portfolio: string | null
  especialidade: string[]; status: "pendente" | "ativo"
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

      <DesignersExternos />
    </main>
  )
}

// Designers de fora que se cadastraram pela área pública da empresa
// ("Quer ser um designer?"). Pendente espera a equipe; aprovado fica na lista
// para a equipe chamar quando houver trabalho.
function DesignersExternos() {
  const { data, error, mutate } = useSWR<{ designers: DesignerExterno[] }>("/api/growth/designers", fetcher)
  const [decidindo, setDecidindo] = useState<string | null>(null)
  const designers = data?.designers ?? []
  if (error || !data) return null
  const pendentes = designers.filter(d => d.status === "pendente").length

  async function decidir(d: DesignerExterno, acao: "aprovar" | "recusar") {
    if (acao === "recusar" && !confirm(`Recusar o cadastro de "${d.nome}"?`)) return
    setDecidindo(d.id)
    try {
      const res = await fetch(`/api/growth/designers/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) })
      if (!res.ok) throw await erroDaResposta(res, "Não foi possível salvar a decisão.")
      toast.success(acao === "aprovar" ? `${d.nome} aprovado.` : `Cadastro de ${d.nome} recusado.`)
      await mutate()
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar a decisão."))
    } finally {
      setDecidindo(null)
    }
  }

  return (
    <section className="mt-10" aria-labelledby="titulo-designers">
      <h2 id="titulo-designers" className="text-base font-semibold text-zinc-200">Designers externos</h2>
      <p className="text-xs text-zinc-500 mt-1 mb-3">
        Cadastros feitos pela área pública da empresa.{pendentes > 0 ? ` ${pendentes} aguardando aprovação.` : ""}
      </p>
      {designers.length === 0 ? (
        <p className="text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-4">Nenhum designer externo ainda. O link de cadastro fica na página da empresa, em &quot;Quer ser um designer?&quot;.</p>
      ) : (
        <div className="space-y-2">
          {designers.map(d => (
            <div key={d.id} className={`grid grid-cols-[36px_minmax(0,1fr)] sm:grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-4 bg-zinc-900 border rounded-lg px-4 py-4 ${d.status === "pendente" ? "border-yellow-700/50" : "border-zinc-800"}`}>
              <div className="w-9 h-9 rounded-full bg-pink-500/15 text-pink-300 flex items-center justify-center font-semibold text-sm">{d.nome.charAt(0).toUpperCase()}</div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200 break-words">
                  {d.nome}
                  {d.status === "pendente" && <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full border bg-yellow-500/15 text-yellow-300 border-yellow-700">Pendente</span>}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 mt-0.5">
                  {d.whatsapp && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {d.whatsapp}</span>}
                  {d.email && <span className="flex items-start gap-1 min-w-0"><Mail className="w-3 h-3 shrink-0 mt-0.5" /><span className="break-all">{d.email}</span></span>}
                  {(d.cidade || d.estado) && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {[d.cidade, d.estado].filter(Boolean).join(" / ")}</span>}
                  {d.portfolio && <a href={d.portfolio} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-purple-300 hover:text-purple-200"><ExternalLink className="w-3 h-3" /> Portfólio</a>}
                </div>
                {d.especialidade.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {d.especialidade.map(e => <span key={e} className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">{e}</span>)}
                  </div>
                )}
              </div>
              {d.status === "pendente" && (
                <div className="col-start-2 sm:col-start-3 flex gap-2">
                  <button disabled={decidindo === d.id} onClick={() => decidir(d, "aprovar")} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium disabled:opacity-60">Aprovar</button>
                  <button disabled={decidindo === d.id} onClick={() => decidir(d, "recusar")} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 text-xs font-medium disabled:opacity-60">Recusar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
