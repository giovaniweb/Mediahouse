"use client"

// Social Media → Equipe: as social medias da empresa e as linhas de cada uma.
// Gestor e admin marcam quem cuida de qual linha; os outros só veem.
import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Header } from "@/components/layout/Header"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"

type Pessoa = { usuarioId: string; nome: string; papel: string; temWhatsapp?: boolean; linhas?: string[] }
type Resposta = { podeEditar: boolean; linhas: { id: string; nome: string }[]; socials: Pessoa[]; outros: Pessoa[] }

export default function SocialEquipePage() {
  const { data, error, isLoading, mutate } = useSWR<Resposta>("/api/social/equipe", fetcher)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [extra, setExtra] = useState<Pessoa[]>([])

  async function salvar(p: Pessoa, linhaIds: string[]) {
    setSalvando(p.usuarioId)
    try {
      const res = await fetch("/api/social/equipe", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId: p.usuarioId, linhaIds }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? "Não foi possível salvar.")
      toast.success(`Linhas de ${p.nome.split(" ")[0]} atualizadas.`)
      await mutate()
      setExtra((e) => e.filter((x) => x.usuarioId !== p.usuarioId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.")
    } finally {
      setSalvando(null)
    }
  }

  const pessoas = [...(data?.socials ?? []), ...extra.filter((x) => !data?.socials.some((s) => s.usuarioId === x.usuarioId))]

  return (
    <div className="flex h-full flex-col">
      <Header title="Social Media · Equipe" />
      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Equipe de social media</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Cada social media cuida de uma ou mais linhas de produto e só vê o planejamento delas. As linhas são as de Produtos → Linhas / Projetos.
          {data && (data.podeEditar
            ? " Clique na linha para ligar ou desligar a pessoa; a linha marcada em roxo é dela."
            : " Só gestor ou admin muda quem cuida de qual linha.")}
        </p>
        {error && <p role="alert" className="mt-6 text-sm text-red-400">Não foi possível carregar. Recarregue a página.</p>}
        {isLoading && <p className="mt-6 text-sm text-zinc-500">Carregando…</p>}
        {data && data.linhas.length === 0 && (
          <p className="mt-6 text-sm text-amber-200">Nenhuma linha de produto ativa. Cadastre em Produtos → Linhas / Projetos.</p>
        )}
        {data && pessoas.length === 0 && (
          <p className="mt-6 text-sm text-zinc-400">Ninguém com o cargo Social Media nesta empresa ainda.</p>
        )}

        <ul className="mt-5 grid gap-3">
          {pessoas.map((p) => {
            const marcadas = p.linhas ?? []
            return (
              <li key={p.usuarioId} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-zinc-100">{p.nome}</h2>
                  <span className="text-xs text-zinc-500">
                    {p.papel === "social" ? "Social media" : p.papel}
                    {p.temWhatsapp === false && " · sem WhatsApp cadastrado"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data!.linhas.map((l) => {
                    const on = marcadas.includes(l.id)
                    return (
                      <button key={l.id} type="button" disabled={!data!.podeEditar || salvando === p.usuarioId} aria-pressed={on}
                        onClick={() => salvar(p, on ? marcadas.filter((x) => x !== l.id) : [...marcadas, l.id])}
                        className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-default",
                          on ? "border-purple-500 bg-purple-600/20 text-purple-100" : "border-zinc-700 text-zinc-400 enabled:hover:border-zinc-500",
                          !data!.podeEditar && !on && "hidden")}>
                        {l.nome}
                      </button>
                    )
                  })}
                  {!data!.podeEditar && marcadas.length === 0 && <span className="text-xs text-zinc-500">Nenhuma linha ainda.</span>}
                </div>
              </li>
            )
          })}
        </ul>

        {data?.podeEditar && data.outros.length > 0 && (
          <label className="mt-6 block max-w-sm text-xs font-medium text-zinc-400">
            Pôr outra pessoa como social de uma linha
            <select value="" onChange={(e) => {
              const p = data.outros.find((o) => o.usuarioId === e.target.value)
              if (p) setExtra((x) => [...x, { ...p, linhas: [] }])
            }} className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100">
              <option value="">Escolher pessoa…</option>
              {data.outros.filter((o) => !extra.some((x) => x.usuarioId === o.usuarioId)).map((o) => (
                <option key={o.usuarioId} value={o.usuarioId}>{o.nome}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}
