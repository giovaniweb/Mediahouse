"use client"

// Painel da plataforma: criar empresa, ligar/desligar, gerir quem entra.
//
// A tela existe porque as APIs já existiam e não tinham porta: `superAdmin`,
// `requireSuperAdmin` e os endpoints de organização estavam prontos desde a
// Fase 1 do SaaS, e mesmo assim criar uma empresa exigia rodar `ts-node` na
// máquina de alguém. Isso fazia de cada cliente novo uma tarefa de engenharia.
import { useState } from "react"
import useSWR from "swr"
import { Building2, Plus, Power, UserPlus, X, Users, ToggleLeft } from "lucide-react"
import { toast } from "sonner"
import { fetcher } from "@/lib/fetcher"
import { erroDaResposta, mensagemDeErro } from "@/lib/erro-cliente"

type Org = {
  id: string
  nome: string
  slug: string
  ativo: boolean
  createdAt: string
  _count: { membros: number }
}
type Membro = {
  id: string
  papel: string
  usuario: { id: string; nome: string; email: string | null }
}

const PAPEIS = ["admin", "gestor", "videomaker", "editor", "designer", "social", "solicitante"] as const

type ModuloDaOrg = {
  chave: string
  nome: string
  descricao: string
  ativo: boolean
  disponivelNaPlataforma: boolean
  padrao: boolean
  origem: "padrao" | "escolhido"
}

export function PainelOrganizacoes() {
  const { data, mutate, isLoading } = useSWR<{ organizacoes: Org[] }>("/api/admin/organizacoes", fetcher)
  const [criando, setCriando] = useState(false)
  const [aberta, setAberta] = useState<Org | null>(null)
  const [modulosDe, setModulosDe] = useState<Org | null>(null)
  const orgs = data?.organizacoes ?? []

  async function alternarAtivo(org: Org) {
    try {
      const res = await fetch(`/api/admin/organizacoes/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !org.ativo }),
      })
      if (!res.ok) throw await erroDaResposta(res)
      toast.success(org.ativo ? `${org.nome} desligada` : `${org.nome} ligada`)
      mutate()
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível alterar a empresa."))
    }
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-400" /> Organizações
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Controle da plataforma, acima das empresas. Cada organização é um cliente isolado.
          </p>
        </div>
        <button
          onClick={() => setCriando(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" /> Nova empresa
        </button>
      </header>

      {isLoading && <p className="text-sm text-zinc-500">Carregando...</p>}

      <div className="grid gap-3">
        {orgs.map((org) => (
          <div
            key={org.id}
            className={`rounded-xl border p-4 transition-colors ${
              org.ativo ? "border-zinc-800 bg-zinc-900/60" : "border-zinc-800/60 bg-zinc-900/30 opacity-60"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-100 truncate">{org.nome}</span>
                  {!org.ativo && (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-400">
                      desligada
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">
                  {org.slug} · {org._count.membros} {org._count.membros === 1 ? "pessoa" : "pessoas"}
                </p>
                {/* O slug é o que identifica a empresa nos links públicos — quem
                    compartilha formulário precisa dele à mão. */}
                <p className="mt-1 text-[11px] text-zinc-600">
                  Formulário público: <code className="text-zinc-500">/cadastrar-demanda?org={org.slug}</code>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setAberta(org)}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  <Users className="h-3.5 w-3.5" /> Pessoas
                </button>
                <button
                  onClick={() => setModulosDe(org)}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  <ToggleLeft className="h-3.5 w-3.5" /> Módulos
                </button>
                <button
                  onClick={() => alternarAtivo(org)}
                  title={org.ativo ? "Desligar empresa" : "Ligar empresa"}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    org.ativo
                      ? "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                      : "border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20"
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {criando && <ModalNovaEmpresa onClose={() => setCriando(false)} onCriada={() => { setCriando(false); mutate() }} />}
      {aberta && <ModalPessoas org={aberta} onClose={() => { setAberta(null); mutate() }} />}
      {modulosDe && <ModalModulos org={modulosDe} onClose={() => setModulosDe(null)} />}
    </div>
  )
}

function ModalNovaEmpresa({ onClose, onCriada }: { onClose: () => void; onCriada: () => void }) {
  const [nome, setNome] = useState("")
  const [slug, setSlug] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    if (!nome.trim() || salvando) return
    setSalvando(true)
    try {
      const res = await fetch("/api/admin/organizacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, ...(slug.trim() ? { slug: slug.trim() } : {}), ...(adminEmail.trim() ? { adminEmail: adminEmail.trim() } : {}) }),
      })
      if (!res.ok) throw await erroDaResposta(res)
      const { membership } = await res.json()
      toast.success(
        adminEmail.trim() && !membership
          ? "Empresa criada — mas o e-mail do admin não existe no sistema. Vincule em Pessoas."
          : "Empresa criada."
      )
      onCriada()
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível criar a empresa."))
      setSalvando(false)
    }
  }

  return (
    <Overlay titulo="Nova empresa" onClose={onClose}>
      <Campo rotulo="Nome" valor={nome} onChange={setNome} placeholder="Ex.: Contourline" />
      <Campo
        rotulo="Slug (opcional)"
        valor={slug}
        onChange={setSlug}
        placeholder="gerado a partir do nome"
        ajuda="Vai nos links públicos: /cadastrar-demanda?org=slug. Só minúsculas, números e hífen."
      />
      <Campo
        rotulo="E-mail do admin (opcional)"
        valor={adminEmail}
        onChange={setAdminEmail}
        placeholder="pessoa@empresa.com"
        ajuda="Precisa já ter conta no sistema. Sem isso, a empresa nasce sem ninguém dentro."
      />
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Cancelar</button>
        <button
          onClick={criar}
          disabled={!nome.trim() || salvando}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {salvando ? "Criando..." : "Criar"}
        </button>
      </div>
    </Overlay>
  )
}

function ModalPessoas({ org, onClose }: { org: Org; onClose: () => void }) {
  const { data, mutate } = useSWR<{ membros: Membro[] }>(`/api/admin/organizacoes/${org.id}/usuarios`, fetcher)
  const [email, setEmail] = useState("")
  const [papel, setPapel] = useState<string>("solicitante")
  const membros = data?.membros ?? []

  async function vincular() {
    if (!email.trim()) return
    try {
      const res = await fetch(`/api/admin/organizacoes/${org.id}/usuarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), papel }),
      })
      if (!res.ok) throw await erroDaResposta(res)
      setEmail("")
      toast.success("Pessoa vinculada.")
      mutate()
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível vincular."))
    }
  }

  async function desvincular(m: Membro) {
    try {
      const res = await fetch(`/api/admin/organizacoes/${org.id}/usuarios`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId: m.usuario.id }),
      })
      if (!res.ok) throw await erroDaResposta(res)
      toast.success(`${m.usuario.nome} saiu de ${org.nome}.`)
      mutate()
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível desvincular."))
    }
  }

  return (
    <Overlay titulo={`Pessoas · ${org.nome}`} onClose={onClose}>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {membros.length === 0 && <p className="text-sm text-zinc-500">Ninguém vinculado ainda.</p>}
        {membros.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-800/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-200">{m.usuario.nome}</p>
              <p className="truncate text-xs text-zinc-500">{m.usuario.email ?? "sem e-mail"} · {m.papel}</p>
            </div>
            <button onClick={() => desvincular(m)} title="Desvincular" className="shrink-0 text-zinc-600 hover:text-red-400">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-zinc-800 pt-3">
        <Campo
          rotulo="Vincular pessoa"
          valor={email}
          onChange={setEmail}
          placeholder="e-mail de quem já tem conta"
          ajuda="Vincular não cria login. A pessoa precisa já existir no sistema."
        />
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs text-zinc-500">
            Papel
            <select
              value={papel}
              onChange={(e) => setPapel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
            >
              {PAPEIS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button
            onClick={vincular}
            disabled={!email.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" /> Vincular
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function ModalModulos({ org, onClose }: { org: Org; onClose: () => void }) {
  const { data, mutate } = useSWR<{ modulos: ModuloDaOrg[] }>(`/api/admin/organizacoes/${org.id}/modulos`, fetcher)
  const modulos = data?.modulos ?? []

  async function alternar(m: ModuloDaOrg) {
    try {
      const res = await fetch(`/api/admin/organizacoes/${org.id}/modulos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: m.chave, ativo: !m.ativo }),
      })
      if (!res.ok) throw await erroDaResposta(res)
      mutate()
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível alterar o módulo."))
    }
  }

  return (
    <Overlay titulo={`Módulos · ${org.nome}`} onClose={onClose}>
      <p className="text-xs text-zinc-500">
        O que esta empresa enxerga. Mudança vale no próximo carregamento de página.
      </p>
      <div className="space-y-2">
        {modulos.map((m) => (
          <div key={m.chave} className="rounded-lg bg-zinc-800/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200">{m.nome}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{m.descricao}</p>
                {!m.disponivelNaPlataforma && (
                  /* Chave geral por cima da decisão comercial: não adianta
                     "vender" o que a plataforma ainda não entrega. */
                  <p className="mt-1 text-[11px] text-amber-500/80">
                    Indisponível na plataforma — não pode ser ligado para ninguém ainda.
                  </p>
                )}
                {m.disponivelNaPlataforma && m.origem === "padrao" && (
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Seguindo o padrão ({m.padrao ? "ligado" : "desligado"}) — nunca foi decidido para esta empresa.
                  </p>
                )}
              </div>
              <button
                onClick={() => alternar(m)}
                disabled={!m.disponivelNaPlataforma}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  m.ativo
                    ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                    : "bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {m.ativo ? "Ligado" : "Desligado"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Overlay>
  )
}

function Overlay({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100">{titulo}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Campo({ rotulo, valor, onChange, placeholder, ajuda }: {
  rotulo: string; valor: string; onChange: (v: string) => void; placeholder?: string; ajuda?: string
}) {
  return (
    <label className="block text-xs text-zinc-500">
      {rotulo}
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
      />
      {ajuda && <span className="mt-1 block text-[11px] text-zinc-600">{ajuda}</span>}
    </label>
  )
}
