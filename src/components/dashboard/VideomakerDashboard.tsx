"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Film, Calendar, FileText, FolderOpen, X, ExternalLink,
  Pencil, Check, Clock, AlertTriangle, CheckCircle2, Building2,
  CreditCard, MapPin, Mail, Phone,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  entrada: { label: "Entrada", color: "bg-zinc-700/50 text-zinc-400" },
  producao: { label: "Produção", color: "bg-blue-500/15 text-blue-400" },
  edicao: { label: "Edição", color: "bg-purple-500/15 text-purple-400" },
  aprovacao: { label: "Aprovação", color: "bg-amber-500/15 text-amber-400" },
  para_postar: { label: "Para Postar", color: "bg-cyan-500/15 text-cyan-400" },
  finalizado: { label: "Concluído", color: "bg-emerald-500/15 text-emerald-400" },
}

const NF_STATUS: Record<string, { label: string; color: string }> = {
  pendente: { label: "Aguardando envio", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  enviada: { label: "Enviada", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  aprovada: { label: "Aprovada", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  rejeitada: { label: "Rejeitada", color: "bg-red-500/15 text-red-400 border-red-500/30" },
}

interface FolderInlineEditProps {
  demandaId: string
  campo: "linkFolderBrutos" | "linkFolderFinal"
  valor?: string | null
  label: string
  onSaved: () => void
}

function FolderInlineEdit({ demandaId, campo, valor, label, onSaved }: FolderInlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(valor ?? "")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!input.trim()) return
    setSaving(true)
    await fetch(`/api/demandas/${demandaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: input.trim() }),
    })
    setSaving(false)
    setEditing(false)
    onSaved()
  }

  if (valor && !editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">{label}:</span>
        <a href={valor} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 truncate max-w-[180px]">
          <FolderOpen className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">Abrir pasta</span>
          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
        </a>
        <button onClick={() => { setInput(valor); setEditing(true) }}
          className="p-0.5 text-zinc-600 hover:text-zinc-400">
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-zinc-500">{label}:</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Cole o link do Drive..."
          className="flex-1 text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-zinc-200 outline-none focus:border-purple-500"
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false) }}
          autoFocus
        />
        <button onClick={save} disabled={saving}
          className="p-0.5 text-emerald-400 hover:text-emerald-300">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setEditing(false)} className="p-0.5 text-zinc-600 hover:text-zinc-400">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-500">{label}:</span>
      <button onClick={() => setEditing(true)}
        className="text-xs text-zinc-600 hover:text-zinc-400 underline underline-offset-2">
        + Adicionar link
      </button>
    </div>
  )
}

export function VideomakerDashboard() {
  const [welcomeDismissed, setWelcomeDismissed] = useState(true)
  const { data: vmData, mutate: mutateVm } = useSWR("/api/me/videomaker", fetcher)
  const { data: empresaData } = useSWR("/api/config/empresa", fetcher)

  // Checar localStorage após hydration
  useEffect(() => {
    setWelcomeDismissed(localStorage.getItem("vm-welcome-dismissed") === "1")
  }, [])

  const dismissWelcome = () => {
    localStorage.setItem("vm-welcome-dismissed", "1")
    setWelcomeDismissed(true)
  }

  const vm = vmData?.videomaker
  const empresa = empresaData?.empresa
  const demandas: Array<{
    id: string; codigo: string; titulo: string; tipoVideo: string;
    statusVisivel: string; statusInterno: string; prioridade: string;
    dataLimite?: string | null; dataCaptacao?: string | null;
    linkBrutos?: string | null; linkFinal?: string | null;
    linkFolderBrutos?: string | null; linkFolderFinal?: string | null;
    finalizadaEm?: string | null; createdAt: string;
  }> = vm?.demandas ?? []
  const notasFiscais: Array<{
    id: string; status: string; nomeArquivo?: string | null; token: string; createdAt: string;
    demanda?: { codigo: string; titulo: string } | null;
  }> = vm?.notasFiscais ?? []

  // Separar demandas: ativas vs coberturas (para pastas)
  const demandasAtivas = demandas.filter(d => d.statusVisivel !== "finalizado")
  const coberturas = demandas.filter(d => d.tipoVideo?.toLowerCase().includes("cobertura"))

  return (
    <main className="flex-1 p-6 space-y-6">
      {/* Banner de boas-vindas */}
      {!welcomeDismissed && (
        <div className="relative bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-xl p-5">
          <button onClick={dismissWelcome}
            className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-4">
            <span className="text-3xl">🎬</span>
            <div>
              <h2 className="text-lg font-bold text-zinc-100 mb-1">
                Bem-vindo ao NuFlow{vm?.nome ? `, ${vm.nome.split(" ")[0]}` : ""}! 👋
              </h2>
              <p className="text-sm text-zinc-300 leading-relaxed max-w-2xl">
                Aqui você acompanha suas demandas ativas, acessa os links das pastas de cobertura
                e consulta suas notas fiscais. Você pode usar o campo abaixo para colar os links
                do Google Drive das suas pastas de brutos e material pronto.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_20rem] gap-6">
        {/* Coluna esquerda */}
        <div className="space-y-6">
          {/* Minhas Demandas Ativas */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Film className="w-4 h-4 text-purple-400" />
                Minhas Demandas Ativas
                <span className="text-xs bg-zinc-800 text-zinc-400 rounded-full px-2 py-0.5 border border-zinc-700">
                  {demandasAtivas.length}
                </span>
              </h2>
              <Link href="/demandas" className="text-xs text-purple-400 hover:text-purple-300">
                Ver todas →
              </Link>
            </div>

            {demandasAtivas.length === 0 ? (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">Nenhuma demanda ativa no momento</p>
              </div>
            ) : (
              <div className="space-y-2">
                {demandasAtivas.map((d) => {
                  const st = STATUS_LABELS[d.statusVisivel] ?? STATUS_LABELS.entrada
                  const isOverdue = d.dataLimite && new Date(d.dataLimite) < new Date()
                  const isUrgent = d.prioridade === "urgente"
                  return (
                    <Link key={d.id} href={`/demandas/${d.id}`}>
                      <div className={cn(
                        "group bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-all cursor-pointer",
                        isUrgent && "border-l-[3px] border-l-red-500",
                        d.prioridade === "alta" && "border-l-[3px] border-l-orange-500",
                      )}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono text-zinc-500 flex-shrink-0">{d.codigo}</span>
                            <p className="text-sm font-medium text-zinc-200 truncate">{d.titulo}</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", st.color)}>
                              {st.label}
                            </span>
                            {d.dataLimite && (
                              <span className={cn("flex items-center gap-0.5 text-[10px]",
                                isOverdue ? "text-red-400" : "text-zinc-500"
                              )}>
                                {isOverdue && <AlertTriangle className="w-2.5 h-2.5" />}
                                {!isOverdue && <Clock className="w-2.5 h-2.5" />}
                                {format(new Date(d.dataLimite), "dd/MM", { locale: ptBR })}
                              </span>
                            )}
                          </div>
                        </div>
                        {d.dataCaptacao && (
                          <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" />
                            Captação: {format(new Date(d.dataCaptacao), "dd 'de' MMMM", { locale: ptBR })}
                          </p>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>

          {/* Pastas de Cobertura */}
          {coberturas.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-3">
                <FolderOpen className="w-4 h-4 text-amber-400" />
                Pastas de Cobertura
              </h2>
              <div className="space-y-2">
                {coberturas.map((d) => (
                  <div key={d.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-zinc-500">{d.codigo}</span>
                      <span className="text-sm font-medium text-zinc-200 truncate">{d.titulo}</span>
                    </div>
                    <div className="space-y-1.5 pl-1">
                      <FolderInlineEdit
                        demandaId={d.id}
                        campo="linkFolderBrutos"
                        valor={d.linkFolderBrutos}
                        label="Material Bruto"
                        onSaved={() => mutateVm()}
                      />
                      <FolderInlineEdit
                        demandaId={d.id}
                        campo="linkFolderFinal"
                        valor={d.linkFolderFinal}
                        label="Material Pronto"
                        onSaved={() => mutateVm()}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Coluna direita */}
        <div className="space-y-6">
          {/* Dados para Nota Fiscal */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-emerald-400" />
              Dados para Nota Fiscal
            </h2>
            {!empresa ? (
              <p className="text-xs text-zinc-500">Dados não cadastrados. Contate a equipe.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {empresa.razaoSocial && (
                  <div>
                    <span className="text-zinc-500">Empresa:</span>
                    <p className="text-zinc-200 font-medium mt-0.5">{empresa.razaoSocial}</p>
                    {empresa.nomeFantasia && empresa.nomeFantasia !== empresa.razaoSocial && (
                      <p className="text-zinc-400">{empresa.nomeFantasia}</p>
                    )}
                  </div>
                )}
                {empresa.cnpj && (
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-400">CNPJ:</span>
                    <span className="text-zinc-200 font-mono">{empresa.cnpj}</span>
                  </div>
                )}
                {(empresa.endereco || empresa.cidade) && (
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3 h-3 text-zinc-500 mt-0.5" />
                    <div>
                      {empresa.endereco && <p className="text-zinc-300">{empresa.endereco}</p>}
                      {empresa.bairro && <p className="text-zinc-400">{empresa.bairro}</p>}
                      {empresa.cidade && (
                        <p className="text-zinc-400">{empresa.cidade}{empresa.estado ? ` — ${empresa.estado}` : ""}{empresa.cep ? `, CEP ${empresa.cep}` : ""}</p>
                      )}
                    </div>
                  </div>
                )}
                {empresa.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-300">{empresa.email}</span>
                  </div>
                )}
                {empresa.telefone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-300">{empresa.telefone}</span>
                  </div>
                )}
                {empresa.pixKey && (
                  <div className="mt-2 p-2 bg-emerald-950/30 border border-emerald-500/20 rounded-lg">
                    <p className="text-zinc-400 mb-0.5">Chave PIX ({empresa.pixTipo ?? ""})</p>
                    <p className="text-emerald-400 font-medium font-mono text-[11px] break-all">{empresa.pixKey}</p>
                  </div>
                )}
                {empresa.observacoesNF && (
                  <div className="mt-2 p-2 bg-amber-950/20 border border-amber-500/20 rounded-lg text-amber-300/80 text-[11px] leading-relaxed">
                    📌 {empresa.observacoesNF}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Minhas Notas Fiscais */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                Minhas Notas Fiscais
              </h2>
              <Link href="/minhas-notas" className="text-xs text-blue-400 hover:text-blue-300">
                Ver todas →
              </Link>
            </div>

            {notasFiscais.length === 0 ? (
              <p className="text-xs text-zinc-500">Nenhuma nota fiscal registrada.</p>
            ) : (
              <div className="space-y-2">
                {notasFiscais.slice(0, 5).map((nf) => {
                  const st = NF_STATUS[nf.status] ?? NF_STATUS.pendente
                  return (
                    <div key={nf.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-300 truncate">
                          {nf.demanda?.codigo ?? "—"} · {nf.demanda?.titulo ?? "Demanda"}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {format(new Date(nf.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", st.color)}>
                          {st.label}
                        </span>
                        {nf.status === "pendente" && (
                          <a href={`/nf-upload/${nf.token}`} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-purple-400 hover:text-purple-300 underline">
                            Enviar
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
