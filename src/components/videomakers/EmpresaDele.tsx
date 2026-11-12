"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Building2 } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

type Estado = {
  empresa: { organizacaoId: string; nome: string; slug: string | null } | null
  parceria: { status: "pendente" | "aceita" | "recusada" | "encerrada"; convidouFoiEsta: boolean } | null
  cardsLa: number
  espelhados?: number
}

/**
 * "Empresa dele": o videomaker que trabalha para esta empresa por uma empresa
 * dele (o Gabriel pela GH Produção). Com a parceria aceita, toda gravação
 * aberta escalada para ele aparece lá, e a empresa dele escolhe quem faz. Para
 * esta empresa ele continua sendo o responsável. Só a gestão vê esta seção (a
 * rota devolve 404 aos outros, e a seção some).
 */
export function EmpresaDele({ videomakerId }: { videomakerId: string }) {
  const { data, mutate } = useSWR<Estado>(`/api/videomakers/${videomakerId}/empresa`, fetcher, { shouldRetryOnError: false })
  const [slug, setSlug] = useState("")
  const [salvando, setSalvando] = useState(false)

  if (!data || "error" in (data as object)) return null

  async function salvar(valor: string | null) {
    setSalvando(true)
    try {
      const res = await fetch(`/api/videomakers/${videomakerId}/empresa`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: valor }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "Não foi possível salvar")
      if (valor === null) toast.success("Pronto: ele volta a trabalhar só por aqui.")
      else if (j.parceria?.status === "aceita") toast.success(`Pronto. ${j.espelhados ?? 0} gravação(ões) aberta(s) foram para ${j.empresa?.nome}.`)
      else toast.success(`Convite de parceria enviado para ${j.empresa?.nome}. As gravações vão quando eles aceitarem.`)
      setSlug("")
      await mutate(j, { revalidate: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar")
    } finally {
      setSalvando(false)
    }
  }

  const situacao = !data.empresa
    ? null
    : data.parceria?.status === "aceita"
      ? `${data.cardsLa} gravação(ões) aberta(s) aparecendo em ${data.empresa.nome}. Para você, ele continua sendo o responsável.`
      : data.parceria?.status === "pendente"
        ? data.parceria.convidouFoiEsta
          ? `Aguardando ${data.empresa.nome} aceitar a parceria. Quando aceitarem, as gravações abertas dele aparecem lá.`
          : `${data.empresa.nome} convidou sua empresa para uma parceria. Aceite em Parcerias para as gravações irem.`
        : `Sem parceria ativa com ${data.empresa.nome}: as gravações não vão para lá.`

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-sm font-medium text-zinc-200 flex items-center gap-1.5">
        <Building2 className="h-4 w-4 text-zinc-400" aria-hidden /> Empresa dele
      </p>
      <p className="text-xs text-zinc-500 mt-0.5">
        Se ele trabalha por uma empresa própria, as gravações dele aparecem lá também, e a empresa dele escolhe quem da equipe vai fazer.
      </p>

      {data.empresa ? (
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-zinc-200 truncate">{data.empresa.nome}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{situacao}</p>
          </div>
          <button
            onClick={() => { if (confirm(`Tirar ${data.empresa?.nome}? As gravações abertas dele saem de lá.`)) void salvar(null) }}
            disabled={salvando}
            className="text-xs text-zinc-400 hover:text-red-400 px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-50 shrink-0"
          >
            Tirar
          </button>
        </div>
      ) : (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (slug.trim()) void salvar(slug.trim()) }}
        >
          <input
            aria-label="Endereço da empresa dele no NuFlow"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="endereço da empresa no NuFlow (ex.: gh-producao)"
            className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200"
          />
          <button
            type="submit"
            disabled={!slug.trim() || salvando}
            className="text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-100 px-3 py-1.5 rounded-lg disabled:opacity-40 shrink-0"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </form>
      )}
    </div>
  )
}
