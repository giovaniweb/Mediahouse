"use client"

import { useState } from "react"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import { MapPin, Phone, Plus, Star, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const statusConfig = {
  preferencial: { label: "Preferencial", class: "bg-purple-100 text-purple-700" },
  ativo: { label: "Ativo", class: "bg-green-100 text-green-700" },
  inativo: { label: "Inativo", class: "bg-zinc-100 text-zinc-500" },
  bloqueado: { label: "Bloqueado", class: "bg-red-100 text-red-700" },
}

export default function VideomakersPage() {
  const [showForm, setShowForm] = useState(false)
  const { data, mutate } = useSWR("/api/videomakers", fetcher)
  const videomakers = data?.videomakers ?? []

  async function handleDelete(id: string) {
    if (!confirm("Remover este videomaker?")) return
    await fetch(`/api/videomakers/${id}`, { method: "DELETE" })
    mutate()
  }

  return (
    <>
      <Header
        title="Videomakers"
        actions={
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Cadastrar
          </button>
        }
      />
      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videomakers.map((vm: {
            id: string
            nome: string
            cidade: string
            estado: string
            telefone: string
            email: string
            valorDiaria: number
            avaliacao: number
            status: keyof typeof statusConfig
            areasAtuacao: string[]
          }) => {
            const cfg = statusConfig[vm.status] ?? statusConfig.ativo
            return (
              <Link key={vm.id} href={`/videomakers/${vm.id}`}>
              <div className="bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-zinc-800">{vm.nome}</h3>
                    <div className="flex items-center gap-1 mt-0.5 text-sm text-zinc-500">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{vm.cidade}, {vm.estado}</span>
                    </div>
                  </div>
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", cfg.class)}>
                    {cfg.label}
                  </span>
                </div>

                <div className="flex items-center gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={cn("w-3.5 h-3.5", n <= Math.round(vm.avaliacao) ? "text-yellow-400 fill-yellow-400" : "text-zinc-200")}
                    />
                  ))}
                  <span className="text-xs text-zinc-500 ml-1">{vm.avaliacao?.toFixed(1)}</span>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {vm.areasAtuacao?.slice(0, 3).map((a: string) => (
                    <span key={a} className="text-[10px] bg-zinc-50 border text-zinc-600 px-1.5 py-0.5 rounded">
                      {a}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1 text-zinc-500">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{vm.telefone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-700">
                      R$ {vm.valorDiaria?.toLocaleString("pt-BR")}/dia
                    </span>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(vm.id) }}
                      className="p-1 text-zinc-300 hover:text-red-500 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              </Link>
            )
          })}
        </div>

        {videomakers.length === 0 && (
          <div className="text-center py-16 text-zinc-400">
            <p className="text-lg font-medium mb-1">Nenhum videomaker cadastrado</p>
            <p className="text-sm">Clique em "Cadastrar" para adicionar o primeiro.</p>
          </div>
        )}
      </main>

      {showForm && <VideomakerForm onClose={() => { setShowForm(false); mutate() }} />}
    </>
  )
}

function VideomakerForm({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nome: "", cidade: "", estado: "", telefone: "", email: "",
    valorDiaria: "", avaliacao: "5", status: "ativo",
    areasAtuacao: [] as string[],
  })

  const areas = ["eventos", "institucional", "ads", "social_media", "reels", "aftermovie"]

  function toggleArea(a: string) {
    setForm((f) => ({
      ...f,
      areasAtuacao: f.areasAtuacao.includes(a)
        ? f.areasAtuacao.filter((x) => x !== a)
        : [...f.areasAtuacao, a],
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch("/api/videomakers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, valorDiaria: Number(form.valorDiaria), avaliacao: Number(form.avaliacao) }),
    })
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-zinc-800">Cadastrar Videomaker</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inp} />
            <input required placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={inp} />
            <input required placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} />
            <input required placeholder="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className={inp} />
            <input required placeholder="Estado (UF)" maxLength={2} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} className={inp} />
            <input required placeholder="Valor/dia (R$)" type="number" value={form.valorDiaria} onChange={(e) => setForm({ ...form, valorDiaria: e.target.value })} className={inp} />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inp}>
              <option value="ativo">Ativo</option>
              <option value="preferencial">Preferencial</option>
              <option value="inativo">Inativo</option>
            </select>
            <input placeholder="Avaliação (1-5)" type="number" min="1" max="5" step="0.1" value={form.avaliacao} onChange={(e) => setForm({ ...form, avaliacao: e.target.value })} className={inp} />
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1.5">Áreas de atuação</p>
            <div className="flex flex-wrap gap-1.5">
              {areas.map((a) => (
                <button type="button" key={a} onClick={() => toggleArea(a)}
                  className={cn("text-xs px-2 py-0.5 rounded border", form.areasAtuacao.includes(a) ? "bg-purple-100 border-purple-300 text-purple-700" : "text-zinc-500")}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg text-zinc-600 hover:bg-zinc-50">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60">
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inp = "w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"
