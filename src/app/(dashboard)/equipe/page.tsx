"use client"

import styles from "@/components/layout/TeamSurface.module.css"
import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { Header } from "@/components/layout/Header"
import { MapPin, Phone, Plus, Star, Trash2, AlertTriangle, Filter, Search, Activity, CheckCircle, Film } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { TagInput } from "@/components/ui/TagInput"
import { toast } from "sonner"
import { mensagemDeErro } from "@/lib/erro-cliente"
import { fetcher } from "@/lib/fetcher"


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
  _count?: { avaliacoes?: number }
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
  const [busca, setBusca] = useState("")
  const { data, error, isLoading, isValidating, mutate } = useSWR("/api/editores", fetcher)
  const editores: Editor[] = data?.editores ?? []

  const lista = editores.filter((ed) => {
    if (filtro !== "todos" && ed.status !== filtro) return false
    if (busca.trim()) {
      const q = busca.toLowerCase()
      return (
        ed.nome?.toLowerCase().includes(q) ||
        ed.cidade?.toLowerCase().includes(q) ||
        ed.estado?.toLowerCase().includes(q) ||
        ed.email?.toLowerCase().includes(q) ||
        ed.telefone?.includes(q) ||
        ed.especialidade?.some(s => s.toLowerCase().includes(q))
      )
    }
    return true
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
        title="Videomakers Internos"
        actions={
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Cadastrar
          </button>
        }
      />
      <main className={styles.page}>
        <p className={styles.eyebrow}>AUDIOVISUAL / EQUIPE INTERNA</p>
        <h1 className={styles.title}>Pessoas, talento e capacidade.</h1>
        <p className={styles.subtitle}>Veja quem está na equipe e a distribuição dos trabalhos em andamento.</p>
        {error ? (
          <div role="alert" className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
            <p>Não foi possível carregar a equipe.</p>
            <button disabled={isValidating} onClick={() => mutate()} className="mt-3 px-4 rounded-lg border border-purple-400 text-purple-300">
              {isValidating ? "Tentando novamente…" : "Tentar novamente"}
            </button>
          </div>
        ) : isLoading ? (
          <p role="status" className="text-zinc-400 py-8">Carregando equipe…</p>
        ) : <>
        {/* Filtros */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Filter className="h-4 w-4 text-zinc-500" />
          {(["todos", "ativo", "inativo"] as FiltroStatus[]).map((f) => (
            <button
              aria-pressed={filtro === f}
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

        {/* KPIs */}
        {(() => {
          const ativos = editores.filter(e => e.status === "ativo")
          const totalCarga = ativos.reduce((s, e) => s + (e.demandas?.length ?? 0), 0)
          const totalLimite = ativos.reduce((s, e) => s + (e.cargaLimite ?? 5), 0)
          const sobrecarregados = ativos.filter(e => (e.demandas?.length ?? 0) >= (e.cargaLimite ?? 5)).length
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-zinc-500">Editores Ativos</span>
                </div>
                <p className="text-2xl font-bold text-zinc-100">{ativos.length}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Film className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-zinc-500">Demandas em Curso</span>
                </div>
                <p className="text-2xl font-bold text-zinc-100">{totalCarga}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-zinc-500">Capacidade Total</span>
                </div>
                <p className="text-2xl font-bold text-zinc-100">{totalCarga}/{totalLimite}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-zinc-500">Sobrecarregados</span>
                </div>
                <p className="text-2xl font-bold text-zinc-100">{sobrecarregados}</p>
              </div>
            </div>
          )
        })()}

        {/* Busca */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            aria-label="Buscar na equipe"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, cidade, especialidade..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-zinc-700"
          />
          {busca && (
            <button aria-label="Limpar busca" onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-sm">{"\u2715"}</button>
          )}
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
                      {(ed._count?.avaliacoes ?? 0) === 0 ? <span className="text-xs text-zinc-400">Sem avaliações registradas</span> : <>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={cn("w-3.5 h-3.5", n <= Math.round(ed.avaliacao ?? 0) ? "text-yellow-400 fill-yellow-400" : "text-zinc-700")}
                        />
                      ))}
                      <span className="text-xs text-zinc-500 ml-1">{(ed.avaliacao ?? 0).toFixed(1)}</span>
                      </>}

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
            <p className="text-sm">{busca.trim() || filtro !== "todos" ? "Ajuste a busca ou os filtros para encontrar pessoas." : "Clique em Cadastrar para adicionar o primeiro."}</p>
          </div>
        )}
        </>}
      </main>

      {showForm && <EditorForm onClose={() => { setShowForm(false); mutate() }} />}
    </>
  )
}

function EditorForm({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const previous = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => { dialog?.close(); previous?.focus() }
  }, [])
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
      toast.error(mensagemDeErro(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={onClose} aria-labelledby="editor-form-title" className={styles.formPanel}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <h2 id="editor-form-title" className="font-medium text-white text-xl">Cadastrar videomaker interno</h2>
          <button aria-label="Fechar cadastro" onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="editor-nome" className="block text-xs text-zinc-400 mb-1">Nome *</label>
              <input id="editor-nome" required placeholder="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inp} />
            </div>
            <div>
              <label htmlFor="editor-telefone" className="block text-xs text-zinc-400 mb-1">Telefone</label>
              <input id="editor-telefone" placeholder="(11) 99999-9999" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={inp} />
            </div>
            <div>
              <label htmlFor="editor-whatsapp" className="block text-xs text-zinc-400 mb-1">WhatsApp</label>
              <input id="editor-whatsapp" placeholder="(11) 99999-9999" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className={inp} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="editor-email" className="block text-xs text-zinc-400 mb-1">E-mail</label>
              <input id="editor-email" type="email" placeholder="email@exemplo.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} />
            </div>
            <div>
              <label htmlFor="editor-cidade" className="block text-xs text-zinc-400 mb-1">Cidade</label>
              <input id="editor-cidade" placeholder="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className={inp} />
            </div>
            <div>
              <label htmlFor="editor-estado" className="block text-xs text-zinc-400 mb-1">UF</label>
              <input id="editor-estado" placeholder="SP" maxLength={2} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} className={inp} />
            </div>
            {isPrivileged && (
              <div>
                <label htmlFor="editor-salario" className="block text-xs text-zinc-400 mb-1">Salario (R$)</label>
                <input id="editor-salario" type="number" placeholder="0,00" value={form.salario} onChange={(e) => setForm({ ...form, salario: e.target.value })} className={inp} />
              </div>
            )}
            <div>
              <label htmlFor="editor-cargaLimite" className="block text-xs text-zinc-400 mb-1">Limite de demandas</label>
              <input id="editor-cargaLimite" type="number" placeholder="5" value={form.cargaLimite} onChange={(e) => setForm({ ...form, cargaLimite: e.target.value })} className={inp} />
            </div>
            <div>
              <label htmlFor="editor-status" className="block text-xs text-zinc-400 mb-1">Status</label>
              <select id="editor-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inp}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
            <div>
              <label htmlFor="editor-cpfCnpj" className="block text-xs text-zinc-400 mb-1">CPF/CNPJ</label>
              <input id="editor-cpfCnpj" placeholder="000.000.000-00" value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} className={inp} />
            </div>
            <div>
              <label htmlFor="editor-chavePix" className="block text-xs text-zinc-400 mb-1">Chave PIX</label>
              <input id="editor-chavePix" placeholder="CPF, e-mail, telefone ou chave" value={form.chavePix} onChange={(e) => setForm({ ...form, chavePix: e.target.value })} className={inp} />
            </div>
          </div>

          <div>
            <p className="text-xs text-zinc-400 mb-2">Areas de atuacao</p>
            <div className="flex flex-wrap gap-1.5">
              {areas.map((a) => (
                <button type="button" key={a} aria-pressed={form.areasAtuacao.includes(a)} onClick={() => toggleArea(a)}
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
                <button type="button" key={s} aria-pressed={form.especialidade.includes(s)} onClick={() => toggleSpec(s)}
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
            <label htmlFor="editor-portfolio" className="block text-xs text-zinc-400 mb-1">Portfolio (URL)</label>
            <input id="editor-portfolio" placeholder="https://..." value={form.portfolio} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} className={inp} />
          </div>

          <div>
            <label htmlFor="editor-observacoes" className="block text-xs text-zinc-400 mb-1">Observacoes</label>
            <textarea id="editor-observacoes" placeholder="Observacoes sobre o editor..." value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} className={`${inp} resize-none`} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-zinc-700 rounded-lg text-zinc-400 hover:bg-zinc-800">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60">
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
    </dialog>
  )
}

const inp = "w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500"
