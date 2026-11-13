"use client"

import styles from "@/components/layout/TeamSurface.module.css"
import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { ArrowLeft, MapPin, Send, ExternalLink, Check } from "lucide-react"
import { toast } from "sonner"
import { Header } from "@/components/layout/Header"
import { ScoreRede } from "@/components/rede/ScoreRede"
import type { ScoreRede as Score } from "@/lib/rede-score"
import { fetcher } from "@/lib/fetcher"
import { useMe } from "@/hooks/usePermissoes"
import { mensagemDeErro, erroDaResposta } from "@/lib/erro-cliente"

interface PerfilRede {
  id: string; nome: string; cidade: string | null; estado: string | null
  areasAtuacao: string[]; habilidades: string[]; portfolio: string | null; redesSociais: string[]
  score?: Score; convitePendente: boolean
}

// Busca na rede: a empresa encontra quem ainda não está na lista dela, vê o
// score e convida. O contato só aparece depois que o profissional aceita.
export default function RedePage() {
  const [local, setLocal] = useState("")
  const [especialidade, setEspecialidade] = useState("")
  const [enviando, setEnviando] = useState<string | null>(null)
  // Busca na rede é do módulo "rede" (pago, por empresa). Sem ele, a tela não
  // busca nada (a API responderia 403) e explica; o menu e os botões já somem.
  const { data: me } = useMe()
  const temRede = me?.modulos ? !!me.modulos.rede : null

  const [cidade, uf] = local ? local.split(" / ") : ["", ""]
  const qs = new URLSearchParams({ ...(cidade ? { cidade } : {}), ...(uf ? { uf } : {}), ...(especialidade ? { especialidade } : {}) })
  const { data, error, isLoading, mutate } = useSWR<{ videomakers: PerfilRede[]; filtros: { cidades: string[]; especialidades: string[] } }>(
    temRede ? `/api/rede/videomakers?${qs}` : null, fetcher, { keepPreviousData: true },
  )
  const lista = data?.videomakers ?? []

  async function convidar(p: PerfilRede) {
    setEnviando(p.id)
    try {
      const res = await fetch("/api/rede/convites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videomakerId: p.id }),
      })
      if (!res.ok) throw await erroDaResposta(res, "Não foi possível enviar o convite.")
      toast.success(`Convite enviado a ${p.nome}. Entra na sua lista quando aceitar.`)
      await mutate()
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível enviar o convite."))
    } finally {
      setEnviando(null)
    }
  }

  const sel = "bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500/30"

  if (temRede === false) {
    return (
      <>
        <Header title="Encontrar na rede" />
        <main className={styles.page}>
          <Link href="/videomakers" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 mb-4">
            <ArrowLeft className="w-3.5 h-3.5" /> Videomakers da sua lista
          </Link>
          <p className="text-sm text-zinc-400">A busca na rede de videomakers não está ligada para a sua empresa.</p>
        </main>
      </>
    )
  }

  return (
    <>
      <Header title="Encontrar na rede" />
      <main className={styles.page}>
        <Link href="/videomakers" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Videomakers da sua lista
        </Link>
        <p className={styles.eyebrow}>REDE DE PROFISSIONAIS</p>
        <h1 className={styles.title}>Encontre quem ainda não trabalha com você.</h1>
        <p className={styles.subtitle}>
          Você vê a cidade, as áreas e a média das notas que outras empresas deram. O telefone e o e-mail aparecem quando o profissional aceitar o seu convite.
        </p>

        <div className="flex flex-wrap gap-3 mb-6">
          <select aria-label="Cidade" value={local} onChange={e => setLocal(e.target.value)} className={sel}>
            <option value="">Todas as cidades</option>
            {data?.filtros.cidades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Especialidade" value={especialidade} onChange={e => setEspecialidade(e.target.value)} className={sel}>
            <option value="">Todas as especialidades</option>
            {data?.filtros.especialidades.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        {error ? <p role="alert" className="text-sm text-zinc-400">Não foi possível carregar a rede.</p>
          : isLoading && !data ? <p role="status" className="text-sm text-zinc-400">Carregando a rede…</p>
          : lista.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <p className="text-lg font-medium mb-1">Ninguém da rede com esse filtro</p>
              <p className="text-sm">Tente outra cidade ou especialidade.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map(p => {
                const tags = [...new Set([...p.areasAtuacao, ...p.habilidades])]
                return (
                  <div key={p.id} className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 flex flex-col">
                    <h3 className="font-semibold text-zinc-100 truncate">{p.nome}</h3>
                    {(p.cidade || p.estado) && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-zinc-500">
                        <MapPin className="w-3 h-3" />
                        <span>{[p.cidade, p.estado].filter(Boolean).join(", ")}</span>
                      </div>
                    )}
                    <ScoreRede score={p.score} className="mt-3" />
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {tags.slice(0, 6).map(t => (
                          <span key={t} className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">{t}</span>
                        ))}
                      </div>
                    )}
                    {p.portfolio && /^https?:\/\//.test(p.portfolio) && (
                      <a href={p.portfolio} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200 mt-3">
                        <ExternalLink className="w-3 h-3" /> Portfólio
                      </a>
                    )}
                    <div className="mt-auto pt-4">
                      {p.convitePendente ? (
                        <p className="flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-400 border border-zinc-800 rounded-lg">
                          <Check className="w-3.5 h-3.5" /> Convite enviado, falta a resposta
                        </p>
                      ) : (
                        <button
                          onClick={() => convidar(p)}
                          disabled={enviando === p.id}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium disabled:opacity-60"
                        >
                          <Send className="w-3.5 h-3.5" /> {enviando === p.id ? "Enviando…" : "Convidar para a minha lista"}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
      </main>
    </>
  )
}
