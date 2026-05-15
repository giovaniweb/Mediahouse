"use client"

import { useState, useRef, useCallback, useEffect, Suspense } from "react"
import { Header } from "@/components/layout/Header"
import { Users, MessageCircle, Plus, Trash2, CheckCircle2, XCircle, RefreshCw, Shield, Mail, SlidersHorizontal, QrCode, Send, Pencil, KeyRound, Eye, EyeOff, AlertCircle, Settings, Upload, FileJson, Loader2, Building2, HardDrive, Video, ArrowUp, ArrowDown, Play } from "lucide-react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { useSearchParams } from "next/navigation"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Tab = "usuarios" | "whatsapp" | "email" | "parametros" | "meu_perfil" | "empresa" | "drive" | "depoimentos"

const TIPO_OPTS = ["admin", "gestor", "operacao", "social", "solicitante", "editor", "videomaker"]
const TIPO_LABEL: Record<string, string> = {
  admin: "Admin",
  gestor: "Gestor",
  operacao: "Operação",
  social: "Social Media",
  solicitante: "Solicitante",
  editor: "Editor",
  videomaker: "Videomaker",
}

// ─── Usuários ────────────────────────────────────────────────────────────────

function ModalResetSenha({ usuario, onClose, onSave }: {
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
      toast.success(`Senha de ${usuario.nome} redefinida com sucesso`)
      onSave()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao redefinir senha")
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
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

type UsuarioSubTab = "sistema" | "vm_ext" | "vm_int"

function TabUsuarios() {
  const { data, mutate } = useSWR<{ usuarios: Array<{
    id: string; nome: string; email: string; telefone?: string;
    tipo: string; status: string; createdAt: string
  }> }>("/api/usuarios", fetcher)

  const [subTab, setSubTab] = useState<UsuarioSubTab>("sistema")
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: "", email: "", senha: "", tipo: "operacao", telefone: "" })
  const [loading, setLoading] = useState(false)
  const [conflito, setConflito] = useState<{ id: string; nome: string; email: string | null; telefone: string | null } | null>(null)
  const [adicionandoEmail, setAdicionandoEmail] = useState(false)
  const [resetTarget, setResetTarget] = useState<{ id: string; nome: string; email: string } | null>(null)
  const [promoverTarget, setPromoverTarget] = useState<{ id: string; nome: string } | null>(null)
  const [promoverTipo, setPromoverTipo] = useState("operacao")
  const [loadingPromover, setLoadingPromover] = useState(false)

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
        // Conflito de telefone — oferecer mesclagem
        setConflito(json.usuario)
        return
      }
      if (!res.ok) throw new Error(json.error)
      toast.success("Usuário criado!")
      setShowForm(false)
      setConflito(null)
      setForm({ nome: "", email: "", senha: "", tipo: "operacao", telefone: "" })
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
      setForm({ nome: "", email: "", senha: "", tipo: "operacao", telefone: "" })
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
    } catch (e) {
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

  const allUsuarios = data?.usuarios ?? []
  const sistema = allUsuarios.filter(u => ["admin", "gestor", "operacao", "solicitante", "social"].includes(u.tipo))
  const vmExt = allUsuarios.filter(u => u.tipo === "videomaker")
  const vmInt = allUsuarios.filter(u => u.tipo === "editor")

  const filteredUsers = subTab === "sistema" ? sistema : subTab === "vm_ext" ? vmExt : vmInt

  const subTabs: { id: UsuarioSubTab; label: string; count: number }[] = [
    { id: "sistema", label: "Usuários do Sistema", count: sistema.length },
    { id: "vm_ext", label: "Videomakers Ext", count: vmExt.length },
    { id: "vm_int", label: "Videomakers Int", count: vmInt.length },
  ]

  return (
    <div className="space-y-4">
      {resetTarget && (
        <ModalResetSenha
          usuario={resetTarget}
          onClose={() => setResetTarget(null)}
          onSave={() => mutate()}
        />
      )}

      {/* Modal Promover */}
      {promoverTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl mx-4">
            <h3 className="font-semibold text-white mb-1">Promover Usuário</h3>
            <p className="text-sm text-zinc-400 mb-4">{promoverTarget.nome} será promovido de solicitante.</p>
            <label className="text-xs text-zinc-500 mb-1 block">Novo tipo</label>
            <select
              value={promoverTipo}
              onChange={e => setPromoverTipo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 mb-4 outline-none"
            >
              <option value="operacao">Operação</option>
              <option value="gestor">Gestor</option>
              <option value="social">Social Media</option>
              <option value="admin">Admin</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={promoverUsuario}
                disabled={loadingPromover}
                className="flex-1 bg-white text-zinc-900 text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
              >
                {loadingPromover ? "Salvando..." : "Confirmar"}
              </button>
              <button
                onClick={() => setPromoverTarget(null)}
                className="flex-1 border border-zinc-700 text-zinc-300 text-sm py-2.5 rounded-xl hover:bg-zinc-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-abas */}
      <div className="flex gap-0 border-b border-zinc-800">
        {subTabs.map(st => (
          <button
            key={st.id}
            onClick={() => setSubTab(st.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-all -mb-px",
              subTab === st.id ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {st.label}
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full",
              subTab === st.id ? "bg-white text-zinc-900" : "bg-zinc-800 text-zinc-500"
            )}>{st.count}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{filteredUsers.length} usuário(s) cadastrado(s)</p>
        {subTab === "sistema" && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 bg-white text-zinc-900 text-xs px-3 py-2 rounded-lg hover:bg-zinc-100 font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Usuário
          </button>
        )}
      </div>

      {showForm && subTab === "sistema" && (
        <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-800 space-y-3">
          <p className="text-sm font-semibold text-zinc-200">Novo Usuário</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400">Nome *</label>
              <input className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm mt-1 text-zinc-200" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-zinc-400">E-mail *</label>
              <input className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm mt-1 text-zinc-200" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Senha *</label>
              <input className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm mt-1 text-zinc-200" type="password" value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Tipo *</label>
              <select className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm mt-1 text-zinc-200" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                {TIPO_OPTS.map(t => <option key={t} value={t}>{TIPO_LABEL[t] ?? t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-zinc-400">Telefone</label>
              <input className="w-full border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm mt-1 text-zinc-200" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="+55 11 99999-9999" />
            </div>
          </div>
          {/* Banner de conflito de telefone */}
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
            <button onClick={criarUsuario} disabled={loading} className="bg-white text-zinc-900 text-xs px-4 py-2 rounded-lg hover:bg-zinc-100 font-semibold disabled:opacity-50">
              {loading ? "Criando..." : "Criar"}
            </button>
            <button onClick={() => { setShowForm(false); setConflito(null) }} className="text-xs px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancelar</button>
          </div>
        </div>
      )}

      {/* Info sobre contas automáticas */}
      {(subTab === "vm_ext" || subTab === "vm_int") && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3 text-xs text-zinc-400">
          As contas de {subTab === "vm_ext" ? "videomakers externos" : "videomakers internos"} são criadas automaticamente ao cadastrar o profissional.
          Senha padrão: <code className="text-zinc-300 bg-zinc-800 px-1 rounded">nuflow</code> + 4 últimos dígitos do telefone.
          Login pode ser feito com e-mail ou telefone.
        </div>
      )}

      <div className="border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 border-b border-zinc-800">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">NOME</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">E-MAIL / LOGIN</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">TIPO</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">STATUS</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filteredUsers.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 font-medium text-zinc-200">{u.nome}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full capitalize border",
                    u.tipo === "admin" ? "bg-purple-500/10 text-purple-400 border-purple-800" :
                    u.tipo === "gestor" ? "bg-blue-500/10 text-blue-400 border-blue-800" :
                    u.tipo === "videomaker" ? "bg-emerald-500/10 text-emerald-400 border-emerald-800" :
                    u.tipo === "editor" ? "bg-amber-500/10 text-amber-400 border-amber-800" :
                    "bg-zinc-800 text-zinc-300 border-zinc-700"
                  )}>
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
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {u.tipo === "solicitante" && (
                      <button
                        onClick={() => setPromoverTarget({ id: u.id, nome: u.nome })}
                        className="text-zinc-500 hover:text-purple-400 transition-colors"
                        title="Promover usuário"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setResetTarget({ id: u.id, nome: u.nome, email: u.email })}
                      className="text-zinc-500 hover:text-amber-400 transition-colors"
                      title="Redefinir senha"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleStatus(u.id, u.status)}
                      className="text-zinc-500 hover:text-zinc-200 transition-colors"
                      title={u.status === "ativo" ? "Desativar" : "Reativar"}
                    >
                      {u.status === "ativo" ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-600">Nenhum usuário encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

function TabWhatsapp() {
  const { data, mutate } = useSWR<{ config: { instanceUrl: string; apiKey: string; instanceId: string; ativo: boolean } | null }>(
    "/api/configuracoes/whatsapp", fetcher
  )
  const cfg = data?.config
  const [form, setForm] = useState({ instanceUrl: cfg?.instanceUrl ?? "", apiKey: cfg?.apiKey ?? "", instanceId: cfg?.instanceId ?? "" })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [connState, setConnState] = useState<"loading" | "open" | "close" | "unknown">("loading")
  const [testPhone, setTestPhone] = useState("")
  const [sendingTest, setSendingTest] = useState(false)

  // Check connection on mount + poll every 15s
  useSWR<{ connected: boolean; state?: string }>(
    "/api/whatsapp/status", fetcher,
    {
      refreshInterval: 15000,
      onSuccess: (d) => {
        if (d) setConnState(d.connected ? "open" : "close")
      },
    }
  )

  async function salvar() {
    setLoading(true)
    try {
      const res = await fetch("/api/configuracoes/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setMsg({ type: "ok", text: "Configuracao salva!" })
      mutate()
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Erro" })
    } finally { setLoading(false) }
  }

  async function testarConexao() {
    setLoading(true)
    try {
      const res = await fetch("/api/configuracoes/whatsapp/teste", { method: "POST" })
      const json = await res.json()
      setConnState(json.status === "open" ? "open" : "close")
      if (json.ok) setMsg({ type: "ok", text: "Conexao OK! Estado: " + (json.status ?? "conectado") })
      else setMsg({ type: "err", text: "Falha: " + (json.error ?? "Erro desconhecido") })
    } catch {
      setMsg({ type: "err", text: "Erro ao testar conexao" })
    } finally { setLoading(false) }
  }

  async function desconectar() {
    if (!confirm("Tem certeza que deseja desconectar o WhatsApp?")) return
    setLoading(true)
    try {
      const res = await fetch("/api/configuracoes/whatsapp/desconectar", { method: "POST" })
      const json = await res.json()
      if (json.ok) {
        setMsg({ type: "ok", text: "WhatsApp desconectado. Use o QR Code abaixo para reconectar." })
        setConnState("close")
        toast.success("WhatsApp desconectado")
      } else {
        setMsg({ type: "err", text: json.error ?? "Falha ao desconectar" })
      }
    } catch {
      setMsg({ type: "err", text: "Erro ao desconectar" })
    } finally { setLoading(false) }
  }

  async function enviarTeste() {
    if (!testPhone.replace(/\D/g, "")) {
      toast.error("Digite um numero de telefone")
      return
    }
    setSendingTest(true)
    setMsg(null)
    try {
      const res = await fetch("/api/configuracoes/whatsapp/teste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: testPhone }),
      })
      const json = await res.json()
      if (json.ok && json.mensagemEnviada) {
        setMsg({ type: "ok", text: `Mensagem de teste enviada para ${json.para}! Verifique o WhatsApp.` })
        toast.success("Mensagem de teste enviada!")
      } else {
        setMsg({ type: "err", text: json.error ?? "Falha ao enviar mensagem de teste" })
      }
    } catch {
      setMsg({ type: "err", text: "Erro ao enviar teste" })
    } finally { setSendingTest(false) }
  }

  return (
    <div className="space-y-5 max-w-xl">
      {/* Status da Conexao */}
      <div className={cn(
        "rounded-xl p-4 flex items-center justify-between",
        connState === "open"
          ? "bg-green-500/10 border border-green-800"
          : connState === "close"
          ? "bg-red-500/10 border border-red-800"
          : "bg-zinc-800 border border-zinc-700"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-3 h-3 rounded-full",
            connState === "open" ? "bg-green-500" : connState === "close" ? "bg-red-500 animate-pulse" : "bg-zinc-500 animate-pulse"
          )} />
          <div>
            <p className={cn(
              "text-sm font-semibold",
              connState === "open" ? "text-green-300" : connState === "close" ? "text-red-300" : "text-zinc-400"
            )}>
              {connState === "open" ? "WhatsApp Conectado" : connState === "close" ? "WhatsApp Desconectado" : "Verificando..."}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {connState === "open" ? "Bot ativo — recebendo e respondendo mensagens" : connState === "close" ? "Reconecte via QR Code abaixo" : "Aguarde..."}
            </p>
          </div>
        </div>
        {connState === "open" && (
          <button
            onClick={desconectar}
            disabled={loading}
            className="text-xs text-red-400 hover:text-red-300 border border-red-800 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            Desconectar
          </button>
        )}
      </div>

      {msg && (
        <div className={cn(
          "text-sm px-3 py-2 rounded-lg",
          msg.type === "ok" ? "bg-green-500/10 border border-green-800 text-green-300" : "bg-red-500/10 border border-red-800 text-red-300"
        )}>
          {msg.text}
        </div>
      )}

      {/* Teste Rapido End-to-End */}
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Send className="w-4 h-4 text-zinc-400" />
          Teste Rapido — Enviar Mensagem
        </p>
        <p className="text-xs text-zinc-500">Envia uma mensagem de teste real para confirmar que o bot esta funcionando end-to-end.</p>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            placeholder="Ex: 5531992271043"
          />
          <button
            onClick={enviarTeste}
            disabled={sendingTest || connState !== "open"}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-40 transition-colors"
          >
            {sendingTest ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sendingTest ? "Enviando..." : "Enviar Teste"}
          </button>
        </div>
      </div>

      {/* Configuracao da Evolution API */}
      <div className="border-t border-zinc-800 pt-5">
        <p className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4 text-zinc-500" />
          Configuracao da Evolution API
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-zinc-500 block mb-1">URL da Instancia *</label>
            <input
              className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              value={form.instanceUrl}
              onChange={e => setForm(f => ({ ...f, instanceUrl: e.target.value }))}
              placeholder="https://sua-evolution-api.com"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 block mb-1">API Key *</label>
            <input
              type="password"
              className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              value={form.apiKey}
              onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              placeholder="api-key"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 block mb-1">Instance ID *</label>
            <input
              className="w-full border border-zinc-700 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              value={form.instanceId}
              onChange={e => setForm(f => ({ ...f, instanceId: e.target.value }))}
              placeholder="nuflow-instance"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={salvar} disabled={loading} className="flex items-center gap-1.5 bg-white text-zinc-900 text-sm px-4 py-2 rounded-lg hover:bg-zinc-100 disabled:opacity-50 font-medium">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            Salvar
          </button>
          <button onClick={testarConexao} disabled={loading} className="flex items-center gap-1.5 border border-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg hover:bg-zinc-800 disabled:opacity-50">
            <RefreshCw className="w-4 h-4" /> Testar Conexao
          </button>
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs font-semibold text-zinc-500 mb-2">Notificacoes automaticas configuradas:</p>
        <ul className="space-y-1 text-xs text-zinc-500">
          {[
            "Nova demanda urgente — notifica gestores",
            "Videomaker notificado — aguarda confirmacao",
            "Captacao agendada — lembrete 24h antes",
            "Edicao finalizada — notifica solicitante",
            "Demanda aprovada — notifica solicitante",
            "Aprovacao de video pendente — link enviado ao cliente",
          ].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ─── E-mail / Financeiro ─────────────────────────────────────────────────────

function TabEmail() {
  const { data, mutate } = useSWR<{ config: {
    apiKeyPreview: string; senderEmail: string; senderNome: string
    emailsFinanceiro: string[]; ativo: boolean
  } | null }>("/api/configuracoes/email", fetcher)

  const cfg = data?.config
  const [form, setForm] = useState({
    apiKey: "",
    senderEmail: cfg?.senderEmail || "",
    senderNome: cfg?.senderNome || "NuFlow",
    emailsFinanceiro: (cfg?.emailsFinanceiro || []).join(", "),
  })
  const [loading, setLoading] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [loadingTest, setLoadingTest] = useState(false)
  const [mostrarKey, setMostrarKey] = useState(false)

  async function salvar() {
    setLoading(true)
    try {
      const emails = form.emailsFinanceiro.split(",").map(e => e.trim()).filter(Boolean)
      const body: Record<string, unknown> = {
        senderEmail: form.senderEmail,
        senderNome: form.senderNome,
        emailsFinanceiro: emails,
      }
      if (form.apiKey) body.apiKey = form.apiKey
      const res = await fetch("/api/configuracoes/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Configuração Resend salva!")
      setForm(f => ({ ...f, apiKey: "" }))
      mutate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally { setLoading(false) }
  }

  async function testar() {
    if (!testEmail) { toast.error("Informe o e-mail de teste"); return }
    setLoadingTest(true)
    try {
      const res = await fetch("/api/configuracoes/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "testar", destinatario: testEmail }),
      })
      const json = await res.json()
      if (json.ok) toast.success("E-mail de teste enviado!")
      else toast.error(json.error ?? "Erro ao enviar")
    } catch { toast.error("Erro ao testar") }
    finally { setLoadingTest(false) }
  }

  return (
    <div className="space-y-5 max-w-lg">
      {/* Banner Resend */}
      <div className="bg-purple-500/10 border border-purple-800 rounded-xl p-4 flex items-start gap-3">
        <Mail className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <div className="text-sm text-purple-300">
          <p className="font-semibold">Resend — envio de e-mail profissional</p>
          <p className="text-xs mt-1 text-purple-400">
            Crie uma conta gratuita em{" "}
            <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-purple-300 underline">resend.com</a>
            , gere uma API Key e cole abaixo. Plano grátis: 3.000 e-mails/mês.
          </p>
        </div>
      </div>

      {cfg?.ativo && (
        <div className="flex items-center gap-2 text-xs font-medium text-green-400">
          <CheckCircle2 className="w-4 h-4" /> Resend configurado e ativo
        </div>
      )}

      <div className="space-y-3">
        {/* API Key */}
        <div>
          <label className="text-xs text-zinc-400 block mb-1">
            API Key {cfg?.ativo ? `— atual: ${cfg.apiKeyPreview} (deixe em branco para manter)` : "*"}
          </label>
          <div className="relative">
            <input className={inp} type={mostrarKey ? "text" : "password"} value={form.apiKey}
              onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              placeholder={cfg?.ativo ? "••••••••••••••••" : "re_xxxxxxxxxxxxxxxxxxxxxxxx"} />
            <button type="button" onClick={() => setMostrarKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              {mostrarKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-zinc-600 mt-1">
            Gere em:{" "}
            <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">resend.com/api-keys</a>
          </p>
        </div>

        {/* Remetente */}
        <div className="border-t border-zinc-800 pt-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Remetente</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Nome</label>
              <input className={inp} value={form.senderNome}
                onChange={e => setForm(f => ({ ...f, senderNome: e.target.value }))}
                placeholder="NuFlow" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">E-mail</label>
              <input className={inp} type="text" value={form.senderEmail}
                onChange={e => setForm(f => ({ ...f, senderEmail: e.target.value }))}
                placeholder="onboarding@resend.dev" />
            </div>
          </div>
          <p className="text-[11px] text-zinc-600 mt-2">
            ⚠️ Sem domínio verificado: use <span className="font-mono text-zinc-500">onboarding@resend.dev</span> (só envia para o e-mail da sua conta Resend).
            Para produção, verifique seu domínio em{" "}
            <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">resend.com/domains</a>.
          </p>
        </div>

        {/* E-mails Financeiro */}
        <div>
          <label className="text-xs text-zinc-400 block mb-1">E-mails do Financeiro</label>
          <input className={inp} type="text" value={form.emailsFinanceiro}
            onChange={e => setForm(f => ({ ...f, emailsFinanceiro: e.target.value }))}
            placeholder="financeiro@empresa.com, contador@empresa.com" />
          <p className="text-[11px] text-zinc-600 mt-1">Separe por vírgula. Receberão as solicitações de pagamento.</p>
        </div>
      </div>

      <button onClick={salvar} disabled={loading}
        className="flex items-center gap-1.5 bg-white text-zinc-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-100 disabled:opacity-50">
        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
        Salvar Resend
      </button>

      <div className="border-t border-zinc-800 pt-5">
        <p className="text-xs font-semibold text-zinc-400 mb-3">Testar envio</p>
        <div className="flex gap-2">
          <input className={`${inp} flex-1`} type="text" value={testEmail}
            onChange={e => setTestEmail(e.target.value)} placeholder="seu@email.com" />
          <button onClick={testar} disabled={loadingTest}
            className="flex items-center gap-1.5 border border-zinc-700 text-zinc-300 text-sm px-3 py-2 rounded-lg hover:bg-zinc-800 disabled:opacity-50">
            <Send className="w-4 h-4" />
            {loadingTest ? "Enviando..." : "Testar"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Parâmetros Dinâmicos ─────────────────────────────────────────────────────

const GRUPOS = [
  { id: "departamentos", label: "Departamentos" },
  { id: "tipos_video", label: "Tipos de Vídeo" },
  { id: "habilidades", label: "Habilidades" },
  { id: "areas_atuacao", label: "Áreas de Atuação" },
]

interface Param { id: string; valor: string; label: string; ativo: boolean; ordem: number }

function TabParametros() {
  const [grupo, setGrupo] = useState("departamentos")
  const { data, mutate } = useSWR<{ parametros: Param[] }>(
    `/api/configuracoes/parametros?grupo=${grupo}`, fetcher
  )
  const params = data?.parametros ?? []

  const [newLabel, setNewLabel] = useState("")
  const [newValor, setNewValor] = useState("")
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<{ processados: number; pulados: number; erros: number } | null>(null)

  async function criar() {
    if (!newLabel.trim()) return
    setSaving(true)
    try {
      const valor = newValor.trim() || newLabel.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
      const res = await fetch("/api/configuracoes/parametros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupo, valor, label: newLabel.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Parâmetro criado!")
      setNewLabel(""); setNewValor("")
      mutate()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro") }
    finally { setSaving(false) }
  }

  async function toggleAtivo(p: Param) {
    try {
      await fetch(`/api/configuracoes/parametros/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !p.ativo }),
      })
      mutate()
    } catch { toast.error("Erro") }
  }

  async function salvarEdit(p: Param) {
    try {
      await fetch(`/api/configuracoes/parametros/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel }),
      })
      toast.success("Atualizado!")
      setEditing(null)
      mutate()
    } catch { toast.error("Erro") }
  }

  async function remover(p: Param) {
    if (!confirm(`Remover "${p.label}"?`)) return
    try {
      await fetch(`/api/configuracoes/parametros/${p.id}`, { method: "DELETE" })
      toast.success("Removido")
      mutate()
    } catch { toast.error("Erro") }
  }

  return (
    <div className="space-y-5">
      {/* Grupo select */}
      <div className="flex gap-2 flex-wrap">
        {GRUPOS.map(g => (
          <button key={g.id} onClick={() => setGrupo(g.id)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              grupo === g.id ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
            )}>
            {g.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-1.5">
        {params.map((p) => (
          <div key={p.id} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
            p.ativo ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-800 bg-zinc-900 opacity-50"
          )}>
            {editing === p.id ? (
              <input
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") salvarEdit(p); if (e.key === "Escape") setEditing(null) }}
                className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-500"
                autoFocus
              />
            ) : (
              <div className="flex-1 flex items-center gap-2">
                <span className="text-sm text-zinc-200">{p.label}</span>
                <span className="text-xs text-zinc-600 font-mono">{p.valor}</span>
              </div>
            )}
            <div className="flex items-center gap-1 shrink-0">
              {editing === p.id ? (
                <>
                  <button onClick={() => salvarEdit(p)} className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">OK</button>
                  <button onClick={() => setEditing(null)} className="text-xs border border-zinc-700 text-zinc-400 px-2 py-1 rounded hover:bg-zinc-800">✕</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditing(p.id); setEditLabel(p.label) }} className="text-zinc-600 hover:text-zinc-400 p-1">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => toggleAtivo(p)} className="text-zinc-600 hover:text-zinc-400 p-1" title={p.ativo ? "Desativar" : "Ativar"}>
                    {p.ativo ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => remover(p)} className="text-zinc-700 hover:text-red-500 p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {params.length === 0 && (
          <p className="text-sm text-zinc-600 text-center py-4">Nenhum parâmetro. Crie o primeiro abaixo.</p>
        )}
      </div>

      {/* Novo */}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs text-zinc-500 font-medium mb-3">Adicionar novo parâmetro</p>
        <div className="flex gap-2">
          <input
            className={`${inp} flex-1`}
            placeholder="Label (ex: Motion Graphics)"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && criar()}
          />
          <input
            className={`${inp} w-40`}
            placeholder="valor (auto)"
            value={newValor}
            onChange={e => setNewValor(e.target.value)}
          />
          <button onClick={criar} disabled={saving || !newLabel.trim()}
            className="flex items-center gap-1.5 bg-white text-zinc-900 text-sm font-medium px-3 py-2 rounded-lg hover:bg-zinc-100 disabled:opacity-40">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Backfill de custos retroativos */}
      <div className="border-t border-zinc-800 pt-6">
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Settings className="w-4 h-4 text-orange-400" /> Gerar Custos Retroativos
            </h4>
            <p className="text-xs text-zinc-500 mt-1">
              Cria registros de custo para demandas finalizadas que ainda não têm custo vinculado.
              Usa o <strong className="text-zinc-400">valor/diária</strong> de cada videomaker.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={async () => {
                setBackfilling(true)
                setBackfillResult(null)
                try {
                  const res = await fetch("/api/admin/backfill-custos", { method: "POST" })
                  const json = await res.json()
                  if (!res.ok) throw new Error(json.error ?? "Erro ao executar backfill")
                  setBackfillResult({ processados: json.processados, pulados: json.pulados, erros: json.erros })
                  toast.success(`✅ Backfill: ${json.processados} custo(s) criado(s)!`)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro no backfill")
                } finally {
                  setBackfilling(false)
                }
              }}
              disabled={backfilling}
              className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {backfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
              {backfilling ? "Processando…" : "⚙️ Gerar custos retroativos"}
            </button>
            {backfillResult && (
              <span className={`text-xs px-3 py-1.5 rounded-lg border ${backfillResult.erros === 0 ? "bg-emerald-900/30 border-emerald-700/40 text-emerald-400" : "bg-amber-900/30 border-amber-700/40 text-amber-400"}`}>
                {backfillResult.processados} criado(s) · {backfillResult.pulados} já existiam{backfillResult.erros > 0 ? ` · ${backfillResult.erros} erro(s)` : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── WhatsApp QR ──────────────────────────────────────────────────────────────

function TabWhatsappQR() {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [conectado, setConectado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Verifica se a config do WhatsApp existe antes de tentar
  const { data: wppConfig } = useSWR<{ config: { instanceUrl: string; apiKey: string; instanceId: string } | null }>(
    "/api/configuracoes/whatsapp", fetcher
  )
  const temConfig = !!(wppConfig?.config?.instanceUrl && wppConfig?.config?.apiKey && wppConfig?.config?.instanceId)

  async function buscarQR() {
    setErro(null)
    setQrCode(null)
    setConectado(false)
    setLoading(true)
    try {
      const res = await fetch("/api/configuracoes/whatsapp/qr")
      const data = await res.json()

      if (data.error) {
        setErro(data.error)
        return
      }

      if (data.conectado) {
        setConectado(true)
        toast.success("WhatsApp já está conectado!")
        return
      }

      if (data.qrcode) {
        setQrCode(data.qrcode)
      } else {
        setErro("QR code não retornado pela Evolution API. Verifique se a instância está ativa.")
      }
    } catch (e) {
      setErro(`Erro de conexão: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5 max-w-md">
      {/* Header */}
      <div className="bg-green-500/10 border border-green-800 rounded-xl p-4 flex items-start gap-3">
        <QrCode className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
        <div className="text-sm text-green-300">
          <p className="font-semibold">Conectar WhatsApp via QR Code</p>
          <p className="text-xs mt-1 text-green-400/80">
            Escaneie com o WhatsApp no celular → Aparelhos Conectados → Conectar Aparelho
          </p>
        </div>
      </div>

      {/* Aviso: sem config */}
      {wppConfig !== undefined && !temConfig && (
        <div className="bg-amber-500/10 border border-amber-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-300">
            <p className="font-semibold">Configure a Evolution API primeiro</p>
            <p className="text-xs mt-1 text-amber-400/80">
              Preencha a URL da Instância, API Key e Instance ID acima e clique em <strong>Salvar</strong> antes de gerar o QR.
            </p>
          </div>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="bg-red-500/10 border border-red-800 rounded-xl p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm text-red-300">
            <p className="font-semibold">Erro ao gerar QR Code</p>
            <p className="text-xs mt-1 text-red-400/80">{erro}</p>
            {erro.includes("não configurado") && (
              <p className="text-xs mt-2 text-amber-400">
                ↑ Preencha a URL, API Key e Instance ID no formulário acima e clique em Salvar.
              </p>
            )}
            {erro.includes("Evolution API retornou") && (
              <p className="text-xs mt-2 text-amber-400">
                Verifique se a Evolution API está rodando e se a Instance ID está correta.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Conectado */}
      {conectado && (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-800 rounded-xl p-4">
          <CheckCircle2 className="w-6 h-6 text-green-400" />
          <div>
            <p className="text-sm font-semibold text-green-300">WhatsApp conectado!</p>
            <p className="text-xs text-green-400/80 mt-0.5">Notificações automáticas estão ativas.</p>
          </div>
        </div>
      )}

      {/* QR Code */}
      {qrCode && !conectado && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl w-fit shadow-lg">
            {/* Evolution API retorna o QR como imagem base64 — exibir diretamente */}
            <img
              src={qrCode}
              alt="QR Code WhatsApp"
              width={220}
              height={220}
              className="rounded"
            />
          </div>
          <ol className="text-xs text-zinc-400 space-y-1 list-decimal list-inside">
            <li>Abra o WhatsApp no seu celular</li>
            <li>Toque em <strong className="text-zinc-300">⋮ Menu</strong> → <strong className="text-zinc-300">Aparelhos Conectados</strong></li>
            <li>Toque em <strong className="text-zinc-300">Conectar Aparelho</strong></li>
            <li>Escaneie este QR Code</li>
          </ol>
          <div className="flex gap-2">
            <button
              onClick={buscarQR}
              disabled={loading}
              className="flex items-center gap-1.5 border border-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              {loading ? "Atualizando..." : "Atualizar QR"}
            </button>
            <button
              onClick={buscarQR}
              disabled={loading}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Já escaneei — Verificar
            </button>
          </div>
          <p className="text-[11px] text-zinc-600">QR expira em ~60 segundos. Se expirar, clique em Atualizar QR.</p>
        </div>
      )}

      {/* Botão gerar (quando não tem QR e não está conectado) */}
      {!qrCode && !conectado && (
        <button
          onClick={buscarQR}
          disabled={loading || (wppConfig !== undefined && !temConfig)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
          {loading ? "Gerando QR Code..." : "Gerar QR Code"}
        </button>
      )}
    </div>
  )
}

// ─── Tab Meu Perfil ────────────────────────────────────────────────────────────

function TabMeuPerfil() {
  const { data: session } = useSession()
  const userId = session?.user?.id ?? ""

  const { data: dataEditor, mutate: mutateEditor } = useSWR<{ editores: Array<{ id: string; nome: string; fazCaptacao: boolean }> }>(
    userId ? `/api/editores?usuarioId=${userId}` : null,
    fetcher
  )
  const { data: dataVm, mutate: mutateVm } = useSWR<{ videomakers: Array<{ id: string; nome: string; podeEditar: boolean }> }>(
    userId ? `/api/videomakers?usuarioId=${userId}` : null,
    fetcher
  )

  const editorPerfil = dataEditor?.editores?.[0] ?? null
  const vmPerfil = dataVm?.videomakers?.[0] ?? null

  const [formEditor, setFormEditor] = useState({ nome: session?.user?.name ?? "", especialidade: "", whatsapp: "", fazCaptacao: false })
  const [formVm, setFormVm] = useState({ nome: session?.user?.name ?? "", cidade: "", estado: "", telefone: "", email: session?.user?.email ?? "", podeEditar: true })
  const [loadingE, setLoadingE] = useState(false)
  const [loadingV, setLoadingV] = useState(false)

  async function criarPerfilEditor() {
    setLoadingE(true)
    try {
      // especialidade deve ser String[] — converter a string do input para array
      const especialidadeArr = formEditor.especialidade
        ? formEditor.especialidade.split(",").map(s => s.trim()).filter(Boolean)
        : []
      const res = await fetch("/api/editores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formEditor, especialidade: especialidadeArr, usuarioId: userId }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Erro interno ao criar perfil de editor" }))
        throw new Error(errBody.error || "Erro ao criar perfil")
      }
      toast.success("Perfil de editor criado!")
      mutateEditor()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally { setLoadingE(false) }
  }

  async function criarPerfilVideomaker() {
    setLoadingV(true)
    try {
      const res = await fetch("/api/videomakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formVm, usuarioId: userId }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Erro interno ao criar perfil de videomaker" }))
        throw new Error(errBody.error || "Erro ao criar perfil")
      }
      toast.success("Perfil de videomaker criado!")
      mutateVm()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally { setLoadingV(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-zinc-100 mb-1">Meu Perfil Profissional</h3>
        <p className="text-sm text-zinc-500">Crie um perfil profissional para ser atribuído como editor ou videomaker em demandas.</p>
      </div>

      {/* Perfil de Editor */}
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-zinc-200 flex items-center gap-2">
            <span className="text-lg">✂️</span> Editor / Pós-produção
          </h4>
          {editorPerfil && (
            <span className="text-xs bg-green-500/10 text-green-400 border border-green-700 px-2 py-1 rounded-full">
              Ativo — {editorPerfil.nome}
            </span>
          )}
        </div>
        {editorPerfil ? (
          <p className="text-sm text-zinc-400">
            Você já tem um perfil de editor vinculado. Acesse{" "}
            <a href={`/equipe/${editorPerfil.id}`} className="text-purple-400 underline">seu perfil</a>{" "}
            para editar as informações.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Nome de exibição</label>
              <input
                value={formEditor.nome}
                onChange={e => setFormEditor({ ...formEditor, nome: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500/50"
                placeholder="Seu nome"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Especialidade</label>
              <input
                value={formEditor.especialidade}
                onChange={e => setFormEditor({ ...formEditor, especialidade: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500/50"
                placeholder="Ex: Motion, Colorização, Edição"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFormEditor({ ...formEditor, fazCaptacao: !formEditor.fazCaptacao })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${formEditor.fazCaptacao ? "bg-purple-600" : "bg-zinc-600"}`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${formEditor.fazCaptacao ? "translate-x-5" : "translate-x-1"}`} />
              </button>
              <span className="text-xs text-zinc-400">Pode fazer captação também</span>
            </div>
            <button
              onClick={criarPerfilEditor}
              disabled={loadingE || !formEditor.nome}
              className="flex items-center gap-2 bg-white text-zinc-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-100 disabled:opacity-50"
            >
              {loadingE ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar Perfil de Editor
            </button>
          </div>
        )}
      </div>

      {/* Perfil de Videomaker */}
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-zinc-200 flex items-center gap-2">
            <span className="text-lg">🎬</span> Videomaker Externo
          </h4>
          {vmPerfil && (
            <span className="text-xs bg-green-500/10 text-green-400 border border-green-700 px-2 py-1 rounded-full">
              Ativo — {vmPerfil.nome}
            </span>
          )}
        </div>
        {vmPerfil ? (
          <p className="text-sm text-zinc-400">
            Você já tem um perfil de videomaker vinculado. Acesse{" "}
            <a href={`/videomakers/${vmPerfil.id}`} className="text-purple-400 underline">seu perfil</a>{" "}
            para editar as informações.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Nome de exibição *</label>
                <input
                  value={formVm.nome}
                  onChange={e => setFormVm({ ...formVm, nome: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500/50"
                  placeholder="Seu nome"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">WhatsApp / Telefone</label>
                <input
                  value={formVm.telefone}
                  onChange={e => setFormVm({ ...formVm, telefone: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500/50"
                  placeholder="+55 31 99999-9999"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Cidade</label>
                <input
                  value={formVm.cidade}
                  onChange={e => setFormVm({ ...formVm, cidade: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500/50"
                  placeholder="Ex: Sete Lagoas"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Estado</label>
                <input
                  value={formVm.estado}
                  onChange={e => setFormVm({ ...formVm, estado: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-purple-500/50"
                  placeholder="Ex: MG"
                  maxLength={2}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFormVm({ ...formVm, podeEditar: !formVm.podeEditar })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${formVm.podeEditar ? "bg-purple-600" : "bg-zinc-600"}`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${formVm.podeEditar ? "translate-x-5" : "translate-x-1"}`} />
              </button>
              <span className="text-xs text-zinc-400">Pode fazer edição também</span>
            </div>
            <button
              onClick={criarPerfilVideomaker}
              disabled={loadingV || !formVm.nome}
              className="flex items-center gap-2 bg-white text-zinc-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-100 disabled:opacity-50"
            >
              {loadingV ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar Perfil de Videomaker
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

// ─── Tab Dados da Empresa ──────────────────────────────────────────────────────
function TabEmpresa() {
  const { data, mutate } = useSWR("/api/config/empresa", fetcher)
  const empresa = data?.empresa

  const [form, setForm] = useState({
    razaoSocial: "", nomeFantasia: "", cnpj: "",
    endereco: "", bairro: "", cidade: "", estado: "", cep: "",
    email: "", telefone: "",
    pixKey: "", pixTipo: "cnpj",
    observacoesNF: "",
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  // Preencher form quando carregar dados existentes
  if (empresa && !loaded) {
    setForm({
      razaoSocial: empresa.razaoSocial ?? "",
      nomeFantasia: empresa.nomeFantasia ?? "",
      cnpj: empresa.cnpj ?? "",
      endereco: empresa.endereco ?? "",
      bairro: empresa.bairro ?? "",
      cidade: empresa.cidade ?? "",
      estado: empresa.estado ?? "",
      cep: empresa.cep ?? "",
      email: empresa.email ?? "",
      telefone: empresa.telefone ?? "",
      pixKey: empresa.pixKey ?? "",
      pixTipo: empresa.pixTipo ?? "cnpj",
      observacoesNF: empresa.observacoesNF ?? "",
    })
    setLoaded(true)
  }

  const salvar = async () => {
    setSaving(true)
    try {
      await fetch("/api/config/empresa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      toast.success("Dados da empresa salvos!")
      mutate()
    } catch {
      toast.error("Erro ao salvar")
    } finally { setSaving(false) }
  }

  const F = (label: string, key: keyof typeof form, placeholder?: string, half?: boolean) => (
    <div className={half ? "col-span-1" : "col-span-2"}>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      <input
        value={form[key]}
        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder ?? label}
        className={inp}
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-zinc-200 flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 text-emerald-400" /> Dados da Empresa
        </h3>
        <p className="text-xs text-zinc-500">
          Estas informações aparecem para os videomakers externos na seção "Dados para Nota Fiscal" e
          são usados como referência para emissão de notas fiscais.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {F("Razão Social", "razaoSocial", "Ex: CONTOURLINE EQUIPAMENTOS LTDA")}
        {F("Nome Fantasia", "nomeFantasia", "Ex: Contourline")}
        {F("CNPJ", "cnpj", "XX.XXX.XXX/0001-XX", true)}
        {F("E-mail", "email", "financeiro@empresa.com", true)}
        {F("Endereço", "endereco", "Rua, número, complemento")}
        {F("Bairro", "bairro", "Bairro", true)}
        {F("Cidade", "cidade", "Cidade", true)}
        {F("Estado (sigla)", "estado", "MG", true)}
        {F("CEP", "cep", "30000-000", true)}
        {F("Telefone", "telefone", "(31) 9999-9999", true)}
      </div>

      <div className="border-t border-zinc-800 pt-4">
        <h4 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          💰 Chave PIX
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Tipo da Chave</label>
            <select
              value={form.pixTipo}
              onChange={e => setForm(prev => ({ ...prev, pixTipo: e.target.value }))}
              className={inp}
            >
              <option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option>
              <option value="telefone">Celular</option>
              <option value="aleatoria">Chave Aleatória</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Chave PIX</label>
            <input
              value={form.pixKey}
              onChange={e => setForm(prev => ({ ...prev, pixKey: e.target.value }))}
              placeholder={form.pixTipo === "cnpj" ? "XX.XXX.XXX/0001-XX" : form.pixTipo === "email" ? "pix@empresa.com" : "Chave PIX"}
              className={inp}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-4">
        <h4 className="text-sm font-semibold text-zinc-300 mb-3">📌 Observações para NF</h4>
        <p className="text-xs text-zinc-500 mb-2">
          Instruções exibidas para os videomakers ao emitir nota fiscal (ex: tipo de serviço, código de atividade).
        </p>
        <textarea
          value={form.observacoesNF}
          onChange={e => setForm(prev => ({ ...prev, observacoesNF: e.target.value }))}
          placeholder="Ex: Emitir NF como Serviços de Produção Audiovisual (código 12.01). Enviar após entrega dos brutos."
          rows={3}
          className={inp + " resize-none"}
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={salvar}
          disabled={saving}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Salvar Dados da Empresa
        </button>
      </div>
    </div>
  )
}

// ─── Google Drive ─────────────────────────────────────────────────────────────

function TabGoogleDrive() {
  const { data, mutate } = useSWR("/api/config/empresa", fetcher)
  const empresa = data?.empresa

  const [folderInput, setFolderInput] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ processados: number; erros: number } | null>(null)
  if (empresa && !loaded) {
    // Mostrar URL completa da pasta se tiver ID salvo
    setFolderInput(
      empresa.googleDriveFolderId
        ? `https://drive.google.com/drive/folders/${empresa.googleDriveFolderId}`
        : ""
    )
    setLoaded(true)
  }

  /** Extrai o folder ID de uma URL do Drive ou retorna o valor direto (se já for ID) */
  function extrairFolderId(input: string): string {
    const trimmed = input.trim()
    const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/)
    if (match) return match[1]
    // Se não for URL, assume que é ID direto
    if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed)) return trimmed
    return trimmed
  }

  const salvarPasta = async () => {
    const folderId = extrairFolderId(folderInput)
    setSaving(true)
    try {
      await fetch("/api/config/empresa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleDriveFolderId: folderId || null }),
      })
      toast.success("Pasta do Drive salva!")
      mutate()
    } catch {
      toast.error("Erro ao salvar pasta")
    } finally { setSaving(false) }
  }

  const folderId = empresa?.googleDriveFolderId

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-zinc-200 flex items-center gap-2 mb-1">
          <HardDrive className="w-4 h-4 text-blue-400" /> Google Drive
        </h3>
        <p className="text-xs text-zinc-500">
          Conecte sua conta Google e configure a pasta onde os vídeos finais serão salvos.
          Após configurado, os uploads vão direto para o Drive sem limite de tamanho.
        </p>
      </div>

      {/* Status da conexão */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-semibold text-zinc-300">🔗 Conta Google</h4>

        {empresa?.googleDriveEmail ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-2 bg-emerald-900/50 text-emerald-400 border border-emerald-700/50 rounded-full px-4 py-2 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Conectado como {empresa.googleDriveEmail}
              </span>
            </div>
            {empresa.googleDriveConnectedAt && (
              <p className="text-xs text-zinc-600">
                Conectado em{" "}
                {new Date(empresa.googleDriveConnectedAt).toLocaleDateString("pt-BR", {
                  day: "2-digit", month: "long", year: "numeric",
                })}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href="/api/auth/setup-drive"
                className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reconectar / Trocar conta
              </a>
              <button
                onClick={async () => {
                  setTesting(true)
                  setTestResult(null)
                  try {
                    const res = await fetch("/api/auth/setup-drive/test")
                    const json = await res.json()
                    if (res.ok && json.ok) {
                      setTestResult({ ok: true, msg: `✅ Conexão OK! Arquivo de teste criado: ${json.fileName}` })
                    } else {
                      setTestResult({ ok: false, msg: `❌ Erro: ${json.error ?? "Falha no teste"}` })
                    }
                  } catch {
                    setTestResult({ ok: false, msg: "❌ Erro de rede ao testar conexão" })
                  } finally {
                    setTesting(false)
                  }
                }}
                disabled={testing}
                className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Testar conexão
              </button>
            </div>
            {testResult && (
              <p className={`text-xs px-3 py-2 rounded-lg border ${testResult.ok ? "bg-emerald-900/30 border-emerald-700/40 text-emerald-400" : "bg-red-900/30 border-red-700/40 text-red-400"}`}>
                {testResult.msg}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Nenhuma conta conectada.</p>
            <a
              href="/api/auth/setup-drive"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              <HardDrive className="w-4 h-4" /> Conectar Google Drive
            </a>
            <p className="text-xs text-zinc-600">
              Você será redirecionado para o Google para autorizar o acesso.
              Apenas leitura e escrita de arquivos — sem acesso a outros dados.
            </p>
          </div>
        )}
      </div>

      {/* Pasta de destino */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-semibold text-zinc-300">📂 Pasta de Destino dos Vídeos</h4>
        <p className="text-xs text-zinc-500">
          Cole o link da pasta do Google Drive onde os vídeos finais serão salvos.
          A pasta deve ser compartilhada com a conta conectada acima.
        </p>

        {folderId && (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Pasta configurada:</span>
            <a
              href={`https://drive.google.com/drive/folders/${folderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-emerald-300 font-mono truncate max-w-[200px]"
              title={folderId}
            >
              {folderId.slice(0, 20)}…
            </a>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="url"
            value={folderInput}
            onChange={e => setFolderInput(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/1abc_ID_da_pasta"
            className="flex-1 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-zinc-800 text-zinc-200 placeholder-zinc-500"
          />
          <button
            onClick={salvarPasta}
            disabled={saving || !folderInput.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Salvar Pasta
          </button>
        </div>
        <p className="text-xs text-zinc-600">
          💡 Dica: abra a pasta no Drive, copie a URL completa da barra de endereço e cole aqui.
          O ID será extraído automaticamente.
        </p>
      </div>

      {/* Status geral */}
      {empresa?.googleDriveEmail && folderId ? (
        <div className="flex items-start gap-3 bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-400">Google Drive pronto para uso!</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Uploads de vídeos finais serão salvos automaticamente na pasta configurada.
              Sem limite de 50 MB.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-zinc-800/30 border border-zinc-700/30 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-zinc-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-zinc-400">
              {!empresa?.googleDriveEmail && !folderId
                ? "Conecte sua conta Google e configure a pasta para ativar os uploads via Drive."
                : !empresa?.googleDriveEmail
                ? "Falta conectar a conta Google."
                : "Falta configurar a pasta de destino."}
            </p>
          </div>
        </div>
      )}

      {/* Sincronização em lote de vídeos existentes */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Upload className="w-4 h-4 text-purple-400" /> Sincronizar Vídeos Existentes com Drive
          </h4>
          <p className="text-xs text-zinc-500 mt-1">
            Envia todos os vídeos finalizados (no Supabase) para o Google Drive em lote.
            O link da galeria permanece no Supabase — Drive é cópia de entrega.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={async () => {
              setSyncing(true)
              setSyncResult(null)
              try {
                const res = await fetch("/api/admin/sync-drive", { method: "POST" })
                const json = await res.json()
                if (!res.ok) throw new Error(json.error ?? "Erro ao sincronizar")
                setSyncResult({ processados: json.processados, erros: json.erros })
                toast.success(`✅ Sync concluído: ${json.processados} vídeo(s) enviado(s) ao Drive!`)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Erro ao sincronizar")
              } finally {
                setSyncing(false)
              }
            }}
            disabled={syncing}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {syncing ? "Sincronizando…" : "📤 Sincronizar com Drive"}
          </button>
          {syncResult && (
            <span className={`text-xs px-3 py-1.5 rounded-lg border ${syncResult.erros === 0 ? "bg-emerald-900/30 border-emerald-700/40 text-emerald-400" : "bg-amber-900/30 border-amber-700/40 text-amber-400"}`}>
              {syncResult.processados} enviado(s){syncResult.erros > 0 ? ` · ${syncResult.erros} erro(s)` : ""}
            </span>
          )}
        </div>
        {syncing && (
          <p className="text-xs text-zinc-500 animate-pulse">
            Processando vídeos… pode demorar alguns minutos para arquivos grandes.
          </p>
        )}
      </div>

    </div>
  )
}

// ─── Depoimentos ────────────────────────────────────────────────────────────

interface DepoimentoAdmin {
  id: string
  nome: string
  cidade: string | null
  videoUrl: string
  thumbnailUrl: string | null
  descricao: string | null
  ativo: boolean
  ordem: number
}

function TabDepoimentos() {
  const { data, mutate } = useSWR<{ depoimentos: DepoimentoAdmin[] }>("/api/admin/depoimentos", fetcher)
  const depoimentos = data?.depoimentos ?? []

  // Form state
  const [nome, setNome] = useState("")
  const [cidade, setCidade] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [thumbnailUrl, setThumbnailUrl] = useState("")
  const [descricao, setDescricao] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Partial<DepoimentoAdmin>>({})
  const [editSaving, setEditSaving] = useState(false)

  // Captura o primeiro frame do vídeo como JPEG via Canvas
  async function captureThumb(file: File): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = document.createElement("video")
      const url = URL.createObjectURL(file)
      video.muted = true
      video.playsInline = true
      video.preload = "metadata"
      video.src = url
      const cleanup = () => URL.revokeObjectURL(url)
      video.onerror = () => { cleanup(); resolve(null) }
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, (video.duration || 2) * 0.1)
      }
      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas")
          canvas.width = video.videoWidth || 360
          canvas.height = video.videoHeight || 640
          canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
          canvas.toBlob((blob) => { cleanup(); resolve(blob) }, "image/jpeg", 0.8)
        } catch { cleanup(); resolve(null) }
      }
    })
  }

  async function uploadVideo(file: File) {
    setUploading(true)
    setUploadProgress(0)
    try {
      // 1. Capturar thumbnail antes de subir o vídeo
      const thumbBlob = await captureThumb(file)
      if (thumbBlob) {
        const thumbRes = await fetch("/api/admin/depoimentos/upload-url?contentType=image%2Fjpeg")
        if (thumbRes.ok) {
          const { uploadUrl: thumbUploadUrl, publicUrl: thumbPublicUrl } = await thumbRes.json()
          await fetch(thumbUploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: thumbBlob,
          })
          setThumbnailUrl(thumbPublicUrl)
        }
      }

      // 2. Upload do vídeo
      const urlRes = await fetch(`/api/admin/depoimentos/upload-url?contentType=${encodeURIComponent(file.type || "video/mp4")}`)
      if (!urlRes.ok) {
        const errData = await urlRes.json().catch(() => ({ error: `HTTP ${urlRes.status}` }))
        throw new Error(errData.error ?? "Erro ao gerar URL de upload")
      }
      const { uploadUrl, publicUrl } = await urlRes.json()

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)))
        xhr.onerror = () => reject(new Error("Falha na conexão"))
        xhr.open("PUT", uploadUrl)
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4")
        xhr.send(file)
      })

      setVideoUrl(publicUrl)
      toast.success("Vídeo enviado!")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao fazer upload")
    } finally {
      setUploading(false)
    }
  }

  async function salvar() {
    if (!nome.trim() || !videoUrl.trim()) { toast.error("Nome e URL do vídeo são obrigatórios"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/depoimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), cidade: cidade.trim(), videoUrl: videoUrl.trim(), thumbnailUrl: thumbnailUrl.trim() || undefined, descricao: descricao.trim() }),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? "Erro") }
      toast.success("Depoimento adicionado!")
      setNome(""); setCidade(""); setVideoUrl(""); setThumbnailUrl(""); setDescricao("")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo(dep: DepoimentoAdmin) {
    await fetch(`/api/admin/depoimentos/${dep.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !dep.ativo }),
    })
    mutate()
  }

  async function moverOrdem(dep: DepoimentoAdmin, dir: "up" | "down") {
    const sorted = [...depoimentos].sort((a, b) => a.ordem - b.ordem)
    const idx = sorted.findIndex(d => d.id === dep.id)
    const swapIdx = dir === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const other = sorted[swapIdx]
    await Promise.all([
      fetch(`/api/admin/depoimentos/${dep.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordem: other.ordem }) }),
      fetch(`/api/admin/depoimentos/${other.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordem: dep.ordem }) }),
    ])
    mutate()
  }

  async function deletar(id: string) {
    if (!confirm("Excluir este depoimento?")) return
    await fetch(`/api/admin/depoimentos/${id}`, { method: "DELETE" })
    toast.success("Excluído!")
    mutate()
  }

  async function salvarEdit(id: string) {
    setEditSaving(true)
    try {
      await fetch(`/api/admin/depoimentos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFields),
      })
      toast.success("Salvo!")
      setEditingId(null)
      setEditFields({})
      mutate()
    } catch {
      toast.error("Erro ao salvar")
    } finally {
      setEditSaving(false)
    }
  }

  const inpClass = "w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-500 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500"

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2 mb-1">
          <Video className="w-4 h-4 text-amber-400" />
          Depoimentos de Videomakers
        </h3>
        <p className="text-sm text-zinc-400">Gerencie os vídeos que aparecem na seção de depoimentos do site público.</p>
      </div>

      {/* Formulário: Novo */}
      <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl p-5 space-y-4">
        <p className="text-sm font-semibold text-zinc-300">Adicionar Depoimento</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Nome do videomaker *</label>
            <input className={inpClass} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: João Silva" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Cidade</label>
            <input className={inpClass} value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Ex: Belo Horizonte / MG" />
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Vídeo (URL ou upload direto) *</label>
          <div className="flex gap-2">
            <input
              className={inpClass}
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/... ou https://drive.google.com/..."
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-none flex items-center gap-1.5 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded-lg text-sm text-zinc-300 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? `${uploadProgress}%` : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadVideo(f) }}
            />
          </div>
          {uploading && (
            <div className="mt-2 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Frase / depoimento curto (opcional)</label>
          <input className={inpClass} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: A Contourline me deu visibilidade e pagamento em dia!" />
        </div>
        <button
          onClick={salvar}
          disabled={saving || !nome.trim() || !videoUrl.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-sm transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Salvar Depoimento
        </button>
      </div>

      {/* Lista */}
      <div>
        <p className="text-sm font-semibold text-zinc-300 mb-3">
          Depoimentos cadastrados ({depoimentos.length})
        </p>
        {depoimentos.length === 0 ? (
          <div className="text-center py-10 text-zinc-500 text-sm">Nenhum depoimento ainda.</div>
        ) : (
          <div className="space-y-3">
            {[...depoimentos].sort((a, b) => a.ordem - b.ordem).map((dep) => (
              <div key={dep.id} className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4">
                {editingId === dep.id ? (
                  /* Modo edição inline */
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input className={inpClass} value={editFields.nome ?? dep.nome} onChange={e => setEditFields(p => ({ ...p, nome: e.target.value }))} placeholder="Nome" />
                      <input className={inpClass} value={editFields.cidade ?? dep.cidade ?? ""} onChange={e => setEditFields(p => ({ ...p, cidade: e.target.value }))} placeholder="Cidade" />
                    </div>
                    <input className={inpClass} value={editFields.videoUrl ?? dep.videoUrl} onChange={e => setEditFields(p => ({ ...p, videoUrl: e.target.value }))} placeholder="URL do vídeo" />
                    <input className={inpClass} value={editFields.descricao ?? dep.descricao ?? ""} onChange={e => setEditFields(p => ({ ...p, descricao: e.target.value }))} placeholder="Frase/depoimento" />
                    <div className="flex gap-2">
                      <button onClick={() => salvarEdit(dep.id)} disabled={editSaving} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs transition-colors">
                        {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Salvar
                      </button>
                      <button onClick={() => { setEditingId(null); setEditFields({}) }} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-xs transition-colors">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  /* Modo visualização */
                  <div className="flex items-center gap-3">
                    {/* Thumb */}
                    <div className="w-10 h-16 rounded-lg bg-zinc-700 overflow-hidden flex-none flex items-center justify-center" style={{ aspectRatio: "9/16" }}>
                      {dep.thumbnailUrl ? (
                        <img src={dep.thumbnailUrl} alt={dep.nome} className="w-full h-full object-cover" />
                      ) : (
                        <Play className="w-4 h-4 text-zinc-500" />
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-200">{dep.nome}</p>
                      {dep.cidade && <p className="text-xs text-zinc-500">{dep.cidade}</p>}
                      {dep.descricao && <p className="text-xs text-zinc-400 italic truncate">"{dep.descricao}"</p>}
                    </div>
                    {/* Status */}
                    <button
                      onClick={() => toggleAtivo(dep)}
                      className={`flex-none text-xs px-2 py-1 rounded-full font-medium transition-colors ${dep.ativo ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-zinc-700 text-zinc-500 hover:bg-zinc-600"}`}
                    >
                      {dep.ativo ? "● ativo" : "inativo"}
                    </button>
                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-none">
                      <button onClick={() => moverOrdem(dep, "up")} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors" title="Mover para cima">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => moverOrdem(dep, "down")} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors" title="Mover para baixo">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { setEditingId(dep.id); setEditFields({}) }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deletar(dep.id)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-zinc-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Componente interno que usa useSearchParams — deve ficar dentro de <Suspense> */
function DriveCallbackHandler({ onSetTab }: { onSetTab: (tab: Tab) => void }) {
  const searchParams = useSearchParams()
  useEffect(() => {
    const driveStatus = searchParams?.get("drive")
    const driveEmail = searchParams?.get("email")
    const tabParam = searchParams?.get("tab")
    if (tabParam === "empresa") onSetTab("empresa")
    if (tabParam === "drive") onSetTab("drive")
    if (driveStatus === "conectado" && driveEmail) {
      toast.success(`Google Drive conectado como ${driveEmail}!`)
    } else if (driveStatus === "recusado") {
      toast.error("Autorização recusada. Tente novamente.")
    } else if (driveStatus && driveStatus.startsWith("erro")) {
      toast.error("Falha ao conectar Google Drive. Verifique as credenciais.")
    } else if (driveStatus === "sem_credenciais") {
      toast.error("GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não configurados.")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export default function ConfiguracoesPage() {
  const { data: session } = useSession()
  const [tab, setTab] = useState<Tab>("usuarios")

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "usuarios", label: "Usuários", icon: Users },
    { id: "meu_perfil", label: "Meu Perfil", icon: Settings },
    { id: "empresa", label: "Dados da Empresa", icon: Building2 },
    { id: "drive", label: "Google Drive", icon: HardDrive },
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    { id: "email", label: "E-mail", icon: Mail },
    { id: "parametros", label: "Parâmetros", icon: SlidersHorizontal },
    { id: "depoimentos", label: "Depoimentos", icon: Video },
  ]

  if (!["admin", "gestor"].includes(session?.user?.tipo ?? "")) {
    return (
      <>
        <Header title="Configurações" />
        <main className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center text-zinc-400">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-zinc-500">Acesso restrito</p>
            <p className="text-sm mt-1">Somente administradores e gestores podem acessar as configurações.</p>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Header title="Configurações" />
      {/* Handler do callback OAuth2 do Google Drive (sem renderização visual) */}
      <Suspense fallback={null}>
        <DriveCallbackHandler onSetTab={setTab} />
      </Suspense>
      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto flex gap-6">
          {/* Sidebar Nav */}
          <nav className="w-48 shrink-0">
            <div className="sticky top-6 space-y-0.5">
              {tabs.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg transition-colors text-left",
                      tab === t.id
                        ? "bg-zinc-800 text-white font-medium"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              {tab === "usuarios" && <TabUsuarios />}
              {tab === "meu_perfil" && <TabMeuPerfil />}
              {tab === "whatsapp" && (
                <div className="space-y-8">
                  <TabWhatsapp />
                  <div className="border-t border-zinc-800 pt-6">
                    <p className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                      <QrCode className="h-4 w-4 text-zinc-500" />
                      Conectar / Reconectar WhatsApp
                    </p>
                    <TabWhatsappQR />
                  </div>
                </div>
              )}
              {tab === "email" && <TabEmail />}
              {tab === "parametros" && <TabParametros />}
              {tab === "empresa" && <TabEmpresa />}
              {tab === "drive" && <TabGoogleDrive />}
              {tab === "depoimentos" && <TabDepoimentos />}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

const inp = "w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-500 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500"
