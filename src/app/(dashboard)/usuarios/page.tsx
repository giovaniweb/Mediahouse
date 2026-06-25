"use client"

import { useState } from "react"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import {
  Users, Camera, Film, Shield, Search, CheckCircle2, XCircle,
  Plus, Pencil, X, GitMerge, AlertTriangle, KeyRound, Eye, EyeOff,
  AlertCircle, UserCog, Trash2, ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import Link from "next/link"
import { PermissoesModal } from "@/components/PermissoesModal"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const TIPO_LABEL: Record<string, string> = {
  admin: "Admin", gestor: "Gestor", operacao: "Operação",
  solicitante: "Solicitante", editor: "Videomaker Int", videomaker: "Videomaker", social: "Social Media",
  designer: "Designer", gestor_eventos: "Gestor de Eventos",
  analista_crm: "Analista CRM", gestor_trafego: "Gestor de Tráfego", auxiliar_admin: "Auxiliar Admin",
}
const CATEGORIA_LABEL: Record<string, string> = {
  interna: "Equipe interna", solicitante: "Solicitante", externo: "Profissional externo", sistema: "Sistema / Teste",
}
const AREA_LABEL: Record<string, string> = {
  audiovisual: "Audiovisual", growth: "Growth", eventos: "Eventos",
}

const TIPO_COLOR: Record<string, string> = {
  admin: "bg-purple-500/10 text-purple-400 border-purple-800",
  gestor: "bg-blue-500/10 text-blue-400 border-blue-800",
  operacao: "bg-zinc-500/10 text-zinc-300 border-zinc-700",
  solicitante: "bg-zinc-500/10 text-zinc-400 border-zinc-700",
  editor: "bg-amber-500/10 text-amber-400 border-amber-800",
  videomaker: "bg-emerald-500/10 text-emerald-400 border-emerald-800",
  social: "bg-pink-500/10 text-pink-400 border-pink-800",
  designer: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-800",
  gestor_eventos: "bg-indigo-500/10 text-indigo-400 border-indigo-800",
  analista_crm: "bg-cyan-500/10 text-cyan-400 border-cyan-800",
  gestor_trafego: "bg-orange-500/10 text-orange-400 border-orange-800",
  auxiliar_admin: "bg-teal-500/10 text-teal-400 border-teal-800",
}

const TIPO_OPTS = ["admin", "gestor", "operacao", "social", "designer", "analista_crm", "gestor_trafego", "auxiliar_admin", "gestor_eventos", "solicitante", "editor", "videomaker"]

type SubTab = "sistema" | "vm_ext" | "vm_int"

interface Usuario {
  id: string
  nome: string
  email: string
  telefone?: string
  tipo: string
  status: string
  createdAt: string
  categoria?: string
  funcaoProfissional?: string | null
  areas?: string[]
}

interface Videomaker {
  id: string
  nome: string
  email?: string
  telefone?: string
  status: string
  usuarioId?: string | null
}

interface Editor {
  id: string
  nome: string
  email?: string
  telefone?: string
  status: string
  usuarioId?: string | null
}

interface MesclarModal {
  principal: Usuario
  secundarioBusca: string
  secundario: Usuario | null
  buscando: boolean
  mesclando: boolean
  qtdDemandas: number | null
}

// ─── Modal Perfil Profissional (vm_ext / vm_int) ─────────────────────────────
function ModalPerfilProfissional({
  tipo,
  usuarioId,
  professionalId,
  nome,
  email,
  telefone,
  status,
  onClose,
  onDeleted,
}: {
  tipo: "vm_ext" | "vm_int"
  usuarioId: string
  professionalId: string | null
  nome: string
  email?: string
  telefone?: string
  status: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const tipoLabel = tipo === "vm_ext" ? "Videomaker Externo" : "Videomaker Interno"
  const perfilHref = tipo === "vm_ext"
    ? (professionalId ? `/videomakers/${professionalId}` : null)
    : (professionalId ? `/equipe/${professionalId}` : null)

  async function excluir() {
    setDeleting(true)
    try {
      // 1. Deleta o registro profissional (Videomaker ou Editor) se existir
      if (professionalId) {
        const endpoint = tipo === "vm_ext" ? `/api/videomakers/${professionalId}` : `/api/editores/${professionalId}`
        await fetch(endpoint, { method: "DELETE" }).catch(() => null)
      }
      // 2. Soft-delete do usuário (desativa a conta)
      const res = await fetch(`/api/usuarios/${usuarioId}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(err.error ?? "Erro ao excluir")
      }
      toast.success(`${nome} foi removido do sistema!`)
      onDeleted()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center",
              tipo === "vm_ext" ? "bg-amber-500/10" : "bg-indigo-500/10"
            )}>
              {tipo === "vm_ext"
                ? <Camera className="w-4 h-4 text-amber-400" />
                : <Film className="w-4 h-4 text-indigo-400" />
              }
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{nome}</p>
              <p className="text-xs text-zinc-400">{tipoLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dados */}
        <div className="space-y-2 border border-zinc-800 rounded-xl p-3 bg-zinc-800/30">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-500">E-mail</span>
            <span className="text-xs text-zinc-200">{email || <span className="text-zinc-600 italic">sem e-mail</span>}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-500">WhatsApp</span>
            <span className="text-xs text-zinc-200">{telefone || <span className="text-zinc-600 italic">sem telefone</span>}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-500">Status conta</span>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium",
              status === "ativo" ? "bg-green-500/10 text-green-400" : "bg-zinc-700 text-zinc-500"
            )}>{status === "ativo" ? "Ativo" : "Inativo"}</span>
          </div>
        </div>

        {/* Link perfil completo */}
        {perfilHref && (
          <a
            href={perfilHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ver perfil completo
          </a>
        )}

        {/* Botão excluir / confirmação */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full flex items-center justify-center gap-2 border border-red-700/60 text-red-400 hover:bg-red-900/20 text-sm py-2 rounded-lg transition-colors font-medium"
          >
            <Trash2 className="w-4 h-4" />
            Excluir do sistema
          </button>
        ) : (
          <div className="border border-red-700/60 bg-red-900/10 rounded-xl p-3 space-y-2">
            <p className="text-xs text-red-300 font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Confirmar exclusão de {nome}?
            </p>
            <p className="text-xs text-zinc-400">Esta ação desativa a conta e remove o registro profissional. Não pode ser desfeita.</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={excluir}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? "Excluindo..." : "Sim, excluir"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-zinc-700 text-zinc-300 text-xs py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal Redefinir Senha ────────────────────────────────────────────────────
function ModalResetSenha({
  usuario, onClose, onSave,
}: {
  usuario: { id: string; nome: string; email: string }
  onClose: () => void
  onSave: () => void
}) {
  const [novaSenha, setNovaSenha] = useState("")
  const [confirmar, setConfirmar] = useState("")
  const [mostrar, setMostrar] = useState(false)
  const [loading, setLoading] = useState(false)

  async function salvar() {
    if (novaSenha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return }
    if (novaSenha !== confirmar) { toast.error("As senhas não coincidem"); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novaSenha }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`Senha de ${usuario.nome} redefinida!`)
      onSave()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao redefinir senha")
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">Redefinir Senha</p>
            <p className="text-xs text-zinc-400">{usuario.nome} · {usuario.email}</p>
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Nova senha *</label>
          <div className="relative">
            <input
              type={mostrar ? "text" : "password"}
              value={novaSenha}
              onChange={e => setNovaSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 pr-9 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
            <button type="button" onClick={() => setMostrar(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Confirmar senha *</label>
          <input
            type={mostrar ? "text" : "password"}
            value={confirmar}
            onChange={e => setConfirmar(e.target.value)}
            placeholder="Repita a senha"
            className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {confirmar && novaSenha !== confirmar && (
            <p className="text-xs text-red-400 mt-1">Senhas não coincidem</p>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={salvar}
            disabled={loading || novaSenha.length < 6 || novaSenha !== confirmar}
            className="flex-1 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-40"
          >
            {loading ? "Salvando..." : "Redefinir Senha"}
          </button>
          <button onClick={onClose} className="flex-1 border border-zinc-700 text-zinc-300 text-sm py-2 rounded-lg hover:bg-zinc-800 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Editar Usuário ─────────────────────────────────────────────────────
const CATEGORIAS = [
  { value: "interna", label: "Equipe interna" },
  { value: "solicitante", label: "Solicitante" },
  { value: "externo", label: "Profissional externo" },
  { value: "sistema", label: "Sistema / Teste" },
]
const FUNCOES = [
  "social", "designer", "analista_crm", "gestor_trafego", "videomaker", "editor",
  "fotografo", "atendimento", "copywriter", "produtor", "coordenador", "gestor", "admin", "operacao", "outro",
]
const FUNCAO_LABEL: Record<string, string> = {
  social: "Social Media", designer: "Designer", analista_crm: "Analista CRM", gestor_trafego: "Gestor de Tráfego",
  videomaker: "Videomaker", editor: "Editor", fotografo: "Fotógrafo", atendimento: "Atendimento",
  copywriter: "Copywriter", produtor: "Produtor", coordenador: "Coordenador", gestor: "Gestor", admin: "Admin",
  operacao: "Operação", outro: "Outro",
}
const AREAS = [
  { value: "audiovisual", label: "Audiovisual" },
  { value: "growth", label: "Growth / Conteúdos" },
  { value: "eventos", label: "Coberturas de Eventos" },
]

function ModalEditarUsuario({
  usuario, onClose, onSave,
}: {
  usuario: { id: string; nome: string; email: string; telefone?: string; tipo: string; categoria?: string; funcaoProfissional?: string | null; areas?: string[] }
  onClose: () => void
  onSave: () => void
}) {
  const [nome, setNome] = useState(usuario.nome)
  const [email, setEmail] = useState(usuario.email ?? "")
  const [telefone, setTelefone] = useState(usuario.telefone ?? "")
  const [tipo, setTipo] = useState(usuario.tipo)
  const [categoria, setCategoria] = useState(usuario.categoria ?? "interna")
  const [funcao, setFuncao] = useState(usuario.funcaoProfissional ?? "")
  const [areas, setAreas] = useState<string[]>(usuario.areas ?? [])
  const [novaSenha, setNovaSenha] = useState("")
  const [confirmar, setConfirmar] = useState("")
  const [mostrar, setMostrar] = useState(false)
  const [loading, setLoading] = useState(false)
  const toggleArea = (a: string) => setAreas((cur) => cur.includes(a) ? cur.filter(x => x !== a) : [...cur, a])

  const TIPOS = [
    { value: "admin", label: "Admin" },
    { value: "gestor", label: "Gestor" },
    { value: "operacao", label: "Operação" },
    { value: "solicitante", label: "Solicitante" },
    { value: "social", label: "Social Media" },
    { value: "designer", label: "Designer" },
    { value: "analista_crm", label: "Analista CRM" },
    { value: "gestor_trafego", label: "Gestor de Tráfego" },
    { value: "auxiliar_admin", label: "Auxiliar Admin" },
    { value: "gestor_eventos", label: "Gestor de Eventos" },
    { value: "videomaker", label: "Videomaker Ext" },
    { value: "editor", label: "Videomaker Int" },
  ]

  const inp = "w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"

  async function salvar() {
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return }
    if (novaSenha && novaSenha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return }
    if (novaSenha && novaSenha !== confirmar) { toast.error("Senhas não coincidem"); return }
    setLoading(true)
    try {
      const body: Record<string, unknown> = { nome, email, telefone, tipo, categoria, funcaoProfissional: funcao || null, areas }
      if (novaSenha) body.novaSenha = novaSenha
      const res = await fetch(`/api/usuarios/${usuario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Usuário atualizado!")
      onSave()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar")
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-white text-sm">Editar Usuário</p>
            <p className="text-xs text-zinc-400">{usuario.nome}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Nome *</label>
            <input className={inp} value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">E-mail</label>
            <input className={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">WhatsApp</label>
            <input className={inp} type="tel" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="+55 11 99999-9999" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Papel no sistema (acesso)</label>
            <select className={inp} value={tipo} onChange={e => setTipo(e.target.value)}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="border-t border-zinc-800 pt-3 space-y-3">
            <p className="text-xs text-zinc-500">👤 Pessoas &amp; Acessos (nesta organização)</p>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Categoria</label>
              <select className={inp} value={categoria} onChange={e => setCategoria(e.target.value)}>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Função profissional</label>
              <select className={inp} value={funcao} onChange={e => setFuncao(e.target.value)}>
                <option value="">— Não definida —</option>
                {FUNCOES.map(f => <option key={f} value={f}>{FUNCAO_LABEL[f] ?? f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Áreas de atuação</label>
              <div className="flex flex-wrap gap-2">
                {AREAS.map(a => (
                  <button key={a.value} type="button" onClick={() => toggleArea(a.value)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${areas.includes(a.value) ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-zinc-800 pt-3">
            <p className="text-xs text-zinc-500 mb-3">🔑 Nova senha — deixe em branco para não alterar</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Nova senha</label>
                <div className="relative">
                  <input
                    type={mostrar ? "text" : "password"}
                    value={novaSenha}
                    onChange={e => setNovaSenha(e.target.value)}
                    placeholder="Deixe em branco para manter"
                    className={`${inp} pr-9`}
                  />
                  <button type="button" onClick={() => setMostrar(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {novaSenha && (
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Confirmar senha</label>
                  <input
                    type={mostrar ? "text" : "password"}
                    value={confirmar}
                    onChange={e => setConfirmar(e.target.value)}
                    placeholder="Repita a nova senha"
                    className={inp}
                  />
                  {confirmar && novaSenha !== confirmar && (
                    <p className="text-xs text-red-400 mt-1">Senhas não coincidem</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={salvar}
            disabled={loading || (!!novaSenha && (novaSenha.length < 6 || novaSenha !== confirmar))}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-40"
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
          <button onClick={onClose} className="flex-1 border border-zinc-700 text-zinc-300 text-sm py-2 rounded-lg hover:bg-zinc-800 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function UsuariosPage() {
  const [subTab, setSubTab] = useState<SubTab>("sistema")
  const [search, setSearch] = useState("")
  const [catFiltro, setCatFiltro] = useState("todos")  // Pessoas & Acessos: filtro por categoria

  // Modals
  const [editTarget, setEditTarget] = useState<{ id: string; nome: string; email: string; telefone?: string; tipo: string; categoria?: string; funcaoProfissional?: string | null; areas?: string[] } | null>(null)
  const [resetTarget, setResetTarget] = useState<{ id: string; nome: string; email: string } | null>(null)
  const [promoverTarget, setPromoverTarget] = useState<{ id: string; nome: string } | null>(null)
  const [profModal, setProfModal] = useState<{
    tipo: "vm_ext" | "vm_int"
    usuarioId: string
    professionalId: string | null
    nome: string
    email?: string
    telefone?: string
    status: string
  } | null>(null)
  const [deleteSistemaTarget, setDeleteSistemaTarget] = useState<{ id: string; nome: string } | null>(null)
  const [deletingSistema, setDeletingSistema] = useState(false)
  const [promoverTipo, setPromoverTipo] = useState("operacao")
  const [loadingPromover, setLoadingPromover] = useState(false)
  const [permUser, setPermUser] = useState<{ id: string; nome: string; tipo: string } | null>(null)
  const [mesclarModal, setMesclarModal] = useState<MesclarModal | null>(null)

  // Nova Pessoa form (categoria/função/áreas além do básico)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: "", email: "", senha: "", tipo: "operacao", telefone: "", categoria: "interna", funcaoProfissional: "", areas: [] as string[] })
  const toggleFormArea = (a: string) => setForm(f => ({ ...f, areas: f.areas.includes(a) ? f.areas.filter(x => x !== a) : [...f.areas, a] }))
  const [loading, setLoading] = useState(false)
  const [conflito, setConflito] = useState<{ id: string; nome: string; email: string | null; telefone: string | null } | null>(null)
  const [adicionandoEmail, setAdicionandoEmail] = useState(false)

  const { data, mutate } = useSWR<{ usuarios: Usuario[]; videomakers: Videomaker[]; editores: Editor[] }>("/api/usuarios", fetcher)

  const allUsuarios = data?.usuarios ?? []
  const videomakers = data?.videomakers ?? []
  const editores = data?.editores ?? []

  const sistemaBase = allUsuarios.filter(u => ["admin", "gestor", "operacao", "solicitante", "social", "designer", "analista_crm", "gestor_trafego", "auxiliar_admin", "gestor_eventos"].includes(u.tipo))
  const sistema = catFiltro === "todos" ? sistemaBase
    : catFiltro === "inativos" ? sistemaBase.filter(u => u.status === "inativo")
    : sistemaBase.filter(u => (u.categoria ?? "interna") === catFiltro)
  const vmExt = allUsuarios.filter(u => u.tipo === "videomaker")
  const vmInt = allUsuarios.filter(u => u.tipo === "editor")

  const filtrar = <T extends { nome: string }>(arr: T[]) =>
    search ? arr.filter(u => u.nome.toLowerCase().includes(search.toLowerCase())) : arr

  const currentList = subTab === "sistema" ? filtrar(sistema) : subTab === "vm_ext" ? filtrar(vmExt) : filtrar(vmInt)

  const subTabs = [
    { id: "sistema" as SubTab, label: "Sistema", icon: Shield, count: sistema.length },
    { id: "vm_ext" as SubTab, label: "Videomakers Ext", icon: Camera, count: vmExt.length },
    { id: "vm_int" as SubTab, label: "Videomakers Int", icon: Film, count: vmInt.length },
  ]

  // ── Actions ──────────────────────────────────────────────────────────────

  async function criarUsuario() {
    setLoading(true)
    setConflito(null)
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (res.status === 409 && json.usuario) {
        setConflito(json.usuario)
        return
      }
      if (!res.ok) throw new Error(json.error)
      toast.success("Pessoa criada!")
      setShowForm(false)
      setConflito(null)
      setForm({ nome: "", email: "", senha: "", tipo: "operacao", telefone: "", categoria: "interna", funcaoProfissional: "", areas: [] })
      mutate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar usuário")
    } finally { setLoading(false) }
  }

  async function adicionarEmailAoCadastroExistente() {
    if (!conflito || !form.email) return
    setAdicionandoEmail(true)
    try {
      const res = await fetch(`/api/usuarios/${conflito.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("E-mail adicionado ao cadastro existente!")
      setShowForm(false)
      setConflito(null)
      setForm({ nome: "", email: "", senha: "", tipo: "operacao", telefone: "", categoria: "interna", funcaoProfissional: "", areas: [] })
      mutate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar e-mail")
    } finally { setAdicionandoEmail(false) }
  }

  async function promoverUsuario() {
    if (!promoverTarget) return
    setLoadingPromover(true)
    try {
      const res = await fetch(`/api/usuarios/${promoverTarget.id}/promover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: promoverTipo }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${promoverTarget.nome} promovido para ${TIPO_LABEL[promoverTipo] ?? promoverTipo}!`)
      setPromoverTarget(null)
      mutate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao promover")
    } finally { setLoadingPromover(false) }
  }

  async function toggleStatus(id: string, status: string) {
    const novoStatus = status === "ativo" ? "inativo" : "ativo"
    await fetch(`/api/usuarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: novoStatus }),
    })
    mutate()
  }

  async function excluirSistema() {
    if (!deleteSistemaTarget) return
    setDeletingSistema(true)
    try {
      const res = await fetch(`/api/usuarios/${deleteSistemaTarget.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(err.error ?? "Erro ao excluir")
      }
      toast.success(`${deleteSistemaTarget.nome} foi desativado!`)
      setDeleteSistemaTarget(null)
      mutate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir")
    } finally { setDeletingSistema(false) }
  }

  function abrirProfModal(u: Usuario, tipo: "vm_ext" | "vm_int") {
    const professionalId = tipo === "vm_ext"
      ? (videomakers.find(vm => vm.usuarioId === u.id)?.id ?? null)
      : (editores.find(ed => ed.usuarioId === u.id)?.id ?? null)
    setProfModal({
      tipo,
      usuarioId: u.id,
      professionalId,
      nome: u.nome,
      email: u.email,
      telefone: u.telefone,
      status: u.status,
    })
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

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Header
        title="Pessoas & Acessos"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500 w-44"
              />
            </div>
          </div>
        }
      />

      <main className="flex-1 p-6 space-y-5">

        {/* ── Sub-tabs ── */}
        <div className="flex items-center gap-0 border-b border-zinc-800">
          {subTabs.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => { setSubTab(t.id); setShowForm(false); setConflito(null) }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                  subTab === t.id
                    ? "border-purple-500 text-purple-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                <span className={cn(
                  "ml-0.5 text-xs px-1.5 py-0.5 rounded-full",
                  subTab === t.id ? "bg-purple-500/20 text-purple-400" : "bg-zinc-800 text-zinc-500"
                )}>{t.count}</span>
              </button>
            )
          })}
        </div>

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm text-zinc-500">{currentList.length} pessoa(s)</p>
            {subTab === "sistema" && (
              <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)}
                className="text-xs border border-zinc-700 rounded-lg px-2.5 py-1.5 bg-zinc-800 text-zinc-300 outline-none focus:ring-1 focus:ring-purple-500">
                <option value="todos">Todas as categorias</option>
                <option value="interna">Equipe interna</option>
                <option value="solicitante">Solicitantes</option>
                <option value="externo">Profissionais externos</option>
                <option value="sistema">Sistema / Teste</option>
                <option value="inativos">Inativos</option>
              </select>
            )}
          </div>
          {subTab === "sistema" ? (
            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Nova Pessoa
            </button>
          ) : subTab === "vm_ext" ? (
            <Link href="/videomakers">
              <button className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors font-medium">
                <Plus className="w-3.5 h-3.5" /> Gerenciar Videomakers
              </button>
            </Link>
          ) : (
            <Link href="/equipe">
              <button className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors font-medium">
                <Plus className="w-3.5 h-3.5" /> Gerenciar Equipe Int
              </button>
            </Link>
          )}
        </div>

        {/* ── Formulário Novo Usuário ── */}
        {showForm && subTab === "sistema" && (
          <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-100">Nova Pessoa</p>
              <button onClick={() => { setShowForm(false); setConflito(null) }} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Nome *</label>
                <input className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                  value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">E-mail *</label>
                <input className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                  type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Senha *</label>
                <input className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                  type="password" value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Papel / acesso *</label>
                <select className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                  value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                  {TIPO_OPTS.map(t => <option key={t} value={t}>{TIPO_LABEL[t] ?? t}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-400 block mb-1">Telefone / WhatsApp</label>
                <input className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                  value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="+55 11 99999-9999" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Categoria</label>
                <select className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                  value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Função profissional</label>
                <select className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500"
                  value={form.funcaoProfissional} onChange={e => setForm(f => ({ ...f, funcaoProfissional: e.target.value }))}>
                  <option value="">— Não definida —</option>
                  {FUNCOES.map(fn => <option key={fn} value={fn}>{FUNCAO_LABEL[fn] ?? fn}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-400 block mb-1">Áreas de atuação</label>
                <div className="flex flex-wrap gap-2">
                  {AREAS.map(a => (
                    <button key={a.value} type="button" onClick={() => toggleFormArea(a.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border ${form.areas.includes(a.value) ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Banner conflito de telefone */}
            {conflito && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Telefone já cadastrado para <span className="text-white">&ldquo;{conflito.nome}&rdquo;</span>
                  {conflito.email && <span className="text-amber-300/70">({conflito.email})</span>}
                </p>
                {form.email && !conflito.email && (
                  <p className="text-xs text-zinc-300">Deseja adicionar o e-mail <strong>{form.email}</strong> a esse cadastro existente?</p>
                )}
                <div className="flex gap-2 pt-1">
                  {form.email && !conflito.email && (
                    <button
                      onClick={adicionarEmailAoCadastroExistente}
                      disabled={adicionandoEmail}
                      className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                    >
                      {adicionandoEmail ? "Salvando..." : "✅ Sim, adicionar e-mail"}
                    </button>
                  )}
                  <button
                    onClick={() => setConflito(null)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                  >
                    ❌ Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={criarUsuario}
                disabled={loading || !form.nome.trim() || !form.senha || !form.email}
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {loading ? "Criando..." : "Criar Pessoa"}
              </button>
              <button onClick={() => { setShowForm(false); setConflito(null) }} className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── Tabela de usuários do sistema ── */}
        {subTab === "sistema" && (
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800/50 border-b border-zinc-800">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">NOME</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">E-MAIL / WHATSAPP</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">CATEGORIA / ÁREAS</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">PAPEL</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">STATUS</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {filtrar(sistema).map(u => (
                  <tr
                    key={u.id}
                    className="hover:bg-zinc-800/40 cursor-pointer group transition-colors"
                    onClick={() => setEditTarget({ id: u.id, nome: u.nome, email: u.email, telefone: u.telefone, tipo: u.tipo, categoria: u.categoria, funcaoProfissional: u.funcaoProfissional, areas: u.areas })}
                  >
                    <td className="px-4 py-3 font-medium text-zinc-100">
                      <div className="flex items-center gap-2">
                        {u.nome}
                        <Pencil className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-zinc-400">{u.email || <span className="text-zinc-600 italic">sem e-mail</span>}</p>
                      {u.telefone && <p className="text-xs text-zinc-600 mt-0.5">{u.telefone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-zinc-800 text-zinc-300 border-zinc-700">
                        {CATEGORIA_LABEL[u.categoria ?? "interna"] ?? u.categoria}
                      </span>
                      {(u.areas?.length ?? 0) > 0 && (
                        <p className="text-[10px] text-zinc-500 mt-0.5">{(u.areas ?? []).map(a => AREA_LABEL[a] ?? a).join(" · ")}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border", TIPO_COLOR[u.tipo] ?? "bg-zinc-800 text-zinc-400 border-zinc-700")}>
                        {TIPO_LABEL[u.tipo] ?? u.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                        u.status === "ativo" ? "bg-green-500/10 text-green-400" : "bg-zinc-800 text-zinc-500"
                      )}>
                        {u.status === "ativo" ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {/* Permissões */}
                        <button
                          onClick={() => setPermUser({ id: u.id, nome: u.nome, tipo: u.tipo })}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-purple-400 hover:bg-purple-900/20 transition-colors"
                          title="Permissões"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                        {/* Editar */}
                        <button
                          onClick={() => setEditTarget({ id: u.id, nome: u.nome, email: u.email, telefone: u.telefone, tipo: u.tipo, categoria: u.categoria, funcaoProfissional: u.funcaoProfissional, areas: u.areas })}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {/* Reset senha */}
                        <button
                          onClick={() => setResetTarget({ id: u.id, nome: u.nome, email: u.email })}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-amber-400 hover:bg-amber-900/20 transition-colors"
                          title="Redefinir senha"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {/* Promover (só solicitante) */}
                        {u.tipo === "solicitante" && (
                          <button
                            onClick={() => setPromoverTarget({ id: u.id, nome: u.nome })}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-purple-400 hover:bg-purple-900/20 transition-colors"
                            title="Promover"
                          >
                            <UserCog className="w-4 h-4" />
                          </button>
                        )}
                        {/* Mesclar (hover) */}
                        <button
                          onClick={() => abrirMesclar(u)}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-blue-900/20 transition-colors opacity-0 group-hover:opacity-100"
                          title="Mesclar com duplicado"
                        >
                          <GitMerge className="w-4 h-4" />
                        </button>
                        {/* Status toggle */}
                        <button
                          onClick={() => toggleStatus(u.id, u.status)}
                          className={cn(
                            "p-1.5 rounded-md transition-colors",
                            u.status === "ativo"
                              ? "text-green-500 hover:text-red-400 hover:bg-red-900/20"
                              : "text-zinc-600 hover:text-green-400 hover:bg-green-900/20"
                          )}
                          title={u.status === "ativo" ? "Desativar" : "Reativar"}
                        >
                          {u.status === "ativo" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </button>
                        {/* Excluir */}
                        <button
                          onClick={() => setDeleteSistemaTarget({ id: u.id, nome: u.nome })}
                          className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                          title="Excluir usuário"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtrar(sistema).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-600">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Nenhum usuário encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Videomakers Ext ── */}
        {subTab === "vm_ext" && (
          <>
            <p className="text-xs text-zinc-500 bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2">
              Contas criadas automaticamente ao cadastrar o profissional.
              Senha padrão: <code className="text-zinc-300 bg-zinc-700/60 px-1 rounded">nuflow</code> + 4 últimos dígitos do telefone.
            </p>
            <div className="border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800/50 border-b border-zinc-800">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">NOME</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">E-MAIL / WHATSAPP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">STATUS</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">PERFIL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {filtrar(vmExt).map(v => (
                    <tr
                      key={v.id}
                      className="hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                      onClick={() => abrirProfModal(v, "vm_ext")}
                    >
                      <td className="px-4 py-3 font-medium text-zinc-100">
                        <div className="flex items-center gap-2">
                          <Camera className="w-4 h-4 text-amber-400 shrink-0" />
                          {v.nome}
                          <Pencil className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-zinc-400">{(v as Usuario).email || <span className="text-zinc-600 italic">sem e-mail</span>}</p>
                        {v.telefone && <p className="text-xs text-zinc-600 mt-0.5">{v.telefone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                          v.status === "ativo" || v.status === "preferencial" ? "bg-green-500/10 text-green-400" : "bg-zinc-800 text-zinc-500"
                        )}>
                          {v.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {(() => {
                            const profId = videomakers.find(vm => vm.usuarioId === v.id)?.id
                            return profId ? (
                              <Link
                                href={`/videomakers/${profId}`}
                                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                                title="Ver perfil completo"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Link>
                            ) : null
                          })()}
                          <button
                            onClick={() => abrirProfModal(v, "vm_ext")}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                            title="Editar / ver dados"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              const profId = videomakers.find(vm => vm.usuarioId === v.id)?.id ?? null
                              setProfModal({ tipo: "vm_ext", usuarioId: v.id, professionalId: profId, nome: v.nome, email: (v as Usuario).email, telefone: v.telefone, status: v.status })
                            }}
                            className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtrar(vmExt).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-600">
                        <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Nenhum videomaker externo cadastrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Videomakers Int ── */}
        {subTab === "vm_int" && (
          <>
            <p className="text-xs text-zinc-500 bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2">
              Contas criadas automaticamente ao cadastrar o profissional.
              Senha padrão: <code className="text-zinc-300 bg-zinc-700/60 px-1 rounded">nuflow</code> + 4 últimos dígitos do telefone.
            </p>
            <div className="border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800/50 border-b border-zinc-800">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">NOME</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">E-MAIL / WHATSAPP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">STATUS</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">PERFIL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {filtrar(vmInt).map(e => (
                    <tr
                      key={e.id}
                      className="hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                      onClick={() => abrirProfModal(e, "vm_int")}
                    >
                      <td className="px-4 py-3 font-medium text-zinc-100">
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4 text-indigo-400 shrink-0" />
                          {e.nome}
                          <Pencil className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-zinc-400">{(e as Usuario).email || <span className="text-zinc-600 italic">sem e-mail</span>}</p>
                        {e.telefone && <p className="text-xs text-zinc-600 mt-0.5">{e.telefone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                          e.status === "ativo" ? "bg-green-500/10 text-green-400" : "bg-zinc-800 text-zinc-500"
                        )}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={ex => ex.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {(() => {
                            const profId = editores.find(ed => ed.usuarioId === e.id)?.id
                            return profId ? (
                              <Link
                                href={`/equipe/${profId}`}
                                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                                title="Ver perfil completo"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Link>
                            ) : null
                          })()}
                          <button
                            onClick={() => abrirProfModal(e, "vm_int")}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                            title="Editar / ver dados"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              const profId = editores.find(ed => ed.usuarioId === e.id)?.id ?? null
                              setProfModal({ tipo: "vm_int", usuarioId: e.id, professionalId: profId, nome: e.nome, email: (e as Usuario).email, telefone: e.telefone, status: e.status })
                            }}
                            className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtrar(vmInt).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-600">
                        <Film className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Nenhum videomaker interno cadastrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* ── Modais ── */}

      {editTarget && (
        <ModalEditarUsuario
          usuario={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={() => { mutate(); setEditTarget(null) }}
        />
      )}

      {resetTarget && (
        <ModalResetSenha
          usuario={resetTarget}
          onClose={() => setResetTarget(null)}
          onSave={() => mutate()}
        />
      )}

      {promoverTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="font-semibold text-white mb-1">Promover Usuário</h3>
            <p className="text-sm text-zinc-400 mb-4">{promoverTarget.nome} será promovido de solicitante.</p>
            <label className="text-xs text-zinc-500 mb-1 block">Novo tipo</label>
            <select
              value={promoverTipo}
              onChange={e => setPromoverTipo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 mb-4 outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="operacao">Operação</option>
              <option value="gestor">Gestor</option>
              <option value="social">Social Media</option>
              <option value="designer">Designer</option>
              <option value="analista_crm">Analista CRM</option>
              <option value="gestor_trafego">Gestor de Tráfego</option>
              <option value="auxiliar_admin">Auxiliar Admin</option>
              <option value="gestor_eventos">Gestor de Eventos</option>
              <option value="admin">Admin</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={promoverUsuario}
                disabled={loadingPromover}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50 transition-colors"
              >
                {loadingPromover ? "Salvando..." : "Confirmar"}
              </button>
              <button
                onClick={() => setPromoverTarget(null)}
                className="flex-1 border border-zinc-700 text-zinc-300 text-sm py-2.5 rounded-xl hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal perfil profissional (vm_ext / vm_int) */}
      {profModal && (
        <ModalPerfilProfissional
          {...profModal}
          onClose={() => setProfModal(null)}
          onDeleted={() => { setProfModal(null); mutate() }}
        />
      )}

      {/* Modal confirmar exclusão (sistema) */}
      {deleteSistemaTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !deletingSistema && setDeleteSistemaTarget(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Excluir usuário</p>
                <p className="text-xs text-zinc-400">{deleteSistemaTarget.nome}</p>
              </div>
            </div>
            <p className="text-sm text-zinc-300">
              Isso desativa a conta de <strong>{deleteSistemaTarget.nome}</strong>. O usuário não poderá mais fazer login.
            </p>
            <p className="text-xs text-zinc-500">O histórico de demandas e registros são mantidos no sistema.</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={excluirSistema}
                disabled={deletingSistema}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {deletingSistema ? "Excluindo..." : "Sim, excluir"}
              </button>
              <button
                onClick={() => setDeleteSistemaTarget(null)}
                disabled={deletingSistema}
                className="flex-1 border border-zinc-700 text-zinc-300 text-sm py-2 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {permUser && (
        <PermissoesModal
          usuarioId={permUser.id}
          usuarioNome={permUser.nome}
          usuarioTipo={permUser.tipo}
          open={!!permUser}
          onClose={() => setPermUser(null)}
        />
      )}

      {mesclarModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !mesclarModal.mesclando && setMesclarModal(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-blue-400" />
                <h2 className="font-semibold text-zinc-100 text-sm">Mesclar Cadastros Duplicados</h2>
              </div>
              <button onClick={() => setMesclarModal(null)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-1">✅ Manter (principal)</p>
                <p className="font-semibold text-zinc-100 text-sm">{mesclarModal.principal.nome}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {mesclarModal.principal.email || <span className="text-zinc-600 italic">sem e-mail</span>}
                  {mesclarModal.principal.telefone && <span className="ml-2 text-zinc-500">{mesclarModal.principal.telefone}</span>}
                </p>
              </div>
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
              {mesclarModal.secundario && (
                <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-zinc-300 mb-2">O que será feito:</p>
                  {!mesclarModal.principal.email && mesclarModal.secundario.email && (
                    <p className="text-xs text-zinc-400 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-400" /> E-mail copiado para o principal</p>
                  )}
                  {!mesclarModal.principal.telefone && mesclarModal.secundario.telefone && (
                    <p className="text-xs text-zinc-400 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-400" /> Telefone copiado para o principal</p>
                  )}
                  {(mesclarModal.qtdDemandas ?? 0) > 0 && (
                    <p className="text-xs text-zinc-400 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-400" /> <strong className="text-zinc-200">{mesclarModal.qtdDemandas}</strong> demanda(s) migrada(s)</p>
                  )}
                  <p className="text-xs text-amber-400 flex items-center gap-1.5 mt-1"><AlertTriangle className="w-3 h-3" /> Cadastro duplicado marcado como <strong>inativo</strong></p>
                </div>
              )}
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
