"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import { ArrowLeft, Film, MapPin, Phone, Mail, Star, Edit2, Save, X } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const statusConfig: Record<string, { label: string; class: string }> = {
  preferencial: { label: "Preferencial", class: "bg-purple-100 text-purple-700" },
  ativo: { label: "Ativo", class: "bg-green-100 text-green-700" },
  inativo: { label: "Inativo", class: "bg-zinc-100 text-zinc-500" },
  bloqueado: { label: "Bloqueado", class: "bg-red-100 text-red-700" },
}

const prioridadeConfig: Record<string, string> = {
  urgente: "bg-red-100 text-red-700",
  alta: "bg-orange-100 text-orange-700",
  normal: "bg-zinc-100 text-zinc-600",
}

export default function VideomakerDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data, mutate } = useSWR(`/api/videomakers/${id}`, fetcher)
  const vm = data?.videomaker
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})

  function startEdit() {
    if (!vm) return
    setForm({
      nome: vm.nome ?? "",
      cidade: vm.cidade ?? "",
      estado: vm.estado ?? "",
      telefone: vm.telefone ?? "",
      email: vm.email ?? "",
      valorDiaria: vm.valorDiaria?.toString() ?? "",
      avaliacao: vm.avaliacao?.toString() ?? "5",
      status: vm.status ?? "ativo",
      observacoes: vm.observacoes ?? "",
      portfolio: vm.portfolio ?? "",
    })
    setEditing(true)
  }

  async function saveEdit() {
    setLoading(true)
    await fetch(`/api/videomakers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        valorDiaria: Number(form.valorDiaria),
        avaliacao: Number(form.avaliacao),
      }),
    })
    setLoading(false)
    setEditing(false)
    mutate()
  }

  if (!vm) {
    return (
      <>
        <Header title="Videomaker" />
        <main className="flex-1 p-6 flex items-center justify-center text-zinc-400">
          Carregando...
        </main>
      </>
    )
  }

  const cfg = statusConfig[vm.status] ?? statusConfig.ativo

  return (
    <>
      <Header
        title={vm.nome}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 border rounded-lg px-3 py-1.5"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            {!editing ? (
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 text-sm bg-purple-600 text-white hover:bg-purple-700 rounded-lg px-3 py-1.5"
              >
                <Edit2 className="w-4 h-4" /> Editar
              </button>
            ) : (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 text-zinc-600"
                >
                  <X className="w-4 h-4" /> Cancelar
                </button>
                <button
                  onClick={saveEdit}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg px-3 py-1.5 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" /> {loading ? "Salvando..." : "Salvar"}
                </button>
              </>
            )}
          </div>
        }
      />

      <main className="flex-1 p-6 max-w-4xl space-y-6">
        {/* Perfil */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center text-2xl font-bold text-purple-600">
                {vm.nome?.charAt(0)}
              </div>
              <div>
                {editing ? (
                  <input
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="text-xl font-bold border rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-purple-200"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-zinc-800">{vm.nome}</h2>
                )}
                <div className="flex items-center gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={cn(
                        "w-4 h-4",
                        n <= Math.round(vm.avaliacao) ? "text-yellow-400 fill-yellow-400" : "text-zinc-200"
                      )}
                    />
                  ))}
                  <span className="text-sm text-zinc-500 ml-1">{vm.avaliacao?.toFixed(1)}</span>
                </div>
              </div>
            </div>
            {editing ? (
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="text-sm border rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-purple-200"
              >
                <option value="ativo">Ativo</option>
                <option value="preferencial">Preferencial</option>
                <option value="inativo">Inativo</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            ) : (
              <span className={cn("text-sm font-medium px-3 py-1 rounded-full", cfg.class)}>
                {cfg.label}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-zinc-600">
              <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
              {editing ? (
                <div className="flex gap-2 flex-1">
                  <input
                    placeholder="Cidade"
                    value={form.cidade}
                    onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                    className="flex-1 border rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-purple-200"
                  />
                  <input
                    placeholder="UF"
                    maxLength={2}
                    value={form.estado}
                    onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })}
                    className="w-14 border rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-purple-200"
                  />
                </div>
              ) : (
                <span>{vm.cidade}, {vm.estado}</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-zinc-600">
              <Phone className="w-4 h-4 text-zinc-400 shrink-0" />
              {editing ? (
                <input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  className="flex-1 border rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-purple-200"
                />
              ) : (
                <span>{vm.telefone}</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-zinc-600">
              <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
              {editing ? (
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="flex-1 border rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-purple-200"
                />
              ) : (
                <span>{vm.email}</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-zinc-600">
              <span className="text-zinc-400 text-xs font-medium">R$/dia</span>
              {editing ? (
                <input
                  type="number"
                  value={form.valorDiaria}
                  onChange={(e) => setForm({ ...form, valorDiaria: e.target.value })}
                  className="flex-1 border rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-purple-200"
                />
              ) : (
                <span className="font-semibold">R$ {vm.valorDiaria?.toLocaleString("pt-BR")}</span>
              )}
            </div>
          </div>

          {/* Áreas de atuação */}
          {vm.areasAtuacao?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {vm.areasAtuacao.map((a: string) => (
                <span key={a} className="text-xs bg-purple-50 border border-purple-100 text-purple-700 px-2 py-0.5 rounded">
                  {a}
                </span>
              ))}
            </div>
          )}

          {/* Avaliação edit */}
          {editing && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Avaliação (1-5)</label>
                <input
                  type="number" min="1" max="5" step="0.1"
                  value={form.avaliacao}
                  onChange={(e) => setForm({ ...form, avaliacao: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Portfolio (URL)</label>
                <input
                  value={form.portfolio}
                  onChange={(e) => setForm({ ...form, portfolio: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">Observações</label>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  rows={2}
                  className="w-full border rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-purple-200 resize-none"
                />
              </div>
            </div>
          )}

          {/* Portfolio e observações (view mode) */}
          {!editing && (vm.portfolio || vm.observacoes) && (
            <div className="mt-4 space-y-2 text-sm">
              {vm.portfolio && (
                <div>
                  <span className="text-zinc-400 text-xs font-medium uppercase">Portfolio</span>
                  <a href={vm.portfolio} target="_blank" rel="noreferrer" className="block text-purple-600 hover:underline truncate">
                    {vm.portfolio}
                  </a>
                </div>
              )}
              {vm.observacoes && (
                <div>
                  <span className="text-zinc-400 text-xs font-medium uppercase">Observações</span>
                  <p className="text-zinc-600 mt-0.5">{vm.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Histórico de demandas */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold text-zinc-800 mb-4 flex items-center gap-2">
            <Film className="w-4 h-4 text-zinc-400" />
            Demandas ({vm.demandas?.length ?? 0})
          </h3>

          {vm.demandas?.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-6">Nenhuma demanda registrada.</p>
          )}

          <div className="space-y-2">
            {vm.demandas?.map((d: {
              id: string
              codigo: string
              titulo: string
              statusVisivel: string
              prioridade: string
              createdAt: string
            }) => (
              <Link key={d.id} href={`/demandas/${d.id}`}>
                <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-100 transition-colors">
                  <Film className="w-4 h-4 text-zinc-300 shrink-0" />
                  <span className="font-mono text-xs text-zinc-400 shrink-0">{d.codigo}</span>
                  <span className="flex-1 text-sm text-zinc-700 truncate">{d.titulo}</span>
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", prioridadeConfig[d.prioridade] ?? prioridadeConfig.normal)}>
                    {d.prioridade}
                  </span>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {format(new Date(d.createdAt), "dd/MM/yy", { locale: ptBR })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
