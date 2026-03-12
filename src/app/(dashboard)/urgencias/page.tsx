"use client"

import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import { AlertTriangle, CheckCircle, Clock, X } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function UrgenciasPage() {
  const { data, mutate } = useSWR("/api/demandas?statusInterno=urgencia_pendente_aprovacao", fetcher, {
    refreshInterval: 10000,
  })
  const { data: aprovadas } = useSWR("/api/demandas?statusInterno=urgencia_aprovada", fetcher)
  const { data: reprovadas } = useSWR("/api/demandas?statusInterno=urgencia_reprovada", fetcher)

  const pendentes = data?.demandas ?? []
  const listaAprovadas = aprovadas?.demandas ?? []
  const listaReprovadas = reprovadas?.demandas ?? []

  async function handleAprovar(id: string) {
    await fetch(`/api/demandas/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusInterno: "urgencia_aprovada" }),
    })
    mutate()
  }

  async function handleReprovar(id: string) {
    const motivo = prompt("Motivo da reprovação:")
    if (!motivo) return
    await fetch(`/api/demandas/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusInterno: "urgencia_reprovada", observacao: motivo }),
    })
    mutate()
  }

  return (
    <>
      <Header title="Urgências" />
      <main className="flex-1 p-6 space-y-8 max-w-4xl">
        {/* Pendentes */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-bold text-zinc-800">Aguardando Aprovação</h2>
            {pendentes.length > 0 && (
              <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {pendentes.length}
              </span>
            )}
          </div>

          {pendentes.length === 0 && (
            <p className="text-sm text-zinc-400 bg-zinc-50 rounded-lg p-4">
              Nenhuma urgência pendente de aprovação.
            </p>
          )}

          <div className="space-y-3">
            {pendentes.map((d: {
              id: string
              codigo: string
              titulo: string
              departamento: string
              tipoVideo: string
              motivoUrgencia: string | null
              criadoEm: string
              solicitante?: { nome: string } | null
            }) => (
              <div key={d.id} className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <Link href={`/demandas/${d.id}`} className="font-semibold text-zinc-800 hover:underline">
                        {d.titulo}
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                      <span className="font-mono">{d.codigo}</span>
                      <span>·</span>
                      <span>{d.departamento}</span>
                      <span>·</span>
                      <span>{d.tipoVideo}</span>
                      {d.solicitante && <><span>·</span><span>{d.solicitante.nome}</span></>}
                    </div>
                    {d.motivoUrgencia && (
                      <p className="text-xs text-red-600 mt-1.5 font-medium">
                        Motivo: {d.motivoUrgencia}
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Solicitado {format(new Date(d.criadoEm), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleReprovar(d.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-100"
                    >
                      <X className="w-3.5 h-3.5" /> Reprovar
                    </button>
                    <button
                      onClick={() => handleAprovar(d.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Aprovar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Aprovadas */}
        {listaAprovadas.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <h2 className="font-semibold text-zinc-700">Aprovadas Recentemente</h2>
            </div>
            <div className="space-y-2">
              {listaAprovadas.slice(0, 5).map((d: { id: string; codigo: string; titulo: string }) => (
                <Link key={d.id} href={`/demandas/${d.id}`}>
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm hover:bg-green-100">
                    <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
                    <span className="font-mono text-xs text-zinc-500">{d.codigo}</span>
                    <span className="text-zinc-700">{d.titulo}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Reprovadas */}
        {listaReprovadas.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <X className="w-4 h-4 text-zinc-500" />
              <h2 className="font-semibold text-zinc-700">Reprovadas Recentemente</h2>
            </div>
            <div className="space-y-2">
              {listaReprovadas.slice(0, 5).map((d: { id: string; codigo: string; titulo: string }) => (
                <Link key={d.id} href={`/demandas/${d.id}`}>
                  <div className="flex items-center gap-3 p-3 bg-zinc-50 border rounded-lg text-sm hover:bg-zinc-100">
                    <X className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="font-mono text-xs text-zinc-500">{d.codigo}</span>
                    <span className="text-zinc-600">{d.titulo}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
