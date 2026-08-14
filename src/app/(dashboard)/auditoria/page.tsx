"use client"

// Registro de auditoria: o que aconteceu no sistema, por período e por pessoa.
//
// O histórico já era gravado, mas só dava para ver dentro de cada card — para
// responder "o que mudou ontem" ou "o que fulano fez esta semana" era preciso
// abrir demanda por demanda. Toda empresa que compra software acaba fazendo essa
// pergunta, e até agora o sistema não tinha resposta.

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Header } from "@/components/layout/Header"
import { fetcher } from "@/lib/fetcher"
import { hojeEmSaoPaulo, somarDias } from "@/lib/datas"
import { LABEL_STATUS } from "@/components/demandas/tipos-visao"
import { EVENTO_EDICAO, EVENTO_RESPONSAVEL } from "@/lib/status"
import { ChevronLeft, ChevronRight, Search, ScrollText, ExternalLink } from "lucide-react"

type Registro = {
  id: string
  statusAnterior: string | null
  statusNovo: string
  observacao: string | null
  origem: string
  createdAt: string
  usuario: { id: string; nome: string } | null
  demanda: { id: string; codigo: string; titulo: string } | null
}

const inputCls =
  "bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500/30"

// Cada origem do histórico ganha uma cor: o olho separa o que foi pessoa do que
// foi automação sem precisar ler.
const COR_ORIGEM: Record<string, string> = {
  manual: "bg-zinc-700/60 text-zinc-300",
  kanban: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30",
  automacao: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  ia: "bg-purple-500/15 text-purple-300 border border-purple-500/30",
  whatsapp: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
}

function descrever(r: Registro): string {
  if (r.observacao) return r.observacao
  if (r.statusNovo === EVENTO_EDICAO) return "Editou a demanda"
  if (r.statusNovo === EVENTO_RESPONSAVEL) return "Alterou o responsável"
  const de = r.statusAnterior ? (LABEL_STATUS[r.statusAnterior] ?? r.statusAnterior) : null
  const para = LABEL_STATUS[r.statusNovo] ?? r.statusNovo
  return de ? `${de} → ${para}` : `Entrou em ${para}`
}

export default function AuditoriaPage() {
  const [de, setDe] = useState(() => somarDias(hojeEmSaoPaulo(), -7))
  const [ate, setAte] = useState(() => hojeEmSaoPaulo())
  const [usuarioId, setUsuarioId] = useState("")
  const [tipo, setTipo] = useState("")
  const [busca, setBusca] = useState("")
  const [buscaAtiva, setBuscaAtiva] = useState("")
  const [pagina, setPagina] = useState(1)

  const params = new URLSearchParams({ de, ate, pagina: String(pagina) })
  if (usuarioId) params.set("usuarioId", usuarioId)
  if (tipo) params.set("tipo", tipo)
  if (buscaAtiva) params.set("busca", buscaAtiva)

  const { data, isLoading, error } = useSWR<{
    registros: Registro[]; total: number; temMais: boolean
  }>(`/api/auditoria?${params}`, fetcher, { keepPreviousData: true })

  const { data: pessoas } = useSWR<{ responsaveis: { id: string; nome: string }[] }>(
    "/api/growth/responsaveis?area=todas",
    fetcher
  )

  function trocarFiltro(fn: () => void) {
    fn()
    setPagina(1)
  }

  const registros = data?.registros ?? []

  return (
    <>
      <Header title="Registro de Auditoria" />

      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">De</label>
            <input type="date" value={de} onChange={(e) => trocarFiltro(() => setDe(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Até</label>
            <input type="date" value={ate} onChange={(e) => trocarFiltro(() => setAte(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Pessoa</label>
            <select value={usuarioId} onChange={(e) => trocarFiltro(() => setUsuarioId(e.target.value))} className={inputCls}>
              <option value="">Todas</option>
              {(pessoas?.responsaveis ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Tipo</label>
            <select value={tipo} onChange={(e) => trocarFiltro(() => setTipo(e.target.value))} className={inputCls}>
              <option value="">Tudo</option>
              <option value="status">Mudança de coluna</option>
              <option value="edicao">Edição de campo</option>
              <option value="responsavel">Troca de responsável</option>
            </select>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); trocarFiltro(() => setBuscaAtiva(busca)) }}
            className="flex items-end gap-2"
          >
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Buscar</label>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="código, título ou texto"
                className={`${inputCls} w-56`}
              />
            </div>
            <button type="submit" className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-500">
              <Search className="w-3.5 h-3.5" /> Buscar
            </button>
          </form>
        </div>

        {error ? (
          <p className="text-sm text-rose-400">
            Não foi possível carregar o registro. Esta tela é restrita a gestores.
          </p>
        ) : (
          <>
            <p className="text-xs text-zinc-500">
              {isLoading && !data ? "Carregando…" : `${data?.total ?? 0} registro(s) no período`}
            </p>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-x-auto">
              <table className="w-full text-sm min-w-[46rem]">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-[11px] uppercase tracking-wide">
                    <th className="text-left px-3 py-2.5 font-medium w-40">Quando</th>
                    <th className="text-left px-3 py-2.5 font-medium w-40">Quem</th>
                    <th className="text-left px-3 py-2.5 font-medium w-44">Demanda</th>
                    <th className="text-left px-3 py-2.5 font-medium">O que aconteceu</th>
                    <th className="text-left px-3 py-2.5 font-medium w-28">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40">
                      <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap tabular-nums">
                        {new Date(r.createdAt).toLocaleString("pt-BR", {
                          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300 truncate">
                        {r.usuario?.nome ?? <span className="text-zinc-600">sistema</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.demanda ? (
                          <Link
                            href={`/demandas/${r.demanda.id}`}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-indigo-300 hover:text-indigo-200"
                            title={r.demanda.titulo}
                          >
                            {r.demanda.codigo}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300">{descrever(r)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${COR_ORIGEM[r.origem] ?? COR_ORIGEM.manual}`}>
                          {r.origem}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {registros.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-zinc-500">
                        <ScrollText className="w-6 h-6 mx-auto mb-2 opacity-40" />
                        Nada aconteceu no período escolhido.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {(pagina > 1 || data?.temMais) && (
              <div className="flex items-center justify-between">
                <button
                  disabled={pagina === 1}
                  onClick={() => setPagina((p) => p - 1)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 disabled:opacity-40 hover:border-zinc-500"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                </button>
                <span className="text-xs text-zinc-500">Página {pagina}</span>
                <button
                  disabled={!data?.temMais}
                  onClick={() => setPagina((p) => p + 1)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 disabled:opacity-40 hover:border-zinc-500"
                >
                  Próxima <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
