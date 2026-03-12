"use client"

import { useState } from "react"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import { cn } from "@/lib/utils"
import { Film, Plus, User } from "lucide-react"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function EquipePage() {
  const [showForm, setShowForm] = useState(false)
  const { data, mutate } = useSWR("/api/editores", fetcher)
  const editores = data?.editores ?? []

  return (
    <>
      <Header
        title="Equipe (Editores)"
        actions={
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Adicionar Editor
          </button>
        }
      />
      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {editores.map((editor: {
            id: string
            nome: string
            email: string
            especialidade: string[]
            cargaLimite: number
            status: string
            demandasAtivas: Array<{ id: string; codigo: string; titulo: string; prioridade: string }>
          }) => {
            const carga = editor.demandasAtivas?.length ?? 0
            const pct = Math.min((carga / editor.cargaLimite) * 100, 100)
            const cargaStatus =
              pct >= 100 ? "sobrecarga" : pct >= 75 ? "atencao" : "ok"

            return (
              <div key={editor.id} className="bg-white rounded-xl border shadow-sm p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-800">{editor.nome}</h3>
                    <p className="text-xs text-zinc-500">{editor.email}</p>
                  </div>
                  <span
                    className={cn(
                      "ml-auto text-xs font-medium px-2 py-0.5 rounded-full",
                      editor.status === "ativo" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                    )}
                  >
                    {editor.status}
                  </span>
                </div>

                {/* Carga */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-500">Carga atual</span>
                    <span
                      className={cn(
                        "font-bold",
                        cargaStatus === "sobrecarga" && "text-red-600",
                        cargaStatus === "atencao" && "text-yellow-600",
                        cargaStatus === "ok" && "text-green-600"
                      )}
                    >
                      {carga}/{editor.cargaLimite}
                    </span>
                  </div>
                  <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        cargaStatus === "sobrecarga" && "bg-red-500",
                        cargaStatus === "atencao" && "bg-yellow-400",
                        cargaStatus === "ok" && "bg-green-500"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Especialidades */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {editor.especialidade?.map((e: string) => (
                    <span key={e} className="text-[10px] bg-zinc-50 border text-zinc-500 px-1.5 py-0.5 rounded">
                      {e}
                    </span>
                  ))}
                </div>

                {/* Demandas ativas */}
                {editor.demandasAtivas?.length > 0 && (
                  <div className="border-t pt-3 space-y-1.5">
                    <p className="text-[10px] text-zinc-400 uppercase font-semibold mb-1.5">Demandas ativas</p>
                    {editor.demandasAtivas.slice(0, 3).map((d) => (
                      <Link key={d.id} href={`/demandas/${d.id}`}>
                        <div className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-zinc-50">
                          <Film className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="text-zinc-600 truncate">{d.codigo} · {d.titulo}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {editores.length === 0 && (
          <div className="text-center py-16 text-zinc-400">
            <p className="text-lg font-medium mb-1">Nenhum editor cadastrado</p>
            <p className="text-sm">Clique em "Adicionar Editor" para começar.</p>
          </div>
        )}
      </main>

      {showForm && <EditorForm onClose={() => { setShowForm(false); mutate() }} />}
    </>
  )
}

function EditorForm({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ nome: "", email: "", cargaLimite: "5", especialidade: [] as string[] })
  const specs = ["institucional", "motion", "aftermovie", "social_media", "reels", "ads", "vsl", "tutorial"]

  function toggleSpec(s: string) {
    setForm((f) => ({
      ...f,
      especialidade: f.especialidade.includes(s)
        ? f.especialidade.filter((x) => x !== s)
        : [...f.especialidade, s],
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch("/api/editores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, cargaLimite: Number(form.cargaLimite) }),
    })
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-zinc-800">Adicionar Editor</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl">&times;</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <input required placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200" />
          <input required placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200" />
          <input placeholder="Limite de demandas" type="number" value={form.cargaLimite} onChange={(e) => setForm({ ...form, cargaLimite: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200" />
          <div>
            <p className="text-xs text-zinc-500 mb-1.5">Especialidades</p>
            <div className="flex flex-wrap gap-1.5">
              {specs.map((s) => (
                <button type="button" key={s} onClick={() => toggleSpec(s)}
                  className={cn("text-xs px-2 py-0.5 rounded border", form.especialidade.includes(s) ? "bg-purple-100 border-purple-300 text-purple-700" : "text-zinc-500")}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
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
