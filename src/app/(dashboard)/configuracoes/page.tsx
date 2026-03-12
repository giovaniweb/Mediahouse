"use client"

import { useState } from "react"
import { Header } from "@/components/layout/Header"
import { Users, MessageCircle, Trello, Plus, Trash2, CheckCircle2, XCircle, RefreshCw, Shield } from "lucide-react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { useSession } from "next-auth/react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Tab = "usuarios" | "whatsapp" | "trello"

const TIPO_OPTS = ["admin", "gestor", "operacao", "solicitante", "editor", "social"]
const TIPO_LABEL: Record<string, string> = {
  admin: "Admin", gestor: "Gestor", operacao: "Operação",
  solicitante: "Solicitante", editor: "Editor", videomaker: "Videomaker", social: "Social Media",
}

// ─── Usuários ────────────────────────────────────────────────────────────────

function TabUsuarios() {
  const { data, mutate } = useSWR<{ usuarios: Array<{
    id: string; nome: string; email: string; telefone?: string;
    tipo: string; status: string; createdAt: string
  }> }>("/api/usuarios", fetcher)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: "", email: "", senha: "", tipo: "operacao", telefone: "" })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  function flash(type: "ok" | "err", text: string) {
    setMsg({ type, text }); setTimeout(() => setMsg(null), 4000)
  }

  async function criarUsuario() {
    setLoading(true)
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      flash("ok", "Usuário criado!"); setShowForm(false)
      setForm({ nome: "", email: "", senha: "", tipo: "operacao", telefone: "" })
      mutate()
    } catch (e: unknown) {
      flash("err", e instanceof Error ? e.message : "Erro")
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

  const usuarios = data?.usuarios ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{usuarios.length} usuário(s) cadastrado(s)</p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 bg-zinc-900 text-white text-xs px-3 py-2 rounded-lg hover:bg-zinc-700"
        >
          <Plus className="w-3.5 h-3.5" /> Novo Usuário
        </button>
      </div>

      {msg && (
        <div className={cn("text-sm px-3 py-2 rounded-lg", msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
          {msg.text}
        </div>
      )}

      {showForm && (
        <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50 space-y-3">
          <p className="text-sm font-semibold text-zinc-700">Novo Usuário</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500">Nome *</label>
              <input className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-zinc-500">E-mail *</label>
              <input className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm mt-1" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Senha *</label>
              <input className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm mt-1" type="password" value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Tipo *</label>
              <select className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                {TIPO_OPTS.map(t => <option key={t} value={t}>{TIPO_LABEL[t] ?? t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-zinc-500">Telefone</label>
              <input className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm mt-1" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="+55 11 99999-9999" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={criarUsuario} disabled={loading} className="bg-zinc-900 text-white text-xs px-4 py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-50">
              {loading ? "Criando..." : "Criar"}
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs px-4 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-100">Cancelar</button>
          </div>
        </div>
      )}

      <div className="border border-zinc-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">NOME</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">E-MAIL</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">TIPO</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">STATUS</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {usuarios.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 font-medium text-zinc-800">{u.nome}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full capitalize">
                    {TIPO_LABEL[u.tipo] ?? u.tipo}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                    u.status === "ativo" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                  )}>
                    {u.status === "ativo" ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggleStatus(u.id, u.status)}
                    className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                    title={u.status === "ativo" ? "Desativar" : "Reativar"}
                  >
                    {u.status === "ativo" ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </button>
                </td>
              </tr>
            ))}
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

  async function salvar() {
    setLoading(true)
    try {
      const res = await fetch("/api/configuracoes/whatsapp", {
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

  async function testarConexao() {
    setLoading(true)
    try {
      const res = await fetch("/api/configuracoes/whatsapp/teste", { method: "POST" })
      const json = await res.json()
      if (json.ok) setMsg({ type: "ok", text: "Conexão OK! " + (json.status ?? "") })
      else setMsg({ type: "err", text: "Falha: " + (json.error ?? "Erro desconhecido") })
    } catch {
      setMsg({ type: "err", text: "Erro ao testar conexão" })
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
        <MessageCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
        <div className="text-sm text-green-700">
          <p className="font-semibold">Evolution API (WhatsApp)</p>
          <p className="text-xs mt-1">Configure sua instância para enviar notificações automáticas, receber comandos via WhatsApp e atualizar status de demandas.</p>
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
          <label className="text-xs font-medium text-zinc-500 block mb-1">URL da Instância *</label>
          <input
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
            value={form.instanceUrl}
            onChange={e => setForm(f => ({ ...f, instanceUrl: e.target.value }))}
            placeholder="https://sua-evolution-api.com"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">API Key *</label>
          <input
            type="password"
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
            value={form.apiKey}
            onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
            placeholder="••••••••••••"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">Instance ID *</label>
          <input
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
            value={form.instanceId}
            onChange={e => setForm(f => ({ ...f, instanceId: e.target.value }))}
            placeholder="videoops-instance"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={salvar} disabled={loading} className="flex items-center gap-1.5 bg-zinc-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-50">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
          Salvar
        </button>
        <button onClick={testarConexao} disabled={loading} className="flex items-center gap-1.5 border border-zinc-200 text-sm px-4 py-2 rounded-lg hover:bg-zinc-50 disabled:opacity-50">
          <RefreshCw className="w-4 h-4" /> Testar Conexão
        </button>
      </div>

      <div className="border-t border-zinc-100 pt-4">
        <p className="text-xs font-semibold text-zinc-500 mb-2">Notificações automáticas configuradas:</p>
        <ul className="space-y-1 text-xs text-zinc-500">
          {[
            "Nova demanda urgente — notifica gestores",
            "Videomaker notificado — aguarda confirmação",
            "Captação agendada — lembrete 24h antes",
            "Edição finalizada — notifica solicitante",
            "Demanda aprovada — notifica solicitante",
            "Aprovação de vídeo pendente — link enviado ao cliente",
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
          <p className="text-xs mt-1">Sincronize automaticamente as demandas com seu quadro do Trello. As mudanças de status no VideoOps atualizam os cartões do Trello em tempo real.</p>
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
          <div className="flex gap-1 mb-6 bg-zinc-100 rounded-xl p-1 w-fit">
            {tabs.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    tab === t.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* Content */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6">
            {tab === "usuarios" && <TabUsuarios />}
            {tab === "whatsapp" && <TabWhatsapp />}
            {tab === "trello" && <TabTrello />}
          </div>
        </div>
      </main>
    </>
  )
}
