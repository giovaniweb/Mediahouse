"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import { cn } from "@/lib/utils"
import { Film, Plus, User } from "lucide-react"
import Link from "next/link"
import { TagInput } from "@/components/ui/TagInput"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const HABILIDADES_SUGESTOES = [
  "Edição", "Motion Graphics", "Colorização", "3D", "IA Maker",
  "Trilha Sonora", "Animação", "Podcast", "Roteiro", "Narração",
  "After Effects", "Premiere", "DaVinci Resolve", "Final Cut", "Illustrator",
]

export default function EquipePage() {
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()
  const { data, mutate } = useSWR("/api/editores", fetcher)
  const editores = data?.editores ?? []

  return (
    <>
      <Header
        title="Videomakers Int"
        actions={
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Adicionar Videomaker Int
          </button>
        }
      />
      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {editores.map((editor: {
            id: string; nome: string; email: string; telefone?: string
            especialidade: string[]; habilidades?: string[]
            cargaLimite: number; status: string
            demandas: Array<{ id: string; codigo: string; titulo: string; prioridade: string }>
          }) => {
            const carga = editor.demandas?.length ?? 0
            const pct = Math.min((carga / Math.max(editor.cargaLimite, 1)) * 100, 100)
            const cargaStatus = pct >= 100 ? "sobrecarga" : pct >= 75 ? "atencao" : "ok"

            return (
              <div
                key={editor.id}
                onClick={() => router.push(`/equipe/${editor.id}`)}
                className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm p-4 hover:border-zinc-700 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-purple-900/40 border border-purple-800 flex items-center justify-center">
                    <User className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-zinc-100 truncate">{editor.nome}</h3>
                    <p className="text-xs text-zinc-500 truncate">{editor.email}</p>
                  </div>
                  <span className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full border",
                    editor.status === "ativo"
                      ? "bg-green-500/10 text-green-400 border-green-800"
                      : "bg-zinc-800 text-zinc-500 border-zinc-700"
                  )}>
                    {editor.status}
                  </span>
                </div>

                {/* Carga */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-500">Carga atual</span>
                    <span className={cn(
                      "font-bold",
                      cargaStatus === "sobrecarga" ? "text-red-400"
                        : cargaStatus === "atencao" ? "text-yellow-400"
                        : "text-green-400"
                    )}>
                      {carga}/{editor.cargaLimite}
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        cargaStatus === "sobrecarga" ? "bg-red-500"
                          : cargaStatus === "atencao" ? "bg-yellow-400"
                          : "bg-green-500"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Habilidades */}
                {(editor.habilidades?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {editor.habilidades!.slice(0, 4).map((h) => (
                      <span key={h} className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">
                        {h}
                      </span>
                    ))}
                    {(editor.habilidades?.length ?? 0) > 4 && (
                      <span className="text-[10px] text-zinc-600">+{editor.habilidades!.length - 4}</span>
                    )}
                  </div>
                )}

                {/* Especialidades (se não tiver habilidades) */}
                {(editor.habilidades?.length ?? 0) === 0 && editor.especialidade?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {editor.especialidade.slice(0, 4).map((e) => (
                      <span key={e} className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">
                        {e}
                      </span>
                    ))}
                  </div>
                )}

                {/* Demandas ativas */}
                {editor.demandas?.length > 0 && (
                  <div className="border-t border-zinc-800 pt-3 space-y-1">
                    <p className="text-[10px] text-zinc-600 uppercase font-semibold mb-1.5">Demandas ativas</p>
                    {editor.demandas.slice(0, 3).map((d) => (
                      <Link key={d.id} href={`/demandas/${d.id}`} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-zinc-800 transition-colors">
                          <Film className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                          <span className="text-zinc-400 truncate">{d.codigo} · {d.titulo}</span>
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
          <div className="text-center py-16 text-zinc-500">
            <p className="text-lg font-medium mb-1">Nenhum Videomaker Int cadastrado</p>
            <p className="text-sm">Clique em "Adicionar Videomaker Int" para começar.</p>
          </div>
        )}
      </main>

      {showForm && <EditorForm onClose={() => { setShowForm(false); mutate() }} />}
    </>
  )
}

function EditorForm({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nome: "", email: "", telefone: "", cargaLimite: "5",
    status: "ativo",
    especialidade: [] as string[],
    habilidades: [] as string[],
  })
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
    try {
      const res = await fetch("/api/editores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, cargaLimite: Number(form.cargaLimite) }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Editor adicionado!")
      onClose()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="font-semibold text-white">Adicionar Videomaker Int</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl">&times;</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3 overflow-y-auto flex-1">
          <input required placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inp} />
          <input required placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} />
          <input placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={inp} />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Limite de demandas" type="number" value={form.cargaLimite} onChange={(e) => setForm({ ...form, cargaLimite: e.target.value })} className={inp} />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inp}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          <div>
            <p className="text-xs text-zinc-400 mb-2">Especialidades</p>
            <div className="flex flex-wrap gap-1.5">
              {specs.map((s) => (
                <button type="button" key={s} onClick={() => toggleSpec(s)}
                  className={cn("text-xs px-2 py-1 rounded border transition-colors",
                    form.especialidade.includes(s)
                      ? "bg-purple-600 border-purple-700 text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  )}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-zinc-400 mb-2">Habilidades</p>
            <TagInput
              value={form.habilidades}
              onChange={(tags) => setForm({ ...form, habilidades: tags })}
              suggestions={HABILIDADES_SUGESTOES}
              placeholder="Selecione ou adicione..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-zinc-700 rounded-lg text-zinc-400 hover:bg-zinc-800">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60">
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inp = "w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500"
