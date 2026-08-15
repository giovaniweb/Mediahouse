"use client"

// Pessoas & Acessos — a pessoa como unidade.
//
// Substitui as três abas que particionavam por `Usuario.tipo` (Sistema /
// Videomakers Ext / Videomakers Int). Aquela divisão contava pessoas por tipo
// enquanto /equipe e /videomakers contavam fichas profissionais — por isso a
// mesma equipe aparecia como 3, 6 ou 7 conforme a tela.
//
// Aqui há uma lista só. Vínculo, função e equipe viraram FILTROS, não abas: a
// mesma pessoa pode ser interna, videomaker e líder ao mesmo tempo, e isso deixa
// de exigir que ela exista em três lugares.

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Header } from "@/components/layout/Header"
import { fetcher } from "@/lib/fetcher"
import { PainelPessoa } from "@/components/pessoas/PainelPessoa"
import { AbaEquipes } from "@/components/pessoas/AbaEquipes"
import { LABEL_VINCULO, LABEL_NIVEL, type Vinculo, type Nivel } from "@/lib/pessoas-vocabulario"
import {
  Search, Users, UserCheck, UserX, MoreHorizontal, Plus,
  Camera, Clapperboard, Palette, ExternalLink,
} from "lucide-react"

type Pessoa = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  status: string
  funcao: string
  equipes: string[]
  vinculo: Vinculo
  nivel: Nivel
  perfilAcesso: string
  capacidades: { captacao: boolean; edicao: boolean; design: boolean }
  ultimoAcesso: string | null
}

type Resposta = {
  pessoas: Pessoa[]
  resumo: { total: number; ativas: number; inativas: number; porVinculo: Record<string, number> }
  equipes: string[]
  mostrando: number
}

const inputCls =
  "bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500/30"

const COR_VINCULO: Record<Vinculo, string> = {
  interno: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  parceiro: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  cliente: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  sistema: "bg-zinc-700/60 text-zinc-400 border-zinc-600",
}

const GRUPOS = [
  { id: "todos", label: "Todos" },
  { id: "gestao", label: "Gestão" },
  { id: "executores", label: "Executores" },
  { id: "solicitantes", label: "Solicitantes" },
  { id: "inativos", label: "Inativos" },
]

export default function PessoasPage() {
  const [grupo, setGrupo] = useState("todos")
  const [busca, setBusca] = useState("")
  const [buscaAtiva, setBuscaAtiva] = useState("")
  const [vinculo, setVinculo] = useState("")
  const [equipe, setEquipe] = useState("")
  const [nivel, setNivel] = useState("")
  const [menuAberto, setMenuAberto] = useState<string | null>(null)
  const [pessoaAberta, setPessoaAberta] = useState<string | null>(null)
  const [abaAtiva, setAbaAtiva] = useState<"pessoas" | "equipes">("pessoas")

  const params = new URLSearchParams({ grupo })
  if (buscaAtiva) params.set("busca", buscaAtiva)
  if (vinculo) params.set("vinculo", vinculo)
  if (equipe) params.set("equipe", equipe)
  if (nivel) params.set("nivel", nivel)

  const { data, isLoading, error } = useSWR<Resposta>(`/api/pessoas?${params}`, fetcher, {
    keepPreviousData: true,
  })

  const pessoas = data?.pessoas ?? []
  const r = data?.resumo

  return (
    <>
      <Header title="Pessoas & Acessos" />

      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <p className="text-sm text-zinc-500 max-w-xl">
            Gerencie pessoas, equipes e níveis de acesso ao NuFlow.
          </p>
          <Link
            href="/usuarios"
            className="flex items-center gap-1.5 text-sm bg-purple-600 text-white px-3.5 py-2 rounded-lg hover:bg-purple-700"
          >
            <Plus className="w-3.5 h-3.5" /> Nova pessoa
          </Link>
        </div>

        {/* Abas — Equipes e Perfis chegam nas fases 3 e 4 */}
        <div className="flex gap-1 border-b border-zinc-800">
          {([["pessoas", "Pessoas"], ["equipes", "Equipes"]] as const).map(([id, rot]) => (
            <button
              key={id}
              onClick={() => setAbaAtiva(id)}
              className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
                abaAtiva === id
                  ? "font-medium text-zinc-100 border-purple-500"
                  : "text-zinc-500 border-transparent hover:text-zinc-300"
              }`}
            >
              {rot}
            </button>
          ))}
          <span className="px-4 py-2 text-sm text-zinc-600 cursor-not-allowed" title="Chega na fase 4">
            Perfis de Acesso
          </span>
        </div>

        {abaAtiva === "equipes" ? (
          <AbaEquipes onAbrirPessoa={setPessoaAberta} />
        ) : (
        <>
        {/* Resumo. Conta a MESMA lista da tabela — era daí que vinha a divergência. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icone={Users} rotulo="Total de pessoas" valor={r?.total} cor="text-zinc-200" />
          <Card icone={UserCheck} rotulo="Ativas" valor={r?.ativas} cor="text-emerald-400" />
          <Card icone={UserX} rotulo="Inativas" valor={r?.inativas} cor="text-rose-400" />
          <Card icone={Camera} rotulo="Parceiros" valor={r?.porVinculo?.parceiro} cor="text-amber-400" />
        </div>

        {/* Filtros rápidos */}
        <div className="flex flex-wrap gap-1.5">
          {GRUPOS.map((g) => (
            <button
              key={g.id}
              onClick={() => setGrupo(g.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                grupo === g.id
                  ? "bg-purple-600/20 border-purple-500/50 text-purple-200"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Busca + filtros combináveis */}
        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => { e.preventDefault(); setBuscaAtiva(busca) }}
            className="flex items-center gap-2 flex-1 min-w-[16rem]"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, e-mail, equipe ou função…"
                className={`${inputCls} w-full pl-9`}
              />
            </div>
          </form>

          <select value={vinculo} onChange={(e) => setVinculo(e.target.value)} className={inputCls}>
            <option value="">Todos os vínculos</option>
            {(["interno", "parceiro", "cliente", "sistema"] as Vinculo[]).map((v) => (
              <option key={v} value={v}>{LABEL_VINCULO[v]}</option>
            ))}
          </select>

          <select value={equipe} onChange={(e) => setEquipe(e.target.value)} className={inputCls}>
            <option value="">Todas as equipes</option>
            {(data?.equipes ?? []).map((e) => <option key={e} value={e}>{e}</option>)}
          </select>

          <select value={nivel} onChange={(e) => setNivel(e.target.value)} className={inputCls}>
            <option value="">Todos os níveis</option>
            {(["supervisor", "lider", "executor", "solicitante"] as Nivel[]).map((n) => (
              <option key={n} value={n}>{LABEL_NIVEL[n]}</option>
            ))}
          </select>
        </div>

        {error ? (
          <p className="text-sm text-rose-400">Não foi possível carregar as pessoas.</p>
        ) : (
          <>
            <p className="text-xs text-zinc-500">
              {isLoading && !data ? "Carregando…" : `Mostrando ${data?.mostrando ?? 0} de ${r?.total ?? 0} pessoas`}
            </p>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-x-auto">
              <table className="w-full text-sm min-w-[64rem]">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-[11px] uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-medium">Pessoa</th>
                    <th className="text-left px-3 py-2.5 font-medium w-40">Função</th>
                    <th className="text-left px-3 py-2.5 font-medium w-36">Equipe</th>
                    <th className="text-left px-3 py-2.5 font-medium w-28">Vínculo</th>
                    <th className="text-left px-3 py-2.5 font-medium w-28">Nível</th>
                    <th className="text-left px-3 py-2.5 font-medium w-32">Capacidades</th>
                    <th className="text-left px-3 py-2.5 font-medium w-24">Status</th>
                    <th className="text-right px-4 py-2.5 font-medium w-16">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pessoas.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40">
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setPessoaAberta(p.id)}
                          className="block text-left text-zinc-200 truncate hover:text-purple-300 transition-colors w-full"
                        >
                          {p.nome}
                        </button>
                        {p.email && <span className="block text-[11px] text-zinc-500 truncate">{p.email}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-400 truncate">{p.funcao || "—"}</td>
                      <td className="px-3 py-2.5">
                        {p.equipes.length > 0 ? (
                          <span className="text-xs text-zinc-300">{p.equipes.join(", ")}</span>
                        ) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${COR_VINCULO[p.vinculo]}`}>
                          {LABEL_VINCULO[p.vinculo]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs">{LABEL_NIVEL[p.nivel]}</td>
                      <td className="px-3 py-2.5">
                        {/* A capacidade É a existência da ficha — substitui podeEditar/fazCaptacao */}
                        <span className="flex items-center gap-1.5">
                          {p.capacidades.captacao && <Camera className="w-3.5 h-3.5 text-indigo-400" aria-label="Captação" />}
                          {p.capacidades.edicao && <Clapperboard className="w-3.5 h-3.5 text-fuchsia-400" aria-label="Edição" />}
                          {p.capacidades.design && <Palette className="w-3.5 h-3.5 text-amber-400" aria-label="Design" />}
                          {!p.capacidades.captacao && !p.capacidades.edicao && !p.capacidades.design && (
                            <span className="text-zinc-600">—</span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${
                          p.status === "ativo"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-zinc-700/60 text-zinc-400"
                        }`}>
                          {p.status === "ativo" ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right relative">
                        <button
                          onClick={() => setMenuAberto(menuAberto === p.id ? null : p.id)}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700"
                          aria-label={`Ações de ${p.nome}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuAberto === p.id && (
                          <>
                            <span className="fixed inset-0 z-10" onClick={() => setMenuAberto(null)} />
                            <span className="absolute right-4 top-9 z-20 w-52 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl py-1 text-left">
                              {/* Fase 2 traz o painel lateral; por ora as ações levam
                                  ao fluxo que já existe, sem reimplementar nada. */}
                              <button
                                onClick={() => { setPessoaAberta(p.id); setMenuAberto(null) }}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 w-full text-left"
                              >
                                <Users className="w-3.5 h-3.5" /> Ver detalhes
                              </button>
                              <Link
                                href="/usuarios"
                                className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Editar em Usuários
                              </Link>
                              {p.capacidades.captacao && (
                                <Link href="/videomakers" className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">
                                  <Camera className="w-3.5 h-3.5" /> Ficha de captação
                                </Link>
                              )}
                              {p.capacidades.edicao && (
                                <Link href="/equipe" className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">
                                  <Clapperboard className="w-3.5 h-3.5" /> Ficha de edição
                                </Link>
                              )}
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}

                  {pessoas.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                        <Users className="w-6 h-6 mx-auto mb-2 opacity-40" />
                        Nenhuma pessoa encontrada com esses filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
        </>
        )}
      </div>

      <PainelPessoa pessoaId={pessoaAberta} onFechar={() => setPessoaAberta(null)} />
    </>
  )
}

function Card({ icone: Icone, rotulo, valor, cor }: {
  icone: React.ComponentType<{ className?: string }>
  rotulo: string
  valor?: number
  cor: string
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 uppercase tracking-wide">
        <Icone className="w-3.5 h-3.5" /> {rotulo}
      </span>
      <span className={`block mt-1 text-2xl font-semibold tabular-nums ${cor}`}>
        {valor ?? "—"}
      </span>
    </div>
  )
}
