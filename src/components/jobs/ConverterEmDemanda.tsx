"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { toast } from "sonner"
import { fetcher } from "@/lib/fetcher"

/**
 * Job → Demanda: tira o registro da esteira de coberturas e o devolve ao
 * audiovisual.
 *
 * NÃO CRIA NADA. `POST /api/jobs/[id]/converter` faz UPDATE de dois campos no
 * mesmo registro — id, solicitante, briefing, arquivos, comentários, histórico,
 * datas e responsáveis ficam onde estão. Converter é virar uma chave.
 *
 * O caminho contrário (Demanda → Job) já tinha botão em `DemandaDetalhe`, e a
 * rota sempre soube ir nos dois sentidos. O que faltava era isto.
 *
 * POR QUE PERGUNTA O TIPO. Saindo de cobertura, as duas marcas
 * (`departamento: eventos` e `tipoVideo: cobertura_evento`) precisam sair
 * juntas — se uma sobrevive, `ehSolicitacaoDeCobertura` continua verdadeira, o
 * registro fica no quadro de Jobs e a conversão parece não ter funcionado. O
 * destino padrão é `audiovisual / outro`, e "outro" é honesto (o tipo original
 * não é adivinhável) mas é um card que alguém vai editar em seguida.
 * `conversaoDeFluxo` já aceita um tipo preferido — perguntar aqui troca dois
 * passos por um.
 */
export function ConverterEmDemanda({ jobId, codigo }: { jobId: string; codigo: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [tipoVideo, setTipoVideo] = useState("outro")
  const [convertendo, setConvertendo] = useState(false)

  // Quem pode reclassificar. A autorização REAL está na rota (gestão ou
  // `editarDemanda`, fail-closed); isto só evita oferecer o que vai falhar.
  const { data: me } = useSWR<{
    membership?: { papel?: string }
    tipo?: string
    permissoes?: { editarDemanda?: boolean }
  }>("/api/me", fetcher)

  const papel = String(me?.membership?.papel ?? me?.tipo ?? "").toLowerCase()
  const podeConverter = papel === "admin" || papel === "gestor" || Boolean(me?.permissoes?.editarDemanda)

  const { data: dataTipos } = useSWR<{ parametros: { valor: string; label: string }[] }>(
    aberto ? "/api/configuracoes/parametros?grupo=tipos_video" : null,
    fetcher
  )
  // Sem parâmetros configurados na empresa, "Outro" sozinho já permite
  // converter — a tela não trava esperando configuração que pode não existir.
  const tipos = dataTipos?.parametros?.length
    ? dataTipos.parametros
    : [{ valor: "outro", label: "Outro" }]

  if (!me || !podeConverter) return null

  async function converter() {
    setConvertendo(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/converter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: "demanda", tipoVideo }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? "Não foi possível converter")

      // Idempotência (§53): converter duas vezes não é erro, e também não é
      // notícia. Acontece com clique duplo e com duas abas abertas.
      toast.success(json.jaEstava ? "Já era uma Demanda." : `${codigo} agora é uma Demanda.`)
      // O registro deixou de pertencer a este quadro. Ficar nesta tela mostraria
      // um Job que não é mais Job.
      router.push(`/demandas/${jobId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao converter")
      setConvertendo(false)
    }
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-4 decoration-zinc-700"
      >
        Converter em Demanda (audiovisual)
      </button>
    )
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-zinc-200">Converter em Demanda</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Sai do quadro de Jobs e passa para o de Demandas, no audiovisual. Continua sendo{" "}
          <span className="font-mono text-zinc-400">{codigo}</span>: briefing, arquivos,
          comentários, histórico, prazo e responsáveis não se movem.
        </p>
      </div>

      <label className="block">
        <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">
          Tipo de vídeo
        </span>
        <select
          value={tipoVideo}
          onChange={(e) => setTipoVideo(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200"
        >
          {tipos.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="block text-[11px] text-zinc-600 mt-1">
          O tipo de cobertura não sobrevive à conversão. Dá para trocar depois, na demanda.
        </span>
      </label>

      <div className="flex items-center gap-2">
        <button
          onClick={converter}
          disabled={convertendo}
          className="text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-100 px-3 py-1.5 rounded-lg disabled:opacity-40"
        >
          {convertendo ? "Convertendo…" : "Converter"}
        </button>
        <button
          onClick={() => setAberto(false)}
          disabled={convertendo}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1.5 disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </section>
  )
}
