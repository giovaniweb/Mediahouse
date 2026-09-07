"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { acoesDoVideomaker, type AcaoVideomaker } from "@/lib/job-fase"
import { NFUploadModal } from "@/components/demandas/NFUploadModal"
import type { StatusInterno } from "@prisma/client"

// A barra de ações do videomaker (§13).
//
// "Evitar menus complexos, telas com excesso de informação, drag-and-drop,
// mudança manual de status." Aqui não há seletor de status: há no máximo duas
// ações, e são as que cabem no estado atual. Quem decide quais é
// `acoesDoVideomaker`, e um teste garante que toda ação oferecida é aceita pela
// guarda do servidor — a tela não pode prometer o que o backend recusa.
//
// Fica no topo e grudada na base em telas estreitas: no celular, a ação é a
// razão de o videomaker abrir o Job.

export function AcoesVideomaker({
  jobId,
  statusInterno,
  captacaoIniciada,
  onExecutado,
}: {
  jobId: string
  statusInterno: StatusInterno
  /** Veio do histórico: o início da captação é evento, não status. */
  captacaoIniciada: boolean
  onExecutado: () => void
}) {
  const acoes = acoesDoVideomaker(statusInterno, { captacaoIniciada })
  const [emCurso, setEmCurso] = useState<string | null>(null)
  const [erro, setErro] = useState("")
  // Ação que pediu confirmação (motivo da recusa ou link do material).
  const [pedindo, setPedindo] = useState<AcaoVideomaker | null>(null)
  const [texto, setTexto] = useState("")
  const [tokenNF, setTokenNF] = useState<string | null>(null)

  if (acoes.length === 0) return null

  async function executar(acao: AcaoVideomaker, valor?: string) {
    setErro("")

    // Início da captação: evento de histórico, não transição (§14). Rota
    // própria do módulo de Jobs, porque /demandas/[id]/status só grava status.
    if (acao.ehEvento) {
      setEmCurso(acao.chave)
      try {
        const res = await fetch(`/api/jobs/${jobId}/captacao`, { method: "POST" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error ?? "Não foi possível registrar o início da captação")
        onExecutado()
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro de conexão")
      } finally {
        setEmCurso(null)
      }
      return
    }

    // NF não é transição de status: é o fluxo de upload por token que já existe.
    if (acao.chave === "enviar_nf") {
      setEmCurso(acao.chave)
      try {
        const res = await fetch("/api/me/nf-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ demandaId: jobId }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "Não foi possível abrir o envio da NF")
        setTokenNF(json.token)
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao abrir o envio da NF")
      } finally {
        setEmCurso(null)
      }
      return
    }

    setEmCurso(acao.chave)
    try {
      const res = await fetch(`/api/demandas/${jobId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statusInterno: acao.alvo,
          origem: "manual",
          // O motivo da recusa vira observação, e é assim que ele entra na
          // timeline (§6 exige que fique registrado).
          ...(acao.exigeMotivo && valor ? { observacao: valor } : {}),
          ...(acao.exigeLink && valor ? { linkBrutos: valor } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      // A mensagem vem do servidor: é ele que sabe por que recusou.
      if (!res.ok) throw new Error(json.error ?? `Não foi possível concluir (${res.status})`)
      setPedindo(null)
      setTexto("")
      onExecutado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de conexão")
    } finally {
      setEmCurso(null)
    }
  }

  function acionar(acao: AcaoVideomaker) {
    // Recusa sem motivo e material sem link não saem daqui: o servidor recusaria
    // o segundo, e o primeiro é exigência do §6.
    if (acao.exigeMotivo || acao.exigeLink) {
      setPedindo(acao)
      setTexto("")
      setErro("")
      return
    }
    void executar(acao)
  }

  return (
    <>
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 sm:p-4">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Sua vez</p>

        {pedindo ? (
          <div className="space-y-2">
            <label className="block text-xs text-zinc-400" htmlFor="valor-acao">
              {pedindo.exigeMotivo
                ? "Por que está recusando? O motivo fica registrado no Job."
                : "Link da pasta ou do arquivo com o material bruto"}
            </label>
            <input
              id="valor-acao"
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={pedindo.exigeMotivo ? "Ex.: conflito de agenda" : "https://drive.google.com/..."}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
            <div className="flex gap-2">
              <button
                onClick={() => void executar(pedindo, texto.trim())}
                disabled={!texto.trim() || emCurso !== null}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {emCurso ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Confirmar"}
              </button>
              <button
                onClick={() => { setPedindo(null); setTexto(""); setErro("") }}
                className="px-4 py-2.5 rounded-lg text-sm text-zinc-400 border border-zinc-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            {acoes.map((acao) => (
              <button
                key={acao.chave}
                onClick={() => acionar(acao)}
                disabled={emCurso !== null}
                className={cn(
                  "flex-1 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-40",
                  acao.negativa
                    ? "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    : "bg-zinc-100 text-zinc-900 hover:bg-white"
                )}
              >
                {emCurso === acao.chave
                  ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  : acao.label}
              </button>
            ))}
          </div>
        )}

        {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}
      </section>

      {tokenNF && (
        <NFUploadModal
          token={tokenNF}
          onClose={() => setTokenNF(null)}
          onSuccess={() => { setTokenNF(null); onExecutado() }}
        />
      )}
    </>
  )
}
