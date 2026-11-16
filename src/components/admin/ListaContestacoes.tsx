"use client"
// Contestações da rede: o profissional diz por que uma nota não vale, e a
// Plataforma decide manter ou remover, com o motivo (Política de Avaliações,
// seção 5). Enquanto está aqui em análise, a nota já está fora da média.
import { useState } from "react"
import useSWR from "swr"
import { Star } from "lucide-react"
import { toast } from "sonner"
import { Header } from "@/components/layout/Header"
import { PageIntro } from "@/components/layout/PageIntro"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import { mensagemDeErro, erroDaResposta } from "@/lib/erro-cliente"

type Contestacao = {
  id: string; status: "em_analise" | "mantida" | "removida"; motivo: string; decisao: string | null
  decididoEm: string | null; createdAt: string; tipo: "videomaker" | "editor"; profissional: string
  avaliacao: { nota: number; comentario: string | null; createdAt: string; empresa: string | null } | null
}

const quando = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })

// Prazo da Política: decisão em até 5 dias úteis.
function diasUteisDesde(iso: string): number {
  let d = new Date(iso), n = 0
  const hoje = new Date()
  while (d < hoje) {
    d = new Date(d.getTime() + 86400000)
    const dia = d.getDay()
    if (dia !== 0 && dia !== 6 && d <= hoje) n++
  }
  return n
}

export function ListaContestacoes() {
  const { data, error, isLoading, mutate } = useSWR<{ contestacoes: Contestacao[] }>("/api/admin/contestacoes", fetcher)
  const [motivos, setMotivos] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState<string | null>(null)
  const lista = data?.contestacoes ?? []
  const abertas = lista.filter(c => c.status === "em_analise").length

  async function decidir(c: Contestacao, decisao: "mantida" | "removida") {
    setEnviando(c.id)
    try {
      const res = await fetch("/api/admin/contestacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, decisao, motivo: motivos[c.id] ?? "" }),
      })
      if (!res.ok) throw await erroDaResposta(res)
      toast.success(decisao === "removida" ? "Nota removida. As duas partes foram avisadas." : "Nota mantida. As duas partes foram avisadas.")
      await mutate()
    } catch (err) {
      toast.error(mensagemDeErro(err))
    } finally {
      setEnviando(null)
    }
  }

  return <>
    <Header title="Contestações da rede" />
    <PageIntro eyebrow="PLATAFORMA / REDE" title="Notas contestadas pelos profissionais." description="Enquanto está em análise, a nota fica fora da média. Decida manter ou remover e escreva o motivo: o profissional e a empresa recebem a decisão." />
    <main className="px-4 sm:px-6 pb-10 max-w-5xl">
      {isLoading && <p role="status" className="text-sm text-zinc-400">Carregando…</p>}
      {error && <p role="alert" className="text-sm text-zinc-400">Não foi possível abrir as contestações. <button type="button" className="underline" onClick={() => void mutate()}>Tentar de novo</button></p>}
      {data && <p className="text-sm text-zinc-400 mb-4" role="status">{abertas === 0 ? "Nenhuma contestação esperando decisão." : `${abertas} ${abertas === 1 ? "contestação espera" : "contestações esperam"} decisão.`}</p>}

      <div className="space-y-3">
        {lista.map(c => {
          const aberta = c.status === "em_analise"
          const dias = diasUteisDesde(c.createdAt)
          return (
            <article key={c.id} className={cn("bg-zinc-900 border rounded-xl p-4", aberta ? "border-yellow-800/60" : "border-zinc-800")}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-sm text-zinc-100">{c.profissional}</span>
                <span className="text-zinc-500">{c.tipo === "videomaker" ? "videomaker" : "editor"}</span>
                <span className="text-zinc-600">· contestou em {quando(c.createdAt)}</span>
                {aberta
                  ? <span className={cn("border px-1.5 py-0.5 rounded", dias >= 5 ? "border-red-700 text-red-300" : "border-yellow-700 text-yellow-300")}>{dias >= 5 ? `Prazo vencido (${dias} dias úteis)` : `${dias} de 5 dias úteis`}</span>
                  : <span className="border border-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">{c.status === "removida" ? "Nota removida" : "Nota mantida"}{c.decididoEm ? ` em ${quando(c.decididoEm)}` : ""}</span>}
              </div>

              {c.avaliacao && (
                <div className="mt-3 bg-zinc-800/50 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span className="flex gap-0.5" aria-label={`Nota ${c.avaliacao.nota} de 5`}>
                      {[1, 2, 3, 4, 5].map(n => <Star key={n} className={cn("h-3.5 w-3.5", n <= c.avaliacao!.nota ? "text-yellow-400 fill-yellow-400" : "text-zinc-700")} />)}
                    </span>
                    <span>{c.avaliacao.empresa ?? "Cliente por convite"}</span>
                    <span className="text-zinc-600">· avaliou em {quando(c.avaliacao.createdAt)}</span>
                  </div>
                  {c.avaliacao.comentario && <p className="text-sm text-zinc-300 mt-1">{c.avaliacao.comentario}</p>}
                </div>
              )}

              <p className="text-sm text-zinc-200 mt-3"><span className="text-zinc-500">Motivo do profissional:</span> {c.motivo}</p>
              {!aberta && c.decisao && <p className="text-sm text-zinc-400 mt-1"><span className="text-zinc-500">Sua decisão:</span> {c.decisao}</p>}

              {aberta && (
                <div className="mt-3 space-y-2">
                  <textarea
                    aria-label={`Motivo da decisão sobre ${c.profissional}`}
                    value={motivos[c.id] ?? ""}
                    onChange={e => setMotivos(m => ({ ...m, [c.id]: e.target.value }))}
                    rows={2}
                    maxLength={1000}
                    placeholder="Motivo da decisão (vai para o profissional e para a empresa)"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={enviando === c.id || (motivos[c.id] ?? "").trim().length < 10} onClick={() => decidir(c, "mantida")}
                      className="text-xs border border-zinc-600 text-zinc-200 hover:bg-zinc-800 px-3 py-1.5 rounded-lg disabled:opacity-40">Manter a nota</button>
                    <button type="button" disabled={enviando === c.id || (motivos[c.id] ?? "").trim().length < 10} onClick={() => decidir(c, "removida")}
                      className="text-xs bg-white text-zinc-900 font-medium px-3 py-1.5 rounded-lg disabled:opacity-40">Remover a nota</button>
                  </div>
                  <p className="text-[11px] text-zinc-500">A Política não permite remover uma nota só porque é baixa. Remova quando o trabalho não existiu, houve conflito de interesse, retaliação, nota combinada ou outra violação.</p>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </main>
  </>
}
