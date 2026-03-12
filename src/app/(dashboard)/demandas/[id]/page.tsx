"use client"

import { useState } from "react"
import useSWR from "swr"
import { useParams, useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Header } from "@/components/layout/Header"
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Clock,
  ExternalLink,
  MessageCircle,
  Send,
  User,
  Video,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const statusLabels: Record<string, string> = {
  pedido_criado: "Pedido Criado",
  planejamento: "Em Planejamento",
  videomaker_notificado: "Videomaker Notificado",
  captacao_agendada: "Captação Agendada",
  captacao_realizada: "Captação Realizada",
  brutos_enviados: "Brutos Enviados",
  editor_atribuido: "Editor Atribuído",
  editando: "Em Edição",
  revisao_interna: "Revisão Interna",
  revisao_pendente: "Aguardando Revisão",
  revisao_reprovada: "Revisão Reprovada",
  aprovado: "Aprovado",
  agendado_publicacao: "Agendado para Publicação",
  publicado: "Publicado",
  urgencia_pendente_aprovacao: "Urgência Pendente",
  urgencia_aprovada: "Urgência Aprovada",
  urgencia_reprovada: "Urgência Reprovada",
  impedimento: "Com Impedimento",
  cancelado: "Cancelado",
}

export default function DemandaDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [comentario, setComentario] = useState("")
  const [sending, setSending] = useState(false)

  const { data, mutate } = useSWR(`/api/demandas/${id}`, fetcher)
  const demanda = data?.demanda

  async function enviarComentario() {
    if (!comentario.trim()) return
    setSending(true)
    await fetch(`/api/demandas/${id}/comentarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: comentario }),
    })
    setComentario("")
    setSending(false)
    mutate()
  }

  if (!demanda) {
    return (
      <>
        <Header title="Carregando..." />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full" />
        </div>
      </>
    )
  }

  return (
    <>
      <Header
        title={demanda.codigo}
        actions={
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
        }
      />

      <main className="flex-1 p-6 grid grid-cols-1 gap-6 lg:grid-cols-3 max-w-6xl mx-auto w-full">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info principal */}
          <div className="bg-white rounded-xl border p-6 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <h1 className="text-xl font-bold text-zinc-900 leading-tight">{demanda.titulo}</h1>
              <StatusBadge status={demanda.statusInterno} />
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed mb-4">{demanda.descricao}</p>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <InfoRow icon={<Video className="w-4 h-4" />} label="Tipo" value={demanda.tipoVideo} />
              <InfoRow icon={<User className="w-4 h-4" />} label="Departamento" value={demanda.departamento} />
              {demanda.cidade && <InfoRow icon={<Calendar className="w-4 h-4" />} label="Cidade" value={demanda.cidade} />}
              {demanda.campanha && <InfoRow icon={<ChevronRight className="w-4 h-4" />} label="Campanha" value={demanda.campanha} />}
              {demanda.objetivo && <InfoRow icon={<ChevronRight className="w-4 h-4" />} label="Objetivo" value={demanda.objetivo} />}
              {demanda.plataforma && <InfoRow icon={<ChevronRight className="w-4 h-4" />} label="Plataforma" value={demanda.plataforma} />}
            </div>
          </div>

          {/* Links */}
          {(demanda.linkBrutos || demanda.linkFinal || demanda.referencia) && (
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <h2 className="font-semibold text-zinc-700 mb-3">Links</h2>
              <div className="space-y-2">
                {demanda.linkBrutos && (
                  <LinkItem label="Brutos" href={demanda.linkBrutos} />
                )}
                {demanda.linkFinal && (
                  <LinkItem label="Arquivo Final" href={demanda.linkFinal} />
                )}
                {demanda.referencia && (
                  <LinkItem label="Referência" href={demanda.referencia} />
                )}
              </div>
            </div>
          )}

          {/* Comentários */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-zinc-500" />
              <h2 className="font-semibold text-zinc-700">Comentários</h2>
            </div>
            <div className="divide-y max-h-64 overflow-y-auto">
              {demanda.comentarios?.length === 0 && (
                <p className="p-4 text-sm text-zinc-400 text-center">Nenhum comentário ainda</p>
              )}
              {demanda.comentarios?.map((c: { id: string; texto: string; createdAt: string; usuario?: { nome: string } }) => (
                <div key={c.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-800">{c.usuario?.nome ?? "Sistema"}</span>
                    <span className="text-xs text-zinc-400">
                      {format(new Date(c.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600">{c.texto}</p>
                </div>
              ))}
            </div>
            <div className="p-3 border-t flex gap-2">
              <input
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && enviarComentario()}
                placeholder="Adicionar comentário..."
                className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-200"
              />
              <button
                onClick={enviarComentario}
                disabled={sending || !comentario.trim()}
                className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-4">
          {/* Pessoas */}
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <h2 className="font-semibold text-zinc-700 mb-3">Pessoas</h2>
            <div className="space-y-3 text-sm">
              {demanda.solicitante && (
                <div>
                  <p className="text-xs text-zinc-400 mb-0.5">Solicitante</p>
                  <p className="font-medium text-zinc-800">{demanda.solicitante.nome}</p>
                </div>
              )}
              {demanda.editor && (
                <div>
                  <p className="text-xs text-zinc-400 mb-0.5">Editor</p>
                  <p className="font-medium text-zinc-800">{demanda.editor.nome}</p>
                </div>
              )}
              {demanda.videomaker && (
                <div>
                  <p className="text-xs text-zinc-400 mb-0.5">Videomaker</p>
                  <p className="font-medium text-zinc-800">{demanda.videomaker.nome}</p>
                </div>
              )}
            </div>
          </div>

          {/* Datas */}
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <h2 className="font-semibold text-zinc-700 mb-3">Datas</h2>
            <div className="space-y-2 text-sm">
              <DateRow label="Criado em" value={demanda.createdAt} />
              {demanda.dataLimite && <DateRow label="Prazo" value={demanda.dataLimite} highlight />}
              {demanda.dataCaptacao && <DateRow label="Captação" value={demanda.dataCaptacao} />}
            </div>
          </div>

          {/* Histórico */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-zinc-700">Histórico</h2>
            </div>
            <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
              {demanda.historicos?.map((h: { id: string; statusNovo: string; createdAt: string; origem: string }) => (
                <div key={h.id} className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-zinc-300 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-zinc-700">
                      {statusLabels[h.statusNovo] ?? h.statusNovo}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {format(new Date(h.createdAt), "dd/MM HH:mm", { locale: ptBR })} · {h.origem}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const isUrgente = status.includes("urgencia")
  const isConcluido = ["aprovado", "publicado"].includes(status)
  return (
    <span
      className={cn(
        "text-xs font-semibold px-2 py-1 rounded-full",
        isUrgente && "bg-red-100 text-red-700",
        isConcluido && "bg-green-100 text-green-700",
        !isUrgente && !isConcluido && "bg-zinc-100 text-zinc-600"
      )}
    >
      {statusLabels[status] ?? status}
    </span>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-400">{icon}</span>
      <span className="text-zinc-500">{label}:</span>
      <span className="font-medium text-zinc-800">{value}</span>
    </div>
  )
}

function LinkItem({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-purple-600 hover:underline"
    >
      <ExternalLink className="w-3.5 h-3.5" /> {label}
    </a>
  )
}

function DateRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const date = new Date(value)
  const isOverdue = highlight && date < new Date()
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={cn("font-medium", isOverdue ? "text-red-600" : "text-zinc-800")}>
        {format(date, "dd/MM/yyyy", { locale: ptBR })}
      </span>
    </div>
  )
}
