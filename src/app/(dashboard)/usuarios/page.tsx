"use client"

import { useState } from "react"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import { Users, Camera, Film, Shield, UserCheck, User, Search, CheckCircle2, XCircle, Plus, Pencil, X, Save, GitMerge, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import Link from "next/link"
import { PermissoesModal } from "@/components/PermissoesModal"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const TIPO_LABEL: Record<string, string> = {
  admin: "Admin", gestor: "Gestor", operacao: "Operação",
  solicitante: "Solicitante", editor: "Videomaker Int", videomaker: "Videomaker", social: "Social Media",
}

const TIPO_COLOR: Record<string, string> = {
  admin: "bg-red-500/10 text-red-400 border-red-800",
  gestor: "bg-purple-500/10 text-purple-400 border-purple-800",
  operacao: "bg-blue-500/10 text-blue-400 border-blue-800",
  solicitante: "bg-zinc-500/10 text-zinc-400 border-zinc-700",
  editor: "bg-indigo-500/10 text-indigo-400 border-indigo-800",
  videomaker: "bg-amber-500/10 text-amber-400 border-amber-800",
  social: "bg-pink-500/10 text-pink-400 border-pink-800",
}

type Tab = "sistema" | "videomakers_ext" | "videomakers_int"

interface Usuario {
  id: string
  nome: string
  email: string
  telefone?: string
  tipo: string
  status: string
  createdAt: string
}

interface Videomaker {
  id: string
  nome: string
  email?: string
  telefone?: string
  status: string
  createdAt: string
}

interface Editor {
  id: string
  nome: string
  email?: string
  telefone?: string
  status: string
  createdAt: string
}

const TIPOS_OPTS = ["admin", "gestor", "operacao", "solicitante", "social"]

interface EditForm {
  nome: string
  email: string
  telefone: string
  tipo: string
}

interface MesclarModal {
  principal: Usuario
  secundarioBusca: string
  secundario: Usuario | null
  buscando: boolean
  mesclando: boolean
  qtdDemandas: number | null
}

export default function UsuariosPage() {
  const [tab, setTab] = useState<Tab>("sistema")
  const [search, setSearch] = useState("")
  const [editando, setEditando] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ nome: "", email: "", telefone: "", tipo: "" })
  const [salvando, setSalvando] = useState(false)
  const [permUser, setPermUser] = useState<{ id: string; nome: string; tipo: string } | null>(null)
  const [mesclarModal, setMesclarModal] = useState<MesclarModal | null>(null)
  const { data, mutate } = useSWR<{ usuarios: Usuario[]; videomakers: Videomaker[]; editores: Editor[] }>("/api/usuarios", fetcher)

  const usuarios = data?.usuarios ?? []
  const videomakers = data?.videomakers ?? []
  const editores = data?.editores ?? []

  const filtrar = <T extends { nome: string }>(arr: T[]) =>
    search ? arr.filter((u) => u.nome.toLowerCase().includes(search.toLowerCase())) : arr

  function abrirEdicao(u: Usuario) {
    setEditando(u.id)
    setEditForm({ nome: u.nome, email: u.email, telefone: u.telefone ?? "", tipo: u.tipo })
  }

  async function salvarEdicao(id: string) {
    setSalvando(true)
    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Usuário atualizado!")
      setEditando(null)
      mutate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setSalvando(false)
    }
  }

  async function toggleStatusUsuario(id: string, status: string) {
    const novoStatus = status === "ativo" ? "inativo" : "ativo"
    try {
      await fetch(`/api/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      })
      toast.success("Status atualizado")
      mutate()
    } catch {
      toast.error("Erro ao atualizar status")
    }
  }

  function abrirMesclar(u: Usuario) {
    setMesclarModal({ principal: u, secundarioBusca: "", secundario: null, buscando: false, mesclando: false, qtdDemandas: null })
  }

  async function buscarSecundario() {
    if (!mesclarModal || !mesclarModal.secundarioBusca.trim()) return
    setMesclarModal(m => m ? { ...m, buscando: true, secundario: null, qtdDemandas: null } : null)
    try {
      const q = encodeURIComponent(mesclarModal.secundarioBusca.trim())
      const res = await fetch(`/api/usuarios?busca=${q}`)
      const json = await res.json()
      const lista: Usuario[] = json.usuarios ?? []
      const encontrado = lista.find(u => u.id !== mesclarModal.principal.id) ?? null
      const qtd = encontrado
        ? await fetch(`/api/demandas?solicitanteId=${encontrado.id}&limit=0`).then(r => r.json()).then(j => j.total ?? 0).catch(() => 0)
        : null
      setMesclarModal(m => m ? { ...m, buscando: false, secundario: encontrado, qtdDemandas: qtd } : null)
    } catch {
      setMesclarModal(m => m ? { ...m, buscando: false } : null)
      toast.error("Erro ao buscar usuário")
    }
  }

  async function confirmarMesclar() {
    if (!mesclarModal?.secundario) return
    setMesclarModal(m => m ? { ...m, mesclando: true } : null)
    try {
      const res = await fetch(`/api/usuarios/${mesclarModal.principal.id}/mesclar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secundarioId: mesclarModal.secundario.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(json.mensagem || "Cadastros mesclados!")
      setMesclarModal(null)
      mutate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao mesclar")
      setMesclarModal(m => m ? { ...m, mesclando: false } : null)
    }
  }

  const tabs = [
    { id: "sistema" as Tab, label: "Usuários do Sistema", icon: Shield, count: usuarios.length },
    { id: "videomakers_ext" as Tab, label: "Videomakers Ext", icon: Camera, count: videomakers.length },
    { id: "videomakers_int" as Tab, label: "Videomakers Int", icon: Film, count: editores.length },
  ]

  return (
    <>
      <Header
        title="Usuários"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500 w-40"
              />
            </div>
          </div>
        }
      />
      <main className="flex-1 p-6">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-zinc-800 pb-0">
          {tabs.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                  tab === t.id
                    ? "border-purple-500 text-purple-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                <span className={cn(
                  "ml-1 text-xs px-1.5 py-0.5 rounded-full",
                  tab === t.id ? "bg-purple-500/20 text-purple-400" : "bg-zinc-800 text-zinc-500"
                )}>
                  {t.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Sistema */}
        {tab === "sistema" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-500">{filtrar(usuarios).length} usuário(s) do sistema</p>
              <Link href="/configuracoes">
                <button className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Novo Usuário
                </button>
              </Link>
            </div>
            <div className="grid gap-3">
              {filtrar(usuarios).map((u) => (
                <div key={u.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors">
                  {editando === u.id ? (
                    /* ── Formulário de edição inline ── */
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-zinc-200">Editando {u.nome}</p>
                        <button onClick={() => setEditando(null)} className="text-zinc-500 hover:text-zinc-300">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-zinc-400 block mb-0.5">Nome</label>
                          <input className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                            value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400 block mb-0.5">Tipo</label>
                          <select className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                            value={editForm.tipo} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}>
                            {TIPOS_OPTS.map(t => <option key={t} value={t}>{TIPO_LABEL[t] ?? t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400 block mb-0.5">E-mail</label>
                          <input className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                            value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400 block mb-0.5">WhatsApp</label>
                          <input className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                            placeholder="+55 11 99999-9999"
                            value={editForm.telefone} onChange={e => setEditForm(f => ({ ...f, telefone: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => salvarEdicao(u.id)} disabled={salvando}
                          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
                          <Save className="w-3.5 h-3.5" /> {salvando ? "Salvando..." : "Salvar"}
                        </button>
                        <button onClick={() => setEditando(null)}
                          className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-xs px-3 py-1.5 rounded-lg hover:bg-zinc-800">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Card normal ── */
                    <div className="group p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-zinc-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-zinc-100 text-sm">{u.nome}</p>
                          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full border", TIPO_COLOR[u.tipo] ?? "bg-zinc-800 text-zinc-400 border-zinc-700")}>
                            {TIPO_LABEL[u.tipo] ?? u.tipo}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 truncate mt-0.5">{u.email}</p>
                        {u.telefone && <p className="text-xs text-zinc-600">{u.telefone}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setPermUser({ id: u.id, nome: u.nome, tipo: u.tipo })}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-purple-800 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
                          title="Gerenciar permissoes"
                        >
                          <Shield className="w-3 h-3" /> Permissoes
                        </button>
                        <button
                          onClick={() => abrirEdicao(u)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                          title="Editar usuário"
                        >
                          <Pencil className="w-3 h-3" /> Editar
                        </button>
                        <button
                          onClick={() => abrirMesclar(u)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"
                          title="Mesclar com cadastro duplicado"
                        >
                          <GitMerge className="w-3 h-3" /> Mesclar
                        </button>
                        <button
                          onClick={() => toggleStatusUsuario(u.id, u.status)}
                          className={cn(
                            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors",
                            u.status === "ativo"
                              ? "bg-green-500/10 border-green-800 text-green-400 hover:bg-green-500/20"
                              : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700"
                          )}
                        >
                          {u.status === "ativo" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {u.status === "ativo" ? "Ativo" : "Inativo"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {filtrar(usuarios).length === 0 && (
                <div className="text-center py-12 text-zinc-600">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>Nenhum usuário encontrado</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Videomakers Ext */}
        {tab === "videomakers_ext" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-500">{filtrar(videomakers).length} videomaker(s) ext cadastrado(s)</p>
              <Link href="/videomakers">
                <button className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Gerenciar Videomakers
                </button>
              </Link>
            </div>
            <div className="grid gap-3">
              {filtrar(videomakers).map((v) => (
                <Link key={v.id} href={`/videomakers/${v.id}`}>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4 hover:border-zinc-700 transition-colors cursor-pointer">
                    <div className="w-10 h-10 rounded-full bg-amber-900/30 border border-amber-800 flex items-center justify-center shrink-0">
                      <Camera className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-zinc-100 text-sm">{v.nome}</p>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-800">
                          Videomaker Ext
                        </span>
                      </div>
                      {v.email && <p className="text-xs text-zinc-500 truncate mt-0.5">{v.email}</p>}
                      {v.telefone && <p className="text-xs text-zinc-600">{v.telefone}</p>}
                    </div>
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full border shrink-0",
                      v.status === "ativo" || v.status === "preferencial"
                        ? "bg-green-500/10 text-green-400 border-green-800"
                        : "bg-zinc-800 text-zinc-500 border-zinc-700"
                    )}>
                      {v.status}
                    </span>
                  </div>
                </Link>
              ))}
              {filtrar(videomakers).length === 0 && (
                <div className="text-center py-12 text-zinc-600">
                  <Camera className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>Nenhum videomaker cadastrado</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Videomakers Int (Editores) */}
        {tab === "videomakers_int" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-500">{filtrar(editores).length} videomaker(s) int cadastrado(s)</p>
              <Link href="/equipe">
                <button className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Gerenciar Videomakers Int
                </button>
              </Link>
            </div>
            <div className="grid gap-3">
              {filtrar(editores).map((e) => (
                <Link key={e.id} href={`/equipe/${e.id}`}>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4 hover:border-zinc-700 transition-colors cursor-pointer">
                    <div className="w-10 h-10 rounded-full bg-indigo-900/30 border border-indigo-800 flex items-center justify-center shrink-0">
                      <Film className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-zinc-100 text-sm">{e.nome}</p>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-400 border-indigo-800">
                          Videomaker Int
                        </span>
                      </div>
                      {e.email && <p className="text-xs text-zinc-500 truncate mt-0.5">{e.email}</p>}
                      {e.telefone && <p className="text-xs text-zinc-600">{e.telefone}</p>}
                    </div>
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full border shrink-0",
                      e.status === "ativo"
                        ? "bg-green-500/10 text-green-400 border-green-800"
                        : "bg-zinc-800 text-zinc-500 border-zinc-700"
                    )}>
                      {e.status}
                    </span>
                  </div>
                </Link>
              ))}
              {filtrar(editores).length === 0 && (
                <div className="text-center py-12 text-zinc-600">
                  <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>Nenhum editor cadastrado</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modal de Permissoes */}
      {permUser && (
        <PermissoesModal
          usuarioId={permUser.id}
          usuarioNome={permUser.nome}
          usuarioTipo={permUser.tipo}
          open={!!permUser}
          onClose={() => setPermUser(null)}
        />
      )}

      {/* Modal de Mesclagem */}
      {mesclarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !mesclarModal.mesclando && setMesclarModal(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-blue-400" />
                <h2 className="font-semibold text-zinc-100 text-sm">Mesclar Cadastros Duplicados</h2>
              </div>
              <button onClick={() => setMesclarModal(null)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4">
              {/* Principal */}
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-1">✅ Manter (principal)</p>
                <p className="font-semibold text-zinc-100 text-sm">{mesclarModal.principal.nome}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {mesclarModal.principal.email || <span className="text-zinc-600 italic">sem e-mail</span>}
                  {mesclarModal.principal.telefone && <span className="ml-2 text-zinc-500">{mesclarModal.principal.telefone}</span>}
                </p>
              </div>

              {/* Busca do secundário */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">🔍 Buscar cadastro duplicado para remover:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nome ou e-mail do duplicado..."
                    value={mesclarModal.secundarioBusca}
                    onChange={e => setMesclarModal(m => m ? { ...m, secundarioBusca: e.target.value, secundario: null } : null)}
                    onKeyDown={e => e.key === "Enter" && buscarSecundario()}
                    className="flex-1 border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={buscarSecundario}
                    disabled={mesclarModal.buscando || !mesclarModal.secundarioBusca.trim()}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-semibold disabled:opacity-50"
                  >
                    {mesclarModal.buscando ? "..." : "Buscar"}
                  </button>
                </div>
              </div>

              {/* Resultado da busca */}
              {mesclarModal.secundario && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-1">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">⚠️ Remover (duplicado)</p>
                  <p className="font-semibold text-zinc-100 text-sm">{mesclarModal.secundario.nome}</p>
                  <p className="text-xs text-zinc-400">
                    {mesclarModal.secundario.email || <span className="text-zinc-600 italic">sem e-mail</span>}
                    {mesclarModal.secundario.telefone && <span className="ml-2 text-zinc-500">{mesclarModal.secundario.telefone}</span>}
                  </p>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border inline-block mt-1", TIPO_COLOR[mesclarModal.secundario.tipo] ?? "bg-zinc-800 text-zinc-400 border-zinc-700")}>
                    {TIPO_LABEL[mesclarModal.secundario.tipo] ?? mesclarModal.secundario.tipo}
                  </span>
                </div>
              )}

              {mesclarModal.buscando === false && mesclarModal.secundarioBusca && mesclarModal.secundario === null && (
                <p className="text-xs text-zinc-500 italic">Nenhum usuário encontrado com esse termo.</p>
              )}

              {/* O que será feito */}
              {mesclarModal.secundario && (
                <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-zinc-300 mb-2">O que será feito:</p>
                  {!mesclarModal.principal.email && mesclarModal.secundario.email && (
                    <p className="text-xs text-zinc-400 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-400" /> E-mail <strong className="text-zinc-200">{mesclarModal.secundario.email}</strong> copiado para o principal</p>
                  )}
                  {!mesclarModal.principal.telefone && mesclarModal.secundario.telefone && (
                    <p className="text-xs text-zinc-400 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-400" /> Telefone copiado para o principal</p>
                  )}
                  {(mesclarModal.qtdDemandas ?? 0) > 0 && (
                    <p className="text-xs text-zinc-400 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-400" /> <strong className="text-zinc-200">{mesclarModal.qtdDemandas}</strong> demanda(s) migrada(s) para o principal</p>
                  )}
                  <p className="text-xs text-amber-400 flex items-center gap-1.5 mt-1"><AlertTriangle className="w-3 h-3" /> Cadastro duplicado marcado como <strong>inativo</strong></p>
                </div>
              )}

              {/* Ações */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={confirmarMesclar}
                  disabled={!mesclarModal.secundario || mesclarModal.mesclando}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-40 transition-colors"
                >
                  <GitMerge className="w-4 h-4" /> {mesclarModal.mesclando ? "Mesclando..." : "Confirmar Mesclagem"}
                </button>
                <button
                  onClick={() => setMesclarModal(null)}
                  className="px-4 py-2 border border-zinc-700 text-zinc-400 text-sm rounded-lg hover:bg-zinc-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
