"use client"

import styles from "@/components/layout/TeamSurface.module.css"
import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Star, Flag, Globe, Building2 } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { Header } from "@/components/layout/Header"
import { ScoreRede } from "@/components/rede/ScoreRede"
import type { ScoreRede as Score } from "@/lib/rede-score"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import { mensagemDeErro, erroDaResposta } from "@/lib/erro-cliente"

interface Avaliacao {
  id: string; nota: number; comentario: string | null; createdAt: string
  removidaEm: string | null; contestacaoStatus: "em_analise" | "mantida" | "removida" | null
  contestacaoDecisao: string | null; contestacoes: number
}
interface Convite { id: string; empresa: string; mensagem: string | null; createdAt: string }
interface Dados {
  profissional: { tipo: "videomaker" | "editor"; nome: string; naRede: boolean }
  score: Score; avaliacoes: Avaliacao[]; convites: Convite[]
}

const SITUACAO: Record<string, { texto: string; classe: string }> = {
  em_analise: { texto: "Em análise · fora da média", classe: "bg-yellow-500/15 text-yellow-300 border-yellow-700" },
  mantida: { texto: "Contestação analisada · nota mantida", classe: "bg-zinc-700/40 text-zinc-300 border-zinc-600" },
  removida: { texto: "Removida após contestação", classe: "bg-green-500/15 text-green-300 border-green-700" },
}

// A área do profissional na rede (Termos do Profissional, seções 6, 7 e 11).
export default function MinhasAvaliacoesPage() {
  const { data, error, isLoading, mutate } = useSWR<Dados>("/api/me/rede", fetcher)
  const [contestando, setContestando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState("")
  const [enviando, setEnviando] = useState(false)

  async function enviar(corpo: Record<string, unknown>, ok: string) {
    setEnviando(true)
    try {
      const res = await fetch("/api/me/rede", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
      if (!res.ok) throw await erroDaResposta(res)
      const json = await res.json().catch(() => ({}))
      toast.success(json.mensagem ?? ok)
      await mutate()
      return true
    } catch (err) {
      toast.error(mensagemDeErro(err))
      return false
    } finally {
      setEnviando(false)
    }
  }

  async function contestar(avaliacaoId: string) {
    if (await enviar({ acao: "contestar", avaliacaoId, motivo }, "Contestação registrada.")) {
      setContestando(null); setMotivo("")
    }
  }

  async function participacao(naRede: boolean) {
    if (!naRede && !confirm("Sair da rede? Empresas novas deixam de encontrar você. As empresas que já têm você na lista continuam vendo seu perfil. Você pode voltar quando quiser.")) return
    await enviar({ acao: "participacao", naRede }, naRede ? "Você voltou para a rede." : "Você saiu da rede.")
  }

  return (
    <>
      <Header title="Minhas avaliações" />
      <main className={styles.page}>
        <p className={styles.eyebrow}>REDE DE PROFISSIONAIS</p>
        <h1 className={styles.title}>Sua reputação na rede.</h1>
        <p className={styles.subtitle}>
          Empresas novas veem só a sua média e quantas avaliações você recebeu. Os comentários ficam com você e com a empresa que contratou. <Link href="/profissionais/avaliacoes" className="underline">Política de Avaliações</Link>
        </p>

        {error ? <p role="alert" className="text-sm text-zinc-400">{mensagemDeErro(error, "Não foi possível carregar suas avaliações.")}</p>
          : isLoading || !data ? <p role="status" className="text-sm text-zinc-400">Carregando…</p>
          : <div className="space-y-6">

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-2">O que as empresas veem</p>
              <ScoreRede score={data.score} className="text-base" />
              <p className="text-xs text-zinc-500 mt-2">Média das notas dos últimos 24 meses. Aparece a partir de 3 avaliações.</p>
            </div>
            {data.profissional.tipo === "videomaker" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Busca da rede</p>
                <p className="text-sm text-zinc-200">
                  {data.profissional.naRede ? "Empresas novas podem encontrar você." : "Você está fora da rede. Só as empresas que já têm você na lista veem seu perfil."}
                </p>
                <button
                  onClick={() => participacao(!data.profissional.naRede)}
                  disabled={enviando}
                  className="mt-3 text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 rounded-lg disabled:opacity-60"
                >
                  {data.profissional.naRede ? "Sair da rede" : "Voltar para a rede"}
                </button>
              </div>
            )}
          </section>

          {data.convites.length > 0 && (
            <section className="bg-zinc-900 border border-purple-800/60 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-zinc-100 mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-purple-300" /> Convites de empresas</h2>
              <div className="space-y-3">
                {data.convites.map(c => (
                  <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between border-b border-zinc-800 last:border-0 pb-3 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200"><strong>{c.empresa}</strong> quer você na lista de profissionais dela.</p>
                      {c.mensagem && <p className="text-xs text-zinc-400 mt-0.5">“{c.mensagem}”</p>}
                      <p className="text-xs text-zinc-500 mt-0.5">Se aceitar, a empresa passa a ver seu telefone e e-mail.</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button disabled={enviando} onClick={() => enviar({ acao: "responder", conviteId: c.id, aceitar: true }, `Agora você está na lista de ${c.empresa}.`)}
                        className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60">Aceitar</button>
                      <button disabled={enviando} onClick={() => enviar({ acao: "responder", conviteId: c.id, aceitar: false }, "Convite recusado.")}
                        className="text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 rounded-lg disabled:opacity-60">Recusar</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-zinc-100 mb-1 flex items-center gap-2"><Star className="w-4 h-4 text-yellow-400" /> Suas avaliações ({data.avaliacoes.length})</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Se uma nota não for de um trabalho real, vier de quem tem conflito de interesse, for retaliação ou violar as regras, conteste. Enquanto a NuFlow analisa, a nota sai da média. A decisão sai, em regra, em até 5 dias úteis.
            </p>
            {data.avaliacoes.length === 0 ? <p className="text-sm text-zinc-500 text-center py-4">Você ainda não recebeu avaliações.</p> : (
              <div className="space-y-3">
                {data.avaliacoes.map(av => {
                  const sit = av.contestacaoStatus ? SITUACAO[av.contestacaoStatus] : null
                  const podeContestar = !av.removidaEm && av.contestacaoStatus !== "em_analise" && av.contestacoes < 2
                  return (
                    <div key={av.id} className="border-b border-zinc-800 last:border-0 pb-3 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex gap-0.5" aria-label={`Nota ${av.nota} de 5`}>
                          {[1, 2, 3, 4, 5].map(n => <Star key={n} className={cn("h-3.5 w-3.5", n <= av.nota ? "text-yellow-400 fill-yellow-400" : "text-zinc-700")} />)}
                        </span>
                        <span className="text-xs text-zinc-600">{format(new Date(av.createdAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                        {sit && <span className={cn("text-[10px] border px-1.5 py-0.5 rounded", sit.classe)}>{sit.texto}</span>}
                      </div>
                      {av.comentario && <p className="text-sm text-zinc-300 mt-1">{av.comentario}</p>}
                      {av.contestacaoDecisao && av.contestacaoStatus !== "em_analise" && (
                        <p className="text-xs text-zinc-400 mt-1">Decisão da NuFlow: {av.contestacaoDecisao}</p>
                      )}
                      {contestando === av.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            aria-label="Motivo da contestação"
                            value={motivo}
                            onChange={e => setMotivo(e.target.value)}
                            rows={3}
                            maxLength={2000}
                            placeholder="Conte por que esta nota não vale: trabalho que não aconteceu, conflito de interesse, retaliação…"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-zinc-500"
                          />
                          <div className="flex gap-2">
                            <button disabled={enviando || motivo.trim().length < 10} onClick={() => contestar(av.id)}
                              className="text-xs bg-white text-zinc-900 font-medium px-3 py-1.5 rounded-lg disabled:opacity-40">
                              {enviando ? "Enviando…" : av.contestacoes > 0 ? "Pedir segunda análise" : "Enviar contestação"}
                            </button>
                            <button onClick={() => { setContestando(null); setMotivo("") }} className="text-xs border border-zinc-700 text-zinc-400 px-3 py-1.5 rounded-lg">Cancelar</button>
                          </div>
                        </div>
                      ) : podeContestar && (
                        <button onClick={() => { setContestando(av.id); setMotivo("") }} className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
                          <Flag className="w-3 h-3" /> {av.contestacoes > 0 ? "Pedir segunda análise" : "Contestar"}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>}
      </main>
    </>
  )
}
