"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { toast } from "sonner"
import { Check, Copy, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { PageIntro } from "@/components/layout/PageIntro"
import { cn } from "@/lib/utils"
import { fetcher } from "@/lib/fetcher"
import { ORDEM_NO_PAINEL, ROTULO_NO_PAINEL, type EstadoNoPainel } from "@/lib/notas-fiscais-painel"

// Notas fiscais dos videomakers (Giovani, 12/11/2026): quem já mandou a nota,
// se foi cadastrada para pagamento e se foi paga, com quem marcou e quando.
// Regras em lib/notas-fiscais-painel.ts; dados em /api/notas-fiscais; as ações
// vão pela mesma rota da ficha (/api/jobs/[id]/nota).

type Marca = { em: string | null; por: string | null } | null
type Linha = {
  demandaId: string; codigo: string; cliente: string; tipo: string | null; dia: string | null; local: string | null
  videomaker: { id: string; nome: string } | null
  estado: EstadoNoPainel
  notaUrl: string | null; enviadaEm: string | null
  cadastrada: Marca; paga: Marca
  pagamento: { valor: string; chavePix: string | null; tipoPix: string | null; dadosBancarios: string | null; cpfCnpj: string | null } | null
}
type Resposta = { linhas: Linha[]; retrato: Record<EstadoNoPainel, number> & { total: number }; videomakers: { id: string; nome: string }[] }

const COR: Record<EstadoNoPainel, string> = {
  pendente: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  enviada: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  cadastrada: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  paga: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  sem_pedido: "bg-zinc-800 text-zinc-400 border-zinc-700",
}

const data = (v: string | null | undefined) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}
const dia = (v: string | null) => (v ? v.split("-").reverse().join("/") : null)
const quemQuando = (m: Marca) => m ? [m.por, data(m.em)].filter(Boolean).join(", ") : null
const finalDa = (c: string) => c.replace(/[^0-9a-z]/gi, "").slice(-4)

function Pix({ p }: { p: NonNullable<Linha["pagamento"]> }) {
  const [ver, setVer] = useState(false)
  if (!p.chavePix) return <span className="text-zinc-500">{p.dadosBancarios ? "Dados bancários" : "PIX não cadastrado"}</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-zinc-500">{p.tipoPix ?? "PIX"}</span>
      <span className="font-mono text-zinc-200">{ver ? p.chavePix : `•••• ${finalDa(p.chavePix)}`}</span>
      <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? "Esconder a chave PIX" : "Mostrar a chave PIX"} className="text-zinc-500 hover:text-zinc-200">
        {ver ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button type="button" aria-label="Copiar a chave PIX" className="text-zinc-500 hover:text-zinc-200"
        onClick={() => navigator.clipboard?.writeText(p.chavePix!).then(() => toast.success("Chave PIX copiada."), () => toast.error("Não deu para copiar."))}>
        <Copy className="w-3.5 h-3.5" />
      </button>
    </span>
  )
}

export default function NotasFiscaisPage() {
  const [de, setDe] = useState("")
  const [ate, setAte] = useState("")
  const [videomakerId, setVideomakerId] = useState("")
  const [estado, setEstado] = useState<EstadoNoPainel | "">("")
  const [agindo, setAgindo] = useState<string | null>(null)

  const qs = new URLSearchParams({ ...(de ? { de } : {}), ...(ate ? { ate } : {}), ...(videomakerId ? { videomakerId } : {}) }).toString()
  const { data: r, error, isLoading, mutate } = useSWR<Resposta>(`/api/notas-fiscais${qs ? `?${qs}` : ""}`, fetcher)
  const linhas = (r?.linhas ?? []).filter((l) => estado ? l.estado === estado : l.estado !== "sem_pedido")

  async function marcar(l: Linha, acao: "marcar_cadastrada" | "marcar_paga") {
    setAgindo(`${l.demandaId}:${acao}`)
    try {
      const res = await fetch(`/api/jobs/${l.demandaId}/nota`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) })
      const json = await res.json().catch(() => ({})) as { mensagem?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Não foi possível marcar.")
      toast.success(json.mensagem ?? "Pronto.")
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível marcar.")
    } finally { setAgindo(null) }
  }

  const botao = (l: Linha, acao: "marcar_cadastrada" | "marcar_paga", rotulo: string) => (
    <button type="button" onClick={() => marcar(l, acao)} disabled={!!agindo}
      className="inline-flex items-center gap-1 text-xs border border-zinc-700 text-zinc-200 hover:bg-zinc-800 px-2.5 py-1 rounded-lg disabled:opacity-50 whitespace-nowrap">
      {agindo === `${l.demandaId}:${acao}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}{rotulo}
    </button>
  )

  const inp = "bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200"

  return (
    <>
      <Header title="Notas Fiscais" />
      <PageIntro eyebrow="FINANCEIRO / NOTAS FISCAIS" title="Quem mandou a nota e se já foi paga."
        description="As gravações externas com material entregue ou concluídas. Marque quando a nota for cadastrada para pagamento e quando for paga." />
      <main className="flex-1 p-4 sm:p-6 max-w-6xl mx-auto w-full space-y-5">

        {/* Retrato: quantas em cada estado (clique filtra) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {ORDEM_NO_PAINEL.map((e) => (
            <button key={e} type="button" onClick={() => setEstado(estado === e ? "" : e)} aria-pressed={estado === e}
              className={cn("bg-zinc-900 border rounded-xl p-3 text-left transition-colors", estado === e ? "border-purple-500" : "border-zinc-800 hover:border-zinc-700")}>
              <p className="text-2xl font-bold text-zinc-100">{r?.retrato[e] ?? "–"}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{ROTULO_NO_PAINEL[e]}</p>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Gravação de
            <input type="date" className={inp} value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="text-xs text-zinc-400 flex flex-col gap-1">até
            <input type="date" className={inp} value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Videomaker
            <select className={inp} value={videomakerId} onChange={(e) => setVideomakerId(e.target.value)}>
              <option value="">Todos</option>
              {(r?.videomakers ?? []).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </label>
          {(de || ate || videomakerId || estado) && (
            <button type="button" onClick={() => { setDe(""); setAte(""); setVideomakerId(""); setEstado("") }} className="text-xs text-purple-300 hover:text-purple-200 pb-2">Limpar filtros</button>
          )}
        </div>
        {!estado && (r?.retrato.sem_pedido ?? 0) > 0 && (
          <p className="text-xs text-zinc-500">
            {r!.retrato.sem_pedido === 1 ? "1 gravação concluída sem pedido de nota (card antigo) fica" : `${r!.retrato.sem_pedido} gravações concluídas sem pedido de nota (cards antigos) ficam`} fora da lista.{" "}
            <button type="button" className="text-purple-300 hover:text-purple-200" onClick={() => setEstado("sem_pedido")}>Ver</button>
          </p>
        )}

        {error ? (
          <p className="text-sm text-red-400">{error instanceof Error ? error.message : "Não foi possível carregar as notas."}</p>
        ) : isLoading ? (
          <p className="text-sm text-zinc-500">Carregando…</p>
        ) : linhas.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-400">Nenhuma gravação neste filtro.</div>
        ) : (
          <ul className="space-y-2">
            {linhas.map((l) => (
              <li key={l.demandaId} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 grid gap-3 md:grid-cols-[1.4fr_1fr_1.2fr_15rem] md:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Link href={`/jobs/${l.demandaId}`} className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200">{l.codigo}</Link>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", COR[l.estado])}>{ROTULO_NO_PAINEL[l.estado]}</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-100 truncate">{l.cliente}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{[l.tipo, dia(l.dia), l.local].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-sm min-w-0">
                  <p className="text-zinc-200 truncate">{l.videomaker?.nome ?? "—"}</p>
                  {l.pagamento && <p className="text-[11px] text-zinc-400">{l.pagamento.valor}</p>}
                </div>
                <div className="text-xs space-y-1 min-w-0">
                  {l.pagamento && <Pix p={l.pagamento} />}
                  {l.pagamento?.cpfCnpj && <p className="text-zinc-500">CPF/CNPJ {l.pagamento.cpfCnpj}</p>}
                  <p className="text-zinc-500">
                    {l.paga ? `Paga${quemQuando(l.paga) ? ` — ${quemQuando(l.paga)}` : ""}`
                      : l.estado === "cadastrada" ? `Cadastrada${quemQuando(l.cadastrada) ? ` — ${quemQuando(l.cadastrada)}` : ""}`
                      : l.enviadaEm ? `Nota enviada em ${data(l.enviadaEm)}`
                      : l.estado === "pendente" ? "O videomaker ainda não mandou a nota." : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {l.notaUrl && (
                    <a href={l.notaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200 px-1 py-1">
                      <ExternalLink className="w-3.5 h-3.5" /> Nota
                    </a>
                  )}
                  {l.estado === "enviada" && botao(l, "marcar_cadastrada", "Cadastrada para pagamento")}
                  {l.estado === "cadastrada" && botao(l, "marcar_paga", "Paga")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
