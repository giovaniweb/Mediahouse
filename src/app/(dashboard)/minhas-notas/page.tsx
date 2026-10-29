"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { FileText, ExternalLink, Upload, Loader2, Check } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { PageIntro } from "@/components/layout/PageIntro"
import { cn } from "@/lib/utils"
import { fetcher } from "@/lib/fetcher"
import { ModalFormulario } from "@/components/demandas/ModalFormulario"
import { LIMITE_POR_NOTA, ROTULO_DA_NOTA, type EstadoDaNotaDoVideomaker } from "@/lib/notas-do-videomaker"

// Minhas notas fiscais (Giovani, 29/10/2026): só as gravações externas em que
// a nota foi pedida e ainda não foi mandada — o card antigo sem pedido sai — e
// uma nota pode cobrir várias gravações: marca as gravações, sobe o arquivo uma
// vez. Regras em lib/notas-do-videomaker.ts; rota em /api/me/notas.

type Gravacao = { id: string; codigo: string; cliente: string; quando: string | null; estado: EstadoDaNotaDoVideomaker; nota?: string | null }

const COR: Record<EstadoDaNotaDoVideomaker, string> = {
  falta: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  refazer: "bg-red-500/15 text-red-400 border-red-500/30",
  recebida: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  compras: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  paga: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
}

function Etiqueta({ estado }: { estado: EstadoDaNotaDoVideomaker }) {
  return <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", COR[estado])}>{ROTULO_DA_NOTA[estado]}</span>
}

export default function MinhasNotasPage() {
  const { data, mutate, isLoading } = useSWR<{ paraEnviar: Gravacao[]; enviadas: Gravacao[] }>("/api/me/notas", fetcher)
  const paraEnviar = data?.paraEnviar ?? []
  const enviadas = data?.enviadas ?? []
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)

  // Só valem as marcadas que ainda esperam nota (a lista recarrega depois do envio).
  const escolhidas = paraEnviar.filter((g) => marcadas.has(g.id))
  // Uma nota cobre até LIMITE_POR_NOTA gravações; "Marcar todas" marca até lá.
  const cabem = paraEnviar.slice(0, LIMITE_POR_NOTA)
  const todas = paraEnviar.length > 0 && escolhidas.length === cabem.length
  const cheia = escolhidas.length >= LIMITE_POR_NOTA

  function marcar(id: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual)
      if (nova.has(id)) nova.delete(id)
      else if (nova.size < LIMITE_POR_NOTA) nova.add(id)
      return nova
    })
  }

  function abrirEnvio(ids?: string[]) {
    if (ids) setMarcadas(new Set(ids))
    setArquivo(null)
    setAberto(true)
  }

  async function enviar() {
    if (!arquivo || escolhidas.length === 0 || enviando) return
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append("arquivo", arquivo)
      fd.append("demandaIds", JSON.stringify(escolhidas.map((g) => g.id)))
      const r = await fetch("/api/me/notas", { method: "POST", body: fd })
      const json = await r.json().catch(() => ({})) as { mensagem?: string; error?: string }
      if (!r.ok) throw new Error(json.error ?? "Não foi possível enviar a nota.")
      toast.success(json.mensagem ?? "Nota enviada.")
      setAberto(false); setArquivo(null); setMarcadas(new Set())
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a nota.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Header title="Minhas Notas Fiscais" />
      <PageIntro eyebrow="FINANCEIRO / NOTAS FISCAIS" title="Suas notas e seus pagamentos." description="Envie a nota das gravações que pedem nota. Uma nota pode cobrir várias gravações: marque todas e envie uma vez." />
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{paraEnviar.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Esperando nota</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-zinc-100">{enviadas.filter((g) => g.estado !== "paga").length}</p>
            <p className="text-xs text-zinc-500 mt-1">Enviadas, a pagar</p>
          </div>
          <div className="bg-zinc-900 border border-emerald-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{enviadas.filter((g) => g.estado === "paga").length}</p>
            <p className="text-xs text-zinc-500 mt-1">Pagas</p>
          </div>
        </div>

        {/* Esperando nota, com seleção */}
        <section aria-labelledby="titulo-para-enviar">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 id="titulo-para-enviar" className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" aria-hidden />
              Gravações esperando a sua nota
              <span className="text-xs bg-zinc-800 text-zinc-500 rounded-full px-2 py-0.5 border border-zinc-700">{paraEnviar.length}</span>
            </h2>
            {paraEnviar.length > 1 && (
              <button type="button" onClick={() => setMarcadas(todas ? new Set() : new Set(cabem.map((g) => g.id)))}
                className="text-xs text-purple-300 hover:text-purple-200">
                {todas ? "Desmarcar todas" : paraEnviar.length > LIMITE_POR_NOTA ? `Marcar as ${LIMITE_POR_NOTA} primeiras` : "Marcar todas"}
              </button>
            )}
          </div>
          {cheia && paraEnviar.length > LIMITE_POR_NOTA && (
            <p className="text-xs text-zinc-500 mb-3">Uma nota cobre até {LIMITE_POR_NOTA} gravações. Envie esta e marque as outras depois.</p>
          )}

          {isLoading ? (
            <p className="text-sm text-zinc-500">Carregando…</p>
          ) : paraEnviar.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
              <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" aria-hidden />
              <p className="text-zinc-400 text-sm">Nenhuma gravação esperando nota.</p>
              <p className="text-xs text-zinc-600 mt-1">Quando o seu material chegar, a gravação aparece aqui.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {paraEnviar.map((g) => {
                const marcada = marcadas.has(g.id)
                return (
                  <li key={g.id} className={cn("bg-zinc-900 border rounded-lg p-4 flex items-center gap-4", marcada ? "border-purple-500/60" : "border-zinc-800")}>
                    <input type="checkbox" checked={marcada} onChange={() => marcar(g.id)} disabled={!marcada && cheia} aria-label={`Incluir ${g.cliente} (${g.codigo}) nesta nota`}
                      className="h-4 w-4 shrink-0 accent-purple-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-mono text-zinc-500">{g.codigo}</span>
                        <Etiqueta estado={g.estado} />
                      </div>
                      <p className="text-sm font-medium text-zinc-200 truncate">{g.cliente}</p>
                      {g.quando && <p className="text-[11px] text-zinc-500 mt-1">Gravação: {g.quando}</p>}
                    </div>
                    <button type="button" onClick={() => abrirEnvio([g.id])}
                      className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0">
                      <Upload className="w-3.5 h-3.5" aria-hidden /> Anexar NF
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Enviadas: o que já foi conferido e pago */}
        {enviadas.length > 0 && (
          <section aria-labelledby="titulo-enviadas">
            <h2 id="titulo-enviadas" className="text-sm font-semibold text-zinc-200 mb-3">Notas enviadas</h2>
            <ul className="space-y-2">
              {enviadas.map((g) => (
                <li key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-mono text-zinc-500">{g.codigo}</span>
                      <Etiqueta estado={g.estado} />
                    </div>
                    <p className="text-sm font-medium text-zinc-200 truncate">{g.cliente}</p>
                    {g.quando && <p className="text-[11px] text-zinc-500 mt-1">Gravação: {g.quando}</p>}
                  </div>
                  {g.nota && (
                    <a href={g.nota} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 shrink-0">
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden /> Ver NF
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* Barra da seleção: uma nota para as gravações marcadas. */}
      {escolhidas.length > 0 && !aberto && (
        <div className="sticky bottom-4 z-30 px-6">
          {/* Botão junto da contagem, à esquerda: o canto direito é do "No que você está?". */}
          <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-4 rounded-xl border border-purple-500/40 bg-zinc-900/95 backdrop-blur px-4 py-3 shadow-lg">
            <span className="text-sm text-zinc-200">{escolhidas.length} {escolhidas.length === 1 ? "gravação marcada" : "gravações marcadas"}</span>
            <button type="button" onClick={() => abrirEnvio()}
              className="flex items-center gap-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold">
              <Upload className="w-4 h-4" aria-hidden /> Enviar uma nota para {escolhidas.length === 1 ? "esta gravação" : `as ${escolhidas.length}`}
            </button>
          </div>
        </div>
      )}

      <ModalFormulario aberto={aberto} titulo="Enviar nota fiscal" icone={Upload} aoTentarFechar={() => !enviando && setAberto(false)}
        aoConfirmar={() => void enviar()} rotuloConfirmar={enviando ? "Enviando…" : "Enviar nota"} ocupado={enviando || !arquivo} className="max-w-lg">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-1.5">{escolhidas.length === 1 ? "Esta nota é da gravação" : `Esta nota cobre ${escolhidas.length} gravações`}</p>
            <ul className="space-y-1 text-sm text-zinc-300">
              {escolhidas.map((g) => <li key={g.id}>{g.cliente} <span className="text-xs text-zinc-500">({g.codigo})</span></li>)}
            </ul>
          </div>
          <label className="block border-2 border-dashed border-zinc-700 rounded-xl p-6 text-center cursor-pointer hover:border-purple-500 hover:bg-purple-500/5 focus-within:border-purple-500 transition-all">
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="sr-only" aria-label="Arquivo da nota fiscal"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            {arquivo ? (
              <p className="text-sm text-zinc-200 flex items-center justify-center gap-2"><FileText className="w-5 h-5 text-purple-400" aria-hidden />{arquivo.name}</p>
            ) : (
              <>
                <Upload className="w-8 h-8 text-zinc-600 mx-auto mb-2" aria-hidden />
                <p className="text-sm text-zinc-400">Clique para escolher o arquivo</p>
                <p className="text-xs text-zinc-600 mt-1">PDF, PNG ou JPG, até 20 MB</p>
              </>
            )}
          </label>
          {enviando && <p className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />Enviando a nota…</p>}
        </div>
      </ModalFormulario>
    </>
  )
}
