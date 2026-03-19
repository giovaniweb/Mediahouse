"use client"

import { useState } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { Header } from "@/components/layout/Header"
import { MapPin, Phone, Plus, Star, Trash2, AlertTriangle, Filter } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { TagInput } from "@/components/ui/TagInput"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const statusConfig = {
  ativo: { label: "Ativo", class: "bg-green-500/20 text-green-300 border border-green-700" },
  inativo: { label: "Inativo", class: "bg-zinc-700/50 text-zinc-400 border border-zinc-600" },
}

const HABILIDADES_SUGESTOES = [
  "Edição", "Motion Graphics", "Colorização", "3D", "IA Maker",
  "Trilha Sonora", "Animação", "Podcast", "Roteiro", "Narração",
  "After Effects", "Premiere", "DaVinci Resolve", "Final Cut", "Illustrator",
  "Captação com câmera", "Captação com celular", "Fotos", "Drone",
]

type FiltroStatus = "todos" | "ativo" | "inativo"

interface Editor {
  id: string
  nome: string
  cidade: string
  estado: string
  telefone: string
  email: string
  avaliacao: number
  status: keyof typeof statusConfig
  areasAtuacao: string[]
  habilidades: string[]
  especialidade: string[]
  emListaNegra: boolean
  cargaLimite: number
  demandas: Array<{ id: string; codigo: string; titulo: string; prioridade: string; statusVisivel: string }>
}

export default function EquipePage() {
  const [showForm, setShowForm] = useState(false)
  const [filtro, setFiltro] = useState<FiltroStatus>("todos")
  const { data, mutate } = useSWR("/api/editores", fetcher)
  const editores: Editor[] = data?.editores ?? []

  const lista = editores.filter((ed) => {
    if (filtro === "todos") return true
    return ed.status === filtro
  })

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Remover "${nome}"? Esta ação é irreversível.`)) return
    const res = await fetch(`/api/editores/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Editor removido")
      mutate()
    } else {
      toast.error("Erro ao remover")
    }
  }

  return (
    <>
      <Header
        title="Videomakers Int"
        actions={
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Cadastrar
          </button>
        }
      />
      <main className="flex-1 p-6">
        {/* Filtros */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Filter className="h-4 w-4 text-zinc-500" />
          {(["todos", "ativo", "inativo"] as FiltroStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                filtro === f
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
              )}
            >
              {f === "todos" ? "Todos" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((ed) => {
            const cfg = statusConfig[ed.status] ?? statusConfig.ativo
            const carga = ed.demandas?.length ?? 0
            const pct = Math.min((carga / Math.max(ed.cargaLimite, 1)) * 100, 100)
            const cargaStatus = pct >= 100 ? "sobrecarga" : pct >= 75 ? "atencao" : "ok"

            return (
              <div key={ed.id} className="relative group">
                <Link href={`/equipe/${ed.id}`}>
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm p-4 hover:border-zinc-600 transition-all cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-zinc-100 truncate">{ed.nome}</h3>
                        </div>
                        {(ed.cidade || ed.estado) && (
                          <div className="flex items-center gap-1 mt-0.5 text-xs text-zinc-500">
                            <MapPin className="w-3 h-3" />
                            <span>{[ed.cidade, ed.estado].filter(Boolean).join(", ")}</span>
                          </div>
                        )}
                      </div>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full ml-2 shrink-0", cfg.class)}>
                        {cfg.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 mb-3">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={cn("w-3.5 h-3.5", n <= Math.round(ed.avaliacao ?? 0) ? "text-yellow-400 fill-yellow-400" : "text-zinc-700")}
                        />
                      ))}
                      <span className="text-xs text-zinc-500 ml-1">{(ed.avaliacao ?? 0).toFixed(1)}</span>
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
                          {carga}/{ed.cargaLimite}
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
                    {(ed.habilidades?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {ed.habilidades.slice(0, 4).map((h) => (
                          <span key={h} className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">
                            {h}
                          </span>
                        ))}
                        {ed.habilidades.length > 4 && (
                          <span className="text-[10px] text-zinc-600">+{ed.habilidades.length - 4}</span>
                        )}
                      </div>
                    )}

                    {/* Especialidades (fallback if no habilidades) */}
                    {(ed.habilidades?.length ?? 0) === 0 && ed.especialidade?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {ed.especialidade.slice(0, 4).map((e) => (
                          <span key={e} className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">
                            {e}
                          </span>
                        ))}
                        {ed.especialidade.length > 4 && (
                          <span className="text-[10px] text-zinc-600">+{ed.especialidade.length - 4}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1 text-zinc-500 text-xs">
                        <Phone className="w-3 h-3" />
                        <span>{ed.telefone || "—"}</span>
                      </div>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(ed.id, ed.nome) }}
                        className="p-1 text-zinc-600 hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>

        {lista.length === 0 && (
          <div className="text-center py-16 text-zinc-500">
            <p className="text-lg font-medium mb-1">Nenhum editor encontrado</p>
            <p className="text-sm">Clique em &quot;Cadastrar&quot; para adicionar o primeiro.</p>
          </div>
        )}
      </main>

      {showForm && <EditorForm onClose={() => { setShowForm(false); mutate() }} />}
    </>
  )
}

function EditorForm({ onClose }: { onClose: () => void }) {
  const { data: session } = useSession()
  const userTipo = (session?.user as { tipo?: string } | undefined)?.tipo
  const isPrivileged = userTipo === "admin" || userTipo === "gestor"

  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nome: "", cidade: "", estado: "", telefone: "", whatsapp: "", email: "",
    salario: "", status: "ativo", cpfCnpj: "", chavePix: "",
    cargaLimite: "5",
    areasAtuacao: [] as string[], habilidades: [] as string[],
    especialidade: [] as string[],
    portfolio: "", observacoes: "",
  })

  const areas = ["eventos", "institucional", "ads", "social_media", "reels", "aftermovie", "corporativo"]
  const specs = ["institucional", "motion", "aftermovie", "social_media", "reels", "ads", "vsl", "tutorial"]

  function toggleArea(a: string) {
    setForm((f) => ({
      ...f,
      areasAtuacao: f.areasAtuacao.includes(a)
        ? f.areasAtuacao.filter((x) => x !== a)
        : [...f.areasAtuacao, a],
    }))
  }

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
      const { salario, ...rest } = form
      const payload: Record<string, unknown> = {
        ...rest,
        cargaLimite: Number(form.cargaLimite),
      }
      if (isPrivileged && salario) {
        payload.salario = Number(salario)
      }
      const res = await fetch("/api/editores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Editor cadastrado!")
      onClose()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="font-semibold text-white">Cadastrar Editor</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Nome *</label>
              <input required placeholder="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Telefone</label>
              <input placeholder="(11) 99999-9999" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">WhatsApp</label>
              <input placeholder="(11) 99999-9999" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className={inp} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">E-mail</label>
              <input type="email" placeholder="email@exemplo.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Cidade</label>
              <input placeholder="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">UF</label>
              <input placeholder="SP" maxLength={2} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} className={inp} />
            </div>
            {isPrivileged && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Salario (R$)</label>
                <input type="number" placeholder="0,00" value={form.salario} onChange={(e) => setForm({ ...form, salario: e.target.value })} className={inp} />
              </div>
            )}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Limite de demandas</label>
              <input type="number" placeholder="5" value={form.cargaLimite} onChange={(e) => setForm({ ...form, cargaLimite: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inp}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">CPF/CNPJ</label>
              <input placeholder="000.000.000-00" value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Chave PIX</label>
              <input placeholder="CPF, e-mail, telefone ou chave" value={form.chavePix} onChange={(e) => setForm({ ...form, chavePix: e.target.value })} className={inp} />
            </div>
          </div>

          <div>
            <p className="text-xs text-zinc-400 mb-2">Areas de atuacao</p>
            <div className="flex flex-wrap gap-1.5">
              {areas.map((a) => (
                <button type="button" key={a} onClick={() => toggleArea(a)}
                  className={cn("text-xs px-2 py-1 rounded border transition-colors",
                    form.areasAtuacao.includes(a)
                      ? "bg-purple-600 border-purple-700 text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  )}>
                  {a}
                </button>
              ))}
            </div>
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
              placeholder="Selecione ou adicione habilidades..."
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Portfolio (URL)</label>
            <input placeholder="https://..." value={form.portfolio} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} className={inp} />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Observacoes</label>
            <textarea placeholder="Observacoes sobre o editor..." value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} className={`${inp} resize-none`} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
