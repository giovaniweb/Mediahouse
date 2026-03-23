"use client"

import { useState } from "react"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import { MapPin, Phone, Plus, Star, Trash2, AlertTriangle, Filter, Search, Video, FileText, Receipt, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { TagInput } from "@/components/ui/TagInput"
import { MoneyDisplay } from "@/components/ui/MoneyDisplay"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const statusConfig = {
  preferencial: { label: "Preferencial", class: "bg-purple-500/20 text-purple-300 border border-purple-700" },
  ativo: { label: "Ativo", class: "bg-green-500/20 text-green-300 border border-green-700" },
  inativo: { label: "Inativo", class: "bg-zinc-700/50 text-zinc-400 border border-zinc-600" },
  pendente: { label: "Pendente", class: "bg-yellow-500/20 text-yellow-300 border border-yellow-700" },
}

const HABILIDADES_SUGESTOES = [
  "Edição", "Captação com câmera", "Captação com celular", "Fotos", "3D",
  "IA Maker", "Motion Graphics", "Colorização", "Trilha Sonora", "Drone",
  "Entrevista", "Documentário", "Live/Transmissão", "Animação", "Podcast",
  "Roteiro", "Narração",
]

type FiltroStatus = "todos" | "ativo" | "preferencial" | "inativo" | "lista_negra"

interface Videomaker {
  id: string; nome: string; cidade: string; estado: string
  telefone: string; email: string; valorDiaria: number
  avaliacao: number; status: keyof typeof statusConfig
  areasAtuacao: string[]; habilidades: string[]
  emListaNegra: boolean
}

export default function VideomakersPage() {
  const [showForm, setShowForm] = useState(false)
  const [filtro, setFiltro] = useState<FiltroStatus>("todos")
  const [busca, setBusca] = useState("")
  const { data, mutate } = useSWR("/api/videomakers", fetcher)
  const videomakers: Videomaker[] = data?.videomakers ?? []

  const lista = videomakers.filter((vm) => {
    // Status filter
    if (filtro === "lista_negra" && !vm.emListaNegra) return false
    if (filtro !== "lista_negra" && vm.emListaNegra) return false
    if (filtro !== "todos" && filtro !== "lista_negra" && vm.status !== filtro) return false
    // Search filter
    if (busca.trim()) {
      const q = busca.toLowerCase()
      return (
        vm.nome?.toLowerCase().includes(q) ||
        vm.cidade?.toLowerCase().includes(q) ||
        vm.estado?.toLowerCase().includes(q) ||
        vm.email?.toLowerCase().includes(q) ||
        vm.telefone?.includes(q)
      )
    }
    return true
  })

  const negra = videomakers.filter(v => v.emListaNegra).length

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Remover "${nome}"? Esta ação é irreversível.`)) return
    const res = await fetch(`/api/videomakers/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Videomaker removido")
      mutate()
    } else {
      toast.error("Erro ao remover")
    }
  }

  return (
    <>
      <Header
        title="Videomakers Ext"
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
          {(["todos", "ativo", "preferencial", "inativo", "lista_negra"] as FiltroStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                filtro === f
                  ? f === "lista_negra"
                    ? "bg-red-600 border-red-700 text-white"
                    : "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
              )}
            >
              {f === "todos" ? "Todos" : f === "lista_negra" ? `Lista Negra (${negra})` : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Video className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-zinc-500">Total Ativos</span>
            </div>
            <p className="text-2xl font-bold text-zinc-100">{videomakers.filter(v => v.status === "ativo" && !v.emListaNegra).length}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-zinc-500">Preferenciais</span>
            </div>
            <p className="text-2xl font-bold text-zinc-100">{videomakers.filter(v => v.status === "preferencial").length}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-zinc-500">Cidades</span>
            </div>
            <p className="text-2xl font-bold text-zinc-100">{new Set(videomakers.filter(v => v.cidade).map(v => v.cidade)).size}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-zinc-500">Lista Negra</span>
            </div>
            <p className="text-2xl font-bold text-zinc-100">{negra}</p>
          </div>
        </div>

        {/* Busca */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, cidade, estado..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-zinc-700"
          />
          {busca && (
            <button onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-sm">&#x2715;</button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((vm) => {
            const cfg = statusConfig[vm.status] ?? statusConfig.ativo
            return (
              <div key={vm.id} className="relative group">
                {vm.emListaNegra && (
                  <div className="absolute inset-0 bg-red-900/10 border border-red-800 rounded-xl pointer-events-none z-10" />
                )}
                <Link href={`/videomakers/${vm.id}`}>
                  <div className={cn(
                    "bg-zinc-900 rounded-xl border shadow-sm p-4 hover:border-zinc-600 transition-all cursor-pointer",
                    vm.emListaNegra ? "border-red-900" : "border-zinc-800"
                  )}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-zinc-100 truncate">{vm.nome}</h3>
                          {vm.emListaNegra && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                          )}
                        </div>
                        {(vm.cidade || vm.estado) && (
                          <div className="flex items-center gap-1 mt-0.5 text-xs text-zinc-500">
                            <MapPin className="w-3 h-3" />
                            <span>{[vm.cidade, vm.estado].filter(Boolean).join(", ")}</span>
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
                          className={cn("w-3.5 h-3.5", n <= Math.round(vm.avaliacao ?? 0) ? "text-yellow-400 fill-yellow-400" : "text-zinc-700")}
                        />
                      ))}
                      <span className="text-xs text-zinc-500 ml-1">{(vm.avaliacao ?? 0).toFixed(1)}</span>
                    </div>

                    {/* Habilidades */}
                    {vm.habilidades?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {vm.habilidades.slice(0, 4).map((h) => (
                          <span key={h} className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">
                            {h}
                          </span>
                        ))}
                        {vm.habilidades.length > 4 && (
                          <span className="text-[10px] text-zinc-600">+{vm.habilidades.length - 4}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1 text-zinc-500 text-xs">
                        <Phone className="w-3 h-3" />
                        <span>{vm.telefone || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MoneyDisplay value={vm.valorDiaria} suffix="/dia" className="font-semibold text-zinc-300 text-xs" />
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(vm.id, vm.nome) }}
                          className="p-1 text-zinc-600 hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>

        {lista.length === 0 && (
          <div className="text-center py-16 text-zinc-500">
            <p className="text-lg font-medium mb-1">Nenhum videomaker encontrado</p>
            <p className="text-sm">
              {filtro === "lista_negra" ? "Nenhum na lista negra" : "Clique em \"Cadastrar\" para adicionar o primeiro."}
            </p>
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
    valorDiaria: "", status: "ativo", cpfCnpj: "", chavePix: "",
    areasAtuacao: [] as string[], habilidades: [] as string[],
  })

  const areas = ["eventos", "institucional", "ads", "social_media", "reels", "aftermovie", "corporativo"]

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
    try {
      const res = await fetch("/api/videomakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        ...form,
        email: form.email.trim() || undefined,   // não enviar string vazia
        valorDiaria: form.valorDiaria ? Number(form.valorDiaria) : undefined,
      }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Videomaker cadastrado!")
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
          <h2 className="font-semibold text-white">Cadastrar Videomaker</h2>
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
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Valor/dia (R$)</label>
              <input type="number" placeholder="0,00" value={form.valorDiaria} onChange={(e) => setForm({ ...form, valorDiaria: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inp}>
                <option value="ativo">Ativo</option>
                <option value="preferencial">Preferencial</option>
                <option value="inativo">Inativo</option>
                <option value="pendente">Pendente</option>
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
            <p className="text-xs text-zinc-400 mb-2">Áreas de atuação</p>
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
            <p className="text-xs text-zinc-400 mb-2">Habilidades</p>
            <TagInput
              value={form.habilidades}
              onChange={(tags) => setForm({ ...form, habilidades: tags })}
              suggestions={HABILIDADES_SUGESTOES}
              placeholder="Selecione ou adicione habilidades..."
            />
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
