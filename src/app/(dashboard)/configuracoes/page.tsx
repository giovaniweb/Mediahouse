"use client"

import { useState, useRef, useCallback } from "react"
import { Header } from "@/components/layout/Header"
import { Users, MessageCircle, Trello, Plus, Trash2, CheckCircle2, XCircle, RefreshCw, Shield, Mail, SlidersHorizontal, QrCode, Send, Pencil, KeyRound, Eye, EyeOff, AlertCircle, Settings, Upload, FileJson, Loader2 } from "lucide-react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { useSession } from "next-auth/react"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Tab = "usuarios" | "whatsapp" | "trello" | "email" | "parametros"

const TIPO_OPTS = ["gestor", "operacao"]
const TIPO_LABEL: Record<string, string> = {
  admin: "Admin", gestor: "Gestor", operacao: "Operação",
  videomaker: "Videomaker", editor: "Editor",
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
  const [resetTarget, setResetTarget] = useState<{ id: string; nome: string; email: string } | null>(null)

  async function criarUsuario() {
    setLoading(true)
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Usuário criado!")
      setShowForm(false)
      setForm({ nome: "", email: "", senha: "", tipo: "operacao", telefone: "" })
      mutate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar usuário")
    } finally { setLoading(false) }
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
          <div className="flex gap-2">
            <button onClick={criarUsuario} disabled={loading} className="bg-white text-zinc-900 text-xs px-4 py-2 rounded-lg hover:bg-zinc-100 font-semibold disabled:opacity-50">
              {loading ? "Criando..." : "Criar"}
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancelar</button>
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

// ─── Trello ───────────────────────────────────────────────────────────────────

function TabTrello() {
  const { data, mutate } = useSWR<{ config: { apiKey: string; token: string; boardId: string; ativo: boolean } | null }>(
    "/api/configuracoes/trello", fetcher
  )
  const cfg = data?.config
  const [form, setForm] = useState({ apiKey: cfg?.apiKey ?? "", token: cfg?.token ?? "", boardId: cfg?.boardId ?? "" })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  async function salvar() {
    setLoading(true)
    try {
      const res = await fetch("/api/configuracoes/trello", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setMsg({ type: "ok", text: "Configuração salva!" })
      mutate()
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Erro" })
    } finally { setLoading(false) }
  }

  async function sincronizar() {
    setLoading(true)
    try {
      const res = await fetch("/api/configuracoes/trello/sync", { method: "POST" })
      const json = await res.json()
      if (json.ok) setMsg({ type: "ok", text: `Sincronizado! ${json.count ?? 0} cartão(ões) atualizados.` })
      else setMsg({ type: "err", text: json.error ?? "Erro" })
    } catch {
      setMsg({ type: "err", text: "Erro ao sincronizar" })
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Trello className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-semibold">Trello Integration</p>
          <p className="text-xs mt-1">Sincronize automaticamente as demandas com seu quadro do Trello. As mudanças de status no NuFlow atualizam os cartões do Trello em tempo real.</p>
        </div>
      </div>

      {msg && (
        <div className={cn("text-sm px-3 py-2 rounded-lg", msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
          {msg.text}
        </div>
      )}

      {cfg?.ativo && (
        <div className="flex items-center gap-2 text-xs font-medium text-green-600">
          <CheckCircle2 className="w-4 h-4" /> Integração ativa
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">API Key *</label>
          <input
            type="password"
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
            value={form.apiKey}
            onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
            placeholder="Trello API Key"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">Token *</label>
          <input
            type="password"
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
            value={form.token}
            onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
            placeholder="Trello Token"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">Board ID *</label>
          <input
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
            value={form.boardId}
            onChange={e => setForm(f => ({ ...f, boardId: e.target.value }))}
            placeholder="abc12345"
          />
          <p className="text-[11px] text-zinc-400 mt-1">Encontre no URL do seu quadro: trello.com/b/<strong>BOARD_ID</strong>/nome</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={salvar} disabled={loading} className="bg-zinc-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-50">Salvar</button>
        {cfg?.ativo && (
          <button onClick={sincronizar} disabled={loading} className="flex items-center gap-1.5 border border-zinc-200 text-sm px-4 py-2 rounded-lg hover:bg-zinc-50 disabled:opacity-50">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Sincronizar Agora
          </button>
        )}
      </div>

      <div className="border-t border-zinc-100 pt-4">
        <p className="text-xs font-semibold text-zinc-500 mb-2">Mapeamento de colunas (StatusVisível → Lista Trello):</p>
        <div className="grid grid-cols-2 gap-1 text-xs text-zinc-500">
          {[
            ["Entrada", "📥 Entrada"],
            ["Produção", "🎬 Em Produção"],
            ["Edição", "✂️ Edição"],
            ["Aprovação", "✅ Aprovação"],
            ["Para Postar", "📤 Para Postar"],
            ["Finalizado", "🏁 Finalizado"],
          ].map(([a, b]) => (
            <div key={a} className="flex items-center gap-1">
              <span className="font-medium text-zinc-600">{a}</span>
              <span className="text-zinc-300">→</span>
              <span>{b}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Import JSON Section ──────────────────────────────────── */}
      <TrelloJsonImport />
    </div>
  )
}

// ─── Trello JSON File Import ─────────────────────────────────────────────────

interface TrelloLabel {
  name?: string
  color?: string
}

interface TrelloCard {
  id: string
  name: string
  desc?: string
  idList: string
  labels?: TrelloLabel[]
  due?: string | null
}

interface TrelloList {
  id: string
  name: string
}

interface ListPreview {
  listName: string
  mappedStatus: string
  cardCount: number
}

const STATUS_LABEL: Record<string, string> = {
  entrada: "Entrada",
  producao: "Produção",
  edicao: "Edição",
  aprovacao: "Aprovação",
  para_postar: "Para Postar",
  finalizado: "Finalizado",
}

const LIST_KEYWORDS_CLIENT: Array<{ keywords: string[]; status: string }> = [
  { keywords: ["entrada", "inbox", "backlog", "novo", "novas", "new"], status: "entrada" },
  { keywords: ["produção", "producao", "doing", "andamento", "em progresso", "in progress"], status: "producao" },
  { keywords: ["edição", "edicao", "edit", "editing"], status: "edicao" },
  { keywords: ["revisão", "revisao", "review", "aprovação", "aprovacao", "approv"], status: "aprovacao" },
  { keywords: ["para postar", "post", "publicar", "agendar", "schedule"], status: "para_postar" },
  { keywords: ["entregue", "done", "concluído", "concluido", "finalizado", "finished", "complete"], status: "finalizado" },
]

function resolveStatusClient(listName: string): string {
  const lower = listName.toLowerCase().trim()
  for (const rule of LIST_KEYWORDS_CLIENT) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) return rule.status
    }
  }
  return "entrada"
}

interface ImportResult {
  ok: boolean
  imported: number
  skipped: number
  total: number
  errors: string[]
  details: Array<{ card: string; status: "imported" | "skipped" | "error"; info?: string }>
}

function TrelloJsonImport() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [trelloData, setTrelloData] = useState<{ lists: TrelloList[]; cards: TrelloCard[] } | null>(null)
  const [preview, setPreview] = useState<ListPreview[] | null>(null)
  const [totalCards, setTotalCards] = useState(0)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const processFile = useCallback((file: File) => {
    setResult(null)
    setParseError(null)
    setPreview(null)
    setTrelloData(null)
    setFileName(file.name)

    if (!file.name.endsWith(".json")) {
      setParseError("O arquivo precisa ser .json")
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string)

        if (!Array.isArray(json.lists) || !Array.isArray(json.cards)) {
          setParseError("Arquivo JSON inválido. Deve conter 'lists' e 'cards' (export do Trello).")
          return
        }

        const lists: TrelloList[] = json.lists
        const cards: TrelloCard[] = json.cards

        // Build preview: group cards by list
        const listMap = new Map<string, string>(lists.map((l) => [l.id, l.name]))
        const countByList = new Map<string, number>()
        for (const card of cards) {
          const listId = card.idList
          countByList.set(listId, (countByList.get(listId) ?? 0) + 1)
        }

        const previewData: ListPreview[] = lists
          .filter((l) => (countByList.get(l.id) ?? 0) > 0)
          .map((l) => ({
            listName: l.name,
            mappedStatus: resolveStatusClient(l.name),
            cardCount: countByList.get(l.id) ?? 0,
          }))

        setTrelloData({ lists, cards })
        setPreview(previewData)
        setTotalCards(cards.length)
      } catch {
        setParseError("Erro ao ler o JSON. Verifique se o arquivo é um export válido do Trello.")
      }
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  async function importar() {
    if (!trelloData) return
    setImporting(true)
    setProgress("Enviando dados...")
    setResult(null)

    try {
      const res = await fetch("/api/configuracoes/trello/import-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trelloData),
      })

      const json: ImportResult = await res.json()

      if (!res.ok) {
        setParseError(json.errors?.[0] ?? "Erro ao importar")
        return
      }

      setResult(json)
      setProgress(null)
      toast.success(`${json.imported} card(s) importado(s)!`)
    } catch {
      setParseError("Erro de conexão ao importar")
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  function resetAll() {
    setFileName(null)
    setTrelloData(null)
    setPreview(null)
    setTotalCards(0)
    setResult(null)
    setParseError(null)
    setProgress(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="border-t border-zinc-800 pt-6 mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <FileJson className="w-5 h-5 text-emerald-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Importar do Trello (JSON)</h3>
      </div>

      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 text-xs text-zinc-400 space-y-1">
        <p className="font-medium text-zinc-300">Como exportar do Trello:</p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Abra seu board no Trello</li>
          <li>Clique no menu <span className="text-zinc-300 font-medium">(... Mostrar menu)</span></li>
          <li>Clique em <span className="text-zinc-300 font-medium">Mais</span> → <span className="text-zinc-300 font-medium">Imprimir e exportar</span></li>
          <li>Selecione <span className="text-zinc-300 font-medium">Exportar como JSON</span></li>
          <li>Faça upload do arquivo abaixo</li>
        </ol>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors",
          dragOver
            ? "border-emerald-500 bg-emerald-500/10"
            : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"
        )}
      >
        <Upload className={cn("w-8 h-8", dragOver ? "text-emerald-400" : "text-zinc-500")} />
        {fileName ? (
          <div className="text-center">
            <p className="text-sm text-zinc-200 font-medium">{fileName}</p>
            <p className="text-xs text-zinc-500 mt-1">Clique para trocar o arquivo</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-zinc-300">Arraste o arquivo JSON aqui</p>
            <p className="text-xs text-zinc-500 mt-1">ou clique para selecionar</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="bg-red-500/10 border border-red-800 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{parseError}</p>
        </div>
      )}

      {/* Preview table */}
      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Preview — {totalCards} card(s) encontrado(s)
          </p>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Lista do Trello</th>
                  <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Status no NuFlow</th>
                  <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Cards</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                    <td className="px-4 py-2 text-zinc-300">{row.listName}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[11px]">
                        {STATUS_LABEL[row.mappedStatus] ?? row.mappedStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-400 font-mono">{row.cardCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Import button */}
          {!result && (
            <div className="flex items-center gap-3">
              <button
                onClick={importar}
                disabled={importing}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Importar {totalCards} card(s)
                  </>
                )}
              </button>
              <button
                onClick={resetAll}
                disabled={importing}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              {progress}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-zinc-200">Resultado da importação</p>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-500/10 border border-emerald-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{result.imported}</p>
                <p className="text-[11px] text-emerald-500 mt-0.5">Importados</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-400">{result.skipped}</p>
                <p className="text-[11px] text-amber-500 mt-0.5">Já existentes</p>
              </div>
              <div className="bg-red-500/10 border border-red-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">{result.errors.length}</p>
                <p className="text-[11px] text-red-500 mt-0.5">Erros</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-red-500/5 border border-red-900 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-400 mb-1">Erros:</p>
                <ul className="text-xs text-red-300 space-y-0.5">
                  {result.errors.map((err, i) => (
                    <li key={i} className="truncate">• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.details.length > 0 && (
              <details className="group">
                <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
                  Ver detalhes ({result.details.length} itens)
                </summary>
                <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5">
                  {result.details.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      {d.status === "imported" && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                      {d.status === "skipped" && <XCircle className="w-3 h-3 text-amber-400 shrink-0" />}
                      {d.status === "error" && <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />}
                      <span className="text-zinc-300 truncate flex-1">{d.card}</span>
                      {d.info && <span className="text-zinc-600 text-[11px] shrink-0">{d.info}</span>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          <button
            onClick={resetAll}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Importar outro arquivo
          </button>
        </div>
      )}
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

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const { data: session } = useSession()
  const [tab, setTab] = useState<Tab>("usuarios")

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "usuarios", label: "Usuários", icon: Users },
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    { id: "email", label: "E-mail", icon: Mail },
    { id: "parametros", label: "Parâmetros", icon: SlidersHorizontal },
    { id: "trello", label: "Trello", icon: Trello },
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
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-0 mb-6 border-b border-zinc-800">
            {tabs.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px",
                    tab === t.id ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* Content */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            {tab === "usuarios" && <TabUsuarios />}
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
            {tab === "trello" && <TabTrello />}
          </div>
        </div>
      </main>
    </>
  )
}

const inp = "w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-500 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500"
