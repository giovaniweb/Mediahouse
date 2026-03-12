"use client"

import { useState } from "react"
import { Header } from "@/components/layout/Header"
import { CheckCircle2, XCircle, Clock, User, Building2, Zap, AlertCircle } from "lucide-react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Demanda {
  id: string
  codigo: string
  titulo: string
  descricao: string
  departamento: string
  prioridade: string
  motivoUrgencia?: string
  createdAt: string
  solicitante: { id: string; nome: string; email: string }
}

const DEPT_LABEL: Record<string, string> = {
  growth: "Growth", eventos: "Eventos", institucional: "Institucional",
  rh: "RH", audiovisual: "Audiovisual", outros: "Outros",
}

export default function AprovacoesPage() {
  const { data, mutate } = useSWR<{ demandas: Demanda[] }>(
    "/api/demandas?statusInterno=aguardando_aprovacao_interna",
    fetcher,
    { refreshInterval: 10000 }
  )
  const [loading, setLoading] = useState<string | null>(null)
  const [modal, setModal] = useState<{ id: string; acao: "recusar" } | null>(null)
  const [motivo, setMotivo] = useState("")

  const demandas = data?.demandas ?? []

  async function agir(id: string, acao: "aprovar" | "recusar", motivoRecusa?: string) {
    setLoading(id)
    try {
      const res = await fetch(`/api/demandas/${id}/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, motivo: motivoRecusa }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      mutate()
      setModal(null)
      setMotivo("")
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      <Header title="Aprovações Pendentes" />
      <main className="flex-1 p-6">
        {demandas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-300 mb-3" />
            <p className="font-medium text-zinc-500">Nenhuma demanda aguardando aprovação</p>
            <p className="text-sm text-zinc-400 mt-1">Quando novas solicitações chegarem, elas aparecerão aqui.</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            <p className="text-sm text-zinc-500 mb-4">
              <span className="font-semibold text-zinc-800">{demandas.length}</span> demanda(s) aguardando aprovação
            </p>

            {demandas.map((d) => (
              <div
                key={d.id}
                className={cn(
                  "bg-white border rounded-2xl p-5 space-y-3",
                  d.prioridade === "urgente" ? "border-red-200 shadow-red-50 shadow-md" : "border-zinc-200"
                )}
              >
                {/* Header do card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-zinc-400">{d.codigo}</span>
                      {d.prioridade === "urgente" && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                          <Zap className="w-3 h-3" /> URGENTE
                        </span>
                      )}
                      {d.prioridade === "alta" && (
                        <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">ALTA</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-zinc-800">{d.titulo}</h3>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Clock className="w-3.5 h-3.5" />
                    {format(new Date(d.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </div>
                </div>

                {/* Descrição */}
                <p className="text-sm text-zinc-600 leading-relaxed line-clamp-2">{d.descricao}</p>

                {/* Urgência */}
                {d.motivoUrgencia && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">{d.motivoUrgencia}</p>
                  </div>
                )}

                {/* Meta info */}
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {d.solicitante.nome}
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {DEPT_LABEL[d.departamento] ?? d.departamento}
                  </span>
                  <Link href={`/demandas/${d.id}`} className="text-blue-500 hover:underline ml-auto">
                    Ver detalhes →
                  </Link>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 pt-1 border-t border-zinc-100">
                  <button
                    onClick={() => agir(d.id, "aprovar")}
                    disabled={loading === d.id}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Aprovar
                  </button>
                  <button
                    onClick={() => setModal({ id: d.id, acao: "recusar" })}
                    disabled={loading === d.id}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium py-2 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal de recusa */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="font-semibold text-zinc-800 mb-1">Recusar Demanda</h3>
            <p className="text-sm text-zinc-500 mb-4">Informe o motivo da recusa (será comunicado ao solicitante).</p>
            <textarea
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-200"
              rows={3}
              placeholder="Ex: Fora do escopo, informações insuficientes, etc."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => agir(modal.id, "recusar", motivo)}
                disabled={loading === modal.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-50"
              >
                {loading === modal.id ? "Recusando..." : "Confirmar Recusa"}
              </button>
              <button
                onClick={() => { setModal(null); setMotivo("") }}
                className="flex-1 border border-zinc-200 text-sm py-2 rounded-xl hover:bg-zinc-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
