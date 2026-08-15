"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import {
  Users, Search, CheckCircle2, XCircle, Plus, X, GitMerge, AlertTriangle,
  KeyRound, Eye, EyeOff, AlertCircle, Trash2, ShieldCheck, ShieldOff,
  Download, MoreHorizontal, Pencil, UserCog, Power, ChevronLeft, ChevronRight,
  Users2, IdCard,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { PermissoesModal } from "@/components/PermissoesModal"
import { fetcher } from "@/lib/fetcher"
import { mensagemDeErro } from "@/lib/erro-cliente"
import { PainelPessoa } from "@/components/pessoas/PainelPessoa"
import { AbaEquipes } from "@/components/pessoas/AbaEquipes"
import { AbaPerfis } from "@/components/pessoas/AbaPerfis"
import { GROWTH_ATIVO, EVENTOS_ATIVO } from "@/lib/modulos"
import {
  type PessoaLista, type PerfilAcesso,
  vinculoDe, VINCULO_LABEL, VINCULO_COR, nivelDe, NIVEL_LABEL, NIVEL_COR, NIVEIS,
  perfilDe, PERFIL_LABEL, PERFIL_COR, AREA_LABEL, AREA_PONTO,
  funcaoDe, semAtividade, iniciais, corAvatar, formatarAtividade,
} from "@/lib/pessoas-ui"

const TIPO_LABEL: Record<string, string> = {
  admin: "Admin", gestor: "Gestor", operacao: "Operação",
  solicitante: "Solicitante", editor: "Videomaker Int", videomaker: "Videomaker", social: "Social Media",
  designer: "Designer", gestor_eventos: "Gestor de Eventos",
  analista_crm: "Analista CRM", gestor_trafego: "Gestor de Tráfego", auxiliar_admin: "Auxiliar Admin",
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

type Aba = "pessoas" | "equipes" | "perfis"

const POR_PAGINA = 12

type Usuario = PessoaLista

interface Profissional {
  id: string
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

// ─── Modal Redefinir Senha ────────────────────────────────────────────────────
function ModalResetSenha({
  usuario, onClose, onSave,
}: {
  usuario: { id: string; nome: string; email: string | null }
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
            <p className="text-xs text-zinc-400">{usuario.nome}{usuario.email ? ` · ${usuario.email}` : ""}</p>
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

// ─── Modal Editar Pessoa ──────────────────────────────────────────────────────
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
const FUNCAO_FORM_LABEL: Record<string, string> = {
  social: "Social Media", designer: "Designer", analista_crm: "Analista CRM", gestor_trafego: "Gestor de Tráfego",
  videomaker: "Videomaker", editor: "Editor", fotografo: "Fotógrafo", atendimento: "Atendimento",
  copywriter: "Copywriter", produtor: "Produtor", coordenador: "Coordenador", gestor: "Gestor", admin: "Admin",
  operacao: "Operação", outro: "Outro",
}
const AREAS = [
  { value: "audiovisual", label: "Audiovisual" },
  ...(GROWTH_ATIVO ? [{ value: "growth", label: "Growth / Conteúdos" }] : []),
  ...(EVENTOS_ATIVO ? [{ value: "eventos", label: "Coberturas de Eventos" }] : []),
]

function ModalEditarUsuario({
  usuario, onClose, onSave,
}: {
  usuario: Usuario
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
  const [lider, setLider] = useState(usuario.liderAudiovisual ?? false)
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
      const body: Record<string, unknown> = { nome, email, telefone, tipo, categoria, funcaoProfissional: funcao || null, areas, liderAudiovisual: lider }
      if (novaSenha) body.novaSenha = novaSenha
      const res = await fetch(`/api/usuarios/${usuario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Pessoa atualizada!")
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
            <p className="font-semibold text-white text-sm">Editar pessoa</p>
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
            <p className="text-xs text-zinc-500">Vínculo, função e equipe (nesta organização)</p>
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
                {FUNCOES.map(f => <option key={f} value={f}>{FUNCAO_FORM_LABEL[f] ?? f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Equipes</label>
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
          {categoria === "interna" && areas.includes("audiovisual") && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-3">
              <div>
                <p className="text-sm font-medium text-fuchsia-200">Líder audiovisual</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">Autonomia para editar, mover e aprovar demandas + notificação de toda nova demanda audiovisual.</p>
              </div>
              <button type="button" role="switch" aria-checked={lider} onClick={() => setLider(v => !v)}
                className={`shrink-0 mt-0.5 w-10 h-6 rounded-full transition-colors relative ${lider ? "bg-fuchsia-600" : "bg-zinc-700"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${lider ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
          )}
          <div className="border-t border-zinc-800 pt-3">
            <p className="text-xs text-zinc-500 mb-3">Nova senha — deixe em branco para não alterar</p>
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

// ─── Menu "..." da linha ──────────────────────────────────────────────────────
//
// Posição `fixed` calculada a partir do botão, e não `absolute`: a tabela vive
// dentro de um container com rolagem horizontal, e um menu absoluto era cortado
// nas últimas linhas — as ações da última pessoa da página ficavam inalcançáveis.
// Pelo mesmo motivo ele abre para cima quando não cabe para baixo.

const LARGURA_MENU = 192  // w-48
const ALTURA_ITEM = 36

function MenuLinha({ itens }: {
  itens: { label: string; Icon: React.ElementType; run: () => void; perigo?: boolean }[]
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Rolar com o menu aberto o deixaria flutuando longe da linha de origem.
  useEffect(() => {
    if (!pos) return
    const fechar = () => setPos(null)
    window.addEventListener("scroll", fechar, true)
    window.addEventListener("resize", fechar)
    return () => {
      window.removeEventListener("scroll", fechar, true)
      window.removeEventListener("resize", fechar)
    }
  }, [pos])

  function alternar() {
    if (pos) { setPos(null); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const altura = itens.length * ALTURA_ITEM + 8
    const cabeAbaixo = r.bottom + altura + 8 <= window.innerHeight
    setPos({
      top: cabeAbaixo ? r.bottom + 4 : Math.max(8, r.top - altura - 4),
      left: Math.max(8, r.right - LARGURA_MENU),
    })
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={alternar}
        className={cn(
          "p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors",
          pos && "text-zinc-200 bg-zinc-700",
        )}
        title="Ações"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setPos(null)} />
          <div
            style={{ top: pos.top, left: pos.left, width: LARGURA_MENU }}
            className="fixed z-[56] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
          >
            {itens.map(i => (
              <button
                key={i.label}
                onClick={() => { setPos(null); i.run() }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 transition-colors text-left",
                  i.perigo ? "text-red-400" : "text-zinc-300",
                )}
              >
                <i.Icon className="w-3.5 h-3.5 shrink-0" /> {i.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ─── Select de filtro ─────────────────────────────────────────────────────────
function Filtro({ valor, onChange, children }: {
  valor: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={valor}
      onChange={e => onChange(e.target.value)}
      className={cn(
        "text-sm border rounded-lg pl-2.5 pr-1.5 py-2 bg-zinc-900 outline-none focus:ring-1 focus:ring-purple-500 transition-colors",
        valor === "todos"
          ? "border-zinc-800 text-zinc-400"
          : "border-purple-500/40 text-purple-300",
      )}
    >
      {children}
    </select>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function PessoasAcessosPage() {
  const [aba, setAba] = useState<Aba>("pessoas")

  // Filtros da aba Pessoas
  const [busca, setBusca] = useState("")
  const [fVinculo, setFVinculo] = useState("todos")
  const [fEquipe, setFEquipe] = useState("todos")
  const [fNivel, setFNivel] = useState("todos")
  const [fStatus, setFStatus] = useState("todos")
  const [fPerfil, setFPerfil] = useState("todos")
  const [pagina, setPagina] = useState(1)

  // Painel lateral
  const [pessoaAbertaId, setPessoaAbertaId] = useState<string | null>(null)

  // Modais
  const [editTarget, setEditTarget] = useState<Usuario | null>(null)
  const [resetTarget, setResetTarget] = useState<{ id: string; nome: string; email: string | null } | null>(null)
  const [promoverTarget, setPromoverTarget] = useState<{ id: string; nome: string } | null>(null)
  type Vinculos = { demandas: number; historicos: number; comentarios: number; coberturas: number; eventos: number; profissional: number; memberships: number; total: number; podeExcluir: boolean }
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nome: string; vinculos: Vinculos | null; carregando: boolean } | null>(null)
  const [deletando, setDeletando] = useState(false)
  const [promoverTipo, setPromoverTipo] = useState("operacao")
  const [loadingPromover, setLoadingPromover] = useState(false)
  const [permUser, setPermUser] = useState<{ id: string; nome: string; tipo: string; areas?: string[] } | null>(null)
  const [mesclarModal, setMesclarModal] = useState<MesclarModal | null>(null)

  // Nova pessoa
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: "", email: "", senha: "", tipo: "operacao", telefone: "", categoria: "interna", funcaoProfissional: "", areas: [] as string[] })
  const toggleFormArea = (a: string) => setForm(f => ({ ...f, areas: f.areas.includes(a) ? f.areas.filter(x => x !== a) : [...f.areas, a] }))
  const [loading, setLoading] = useState(false)
  const [conflito, setConflito] = useState<{ id: string; nome: string; email: string | null; telefone: string | null } | null>(null)
  const [adicionandoEmail, setAdicionandoEmail] = useState(false)

  const { data, error, isLoading, mutate } = useSWR<{ usuarios: Usuario[]; videomakers: Profissional[]; editores: Profissional[] }>("/api/usuarios", fetcher)

  const pessoas = useMemo(() => data?.usuarios ?? [], [data])
  const videomakers = data?.videomakers ?? []
  const editores = data?.editores ?? []

  // ── Filtros ───────────────────────────────────────────────────────────────
  // Uma lista só, recortada por dimensão. Não existe mais "aba onde a pessoa
  // não aparece": quem não lembra se o fulano é interno ou parceiro busca pelo
  // nome e acha, e é o filtro de vínculo que responde qual dos dois ele é.
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return pessoas.filter(p => {
      if (termo) {
        const alvo = `${p.nome} ${p.email ?? ""} ${p.telefone ?? ""}`.toLowerCase()
        if (!alvo.includes(termo)) return false
      }
      if (fVinculo !== "todos" && vinculoDe(p) !== fVinculo) return false
      if (fEquipe !== "todos") {
        const areas = p.areas ?? []
        if (fEquipe === "") { if (areas.length > 0) return false }
        else if (!areas.includes(fEquipe)) return false
      }
      if (fNivel !== "todos" && nivelDe(p) !== fNivel) return false
      if (fPerfil !== "todos" && perfilDe(p) !== fPerfil) return false
      if (fStatus === "ativo" && p.status !== "ativo") return false
      if (fStatus === "inativo" && p.status === "ativo") return false
      if (fStatus === "sem_atividade" && !semAtividade(p)) return false
      return true
    })
  }, [pessoas, busca, fVinculo, fEquipe, fNivel, fPerfil, fStatus])

  const filtroAtivo = busca.trim() !== "" || [fVinculo, fEquipe, fNivel, fStatus, fPerfil].some(f => f !== "todos")

  function limparFiltros() {
    setBusca(""); setFVinculo("todos"); setFEquipe("todos")
    setFNivel("todos"); setFStatus("todos"); setFPerfil("todos"); setPagina(1)
  }

  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * POR_PAGINA
  const paginada = lista.slice(inicio, inicio + POR_PAGINA)

  const pessoaAberta = pessoas.find(p => p.id === pessoaAbertaId) ?? null

  // Os cinco números do topo são também os cinco recortes mais pedidos: clicar
  // aplica o filtro. "Nunca acessou" está aqui no lugar de um "sem acesso" que
  // marcaria zero todo dia — as 94 pessoas têm e-mail, o que separa mesmo é
  // quem nunca deixou rastro.
  const cards = [
    {
      label: "Total de pessoas", valor: pessoas.length, Icon: Users,
      cor: "text-purple-400", bg: "bg-purple-500/10",
      ativo: !filtroAtivo,
      aplicar: limparFiltros,
    },
    {
      label: "Ativas", valor: pessoas.filter(p => p.status === "ativo").length, Icon: CheckCircle2,
      cor: "text-emerald-400", bg: "bg-emerald-500/10",
      ativo: fStatus === "ativo",
      aplicar: () => { limparFiltros(); setFStatus("ativo") },
    },
    {
      label: "Inativas", valor: pessoas.filter(p => p.status !== "ativo").length, Icon: XCircle,
      cor: "text-red-400", bg: "bg-red-500/10",
      ativo: fStatus === "inativo",
      aplicar: () => { limparFiltros(); setFStatus("inativo") },
    },
    {
      label: "Parceiros", valor: pessoas.filter(p => vinculoDe(p) === "parceiro").length, Icon: ShieldCheck,
      cor: "text-blue-400", bg: "bg-blue-500/10",
      ativo: fVinculo === "parceiro",
      aplicar: () => { limparFiltros(); setFVinculo("parceiro") },
    },
    {
      label: "Nunca acessaram", valor: pessoas.filter(semAtividade).length, Icon: ShieldOff,
      cor: "text-amber-400", bg: "bg-amber-500/10",
      ativo: fStatus === "sem_atividade",
      aplicar: () => { limparFiltros(); setFStatus("sem_atividade") },
    },
  ]

  const equipesDisponiveis = [
    "audiovisual",
    ...(GROWTH_ATIVO ? ["growth"] : []),
    ...(EVENTOS_ATIVO ? ["eventos"] : []),
  ]

  function perfilProfissionalHref(id: string): string | null {
    const vm = videomakers.find(v => v.usuarioId === id)
    if (vm) return `/videomakers/${vm.id}`
    const ed = editores.find(e => e.usuarioId === id)
    if (ed) return `/equipe/${ed.id}`
    return null
  }

  // ── Ações ─────────────────────────────────────────────────────────────────

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
      toast.error(e instanceof Error ? e.message : "Erro ao criar pessoa")
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

  async function abrirExcluir(u: Usuario) {
    setDeleteTarget({ id: u.id, nome: u.nome, vinculos: null, carregando: true })
    try {
      const r = await fetch(`/api/usuarios/${u.id}/vinculos`).then(x => x.json())
      setDeleteTarget(t => t && t.id === u.id ? { ...t, vinculos: r.vinculos ?? null, carregando: false } : t)
    } catch {
      setDeleteTarget(t => t ? { ...t, carregando: false } : t)
    }
  }

  // Hard delete só para cadastro vazio (a API revalida via ?modo=hard).
  async function excluirPessoa() {
    if (!deleteTarget) return
    setDeletando(true)
    try {
      const res = await fetch(`/api/usuarios/${deleteTarget.id}?modo=hard`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(err.error ?? "Erro ao excluir")
      }
      toast.success(`${deleteTarget.nome} foi excluído definitivamente.`)
      if (pessoaAbertaId === deleteTarget.id) setPessoaAbertaId(null)
      setDeleteTarget(null)
      mutate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir")
    } finally { setDeletando(false) }
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
      const encontrados: Usuario[] = json.usuarios ?? []
      const encontrado = encontrados.find(u => u.id !== mesclarModal.principal.id) ?? null
      const qtd = encontrado
        ? await fetch(`/api/demandas?solicitanteId=${encontrado.id}&limit=0`).then(r => r.json()).then(j => j.total ?? 0).catch(() => 0)
        : null
      setMesclarModal(m => m ? { ...m, buscando: false, secundario: encontrado, qtdDemandas: qtd } : null)
    } catch {
      setMesclarModal(m => m ? { ...m, buscando: false } : null)
      toast.error("Erro ao buscar pessoa")
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

  // Exporta o que está na tela — com os filtros aplicados. Exportar sempre a
  // base inteira transformaria "quem está sem acesso?" numa planilha de 94
  // linhas para filtrar de novo no Excel.
  function exportar() {
    const colunas = ["Nome", "E-mail", "WhatsApp", "Função", "Equipes", "Vínculo", "Nível", "Perfil de acesso", "Status", "Última atividade"]
    const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`
    const linhas = lista.map(p => [
      p.nome,
      p.email ?? "",
      p.telefone ?? "",
      funcaoDe(p) ?? "",
      (p.areas ?? []).map(a => AREA_LABEL[a] ?? a).join(" / "),
      VINCULO_LABEL[vinculoDe(p)],
      NIVEL_LABEL[nivelDe(p)],
      PERFIL_LABEL[perfilDe(p)],
      p.status === "ativo" ? "Ativo" : "Inativo",
      formatarAtividade(p.ultimaAtividade),
    ].map(v => escapar(String(v))).join(","))

    // BOM para o Excel não comer os acentos.
    const csv = "﻿" + [colunas.map(escapar).join(","), ...linhas].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `pessoas-e-acessos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${lista.length} pessoa(s) exportada(s).`)
  }

  const abas: { id: Aba; label: string; Icon: React.ElementType }[] = [
    { id: "pessoas", label: "Pessoas", Icon: Users },
    { id: "equipes", label: "Equipes", Icon: Users2 },
    { id: "perfis", label: "Perfis de acesso", Icon: IdCard },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Header />

      <main className={cn("flex-1 p-6 space-y-5 transition-[padding]", pessoaAberta && "lg:pr-[25rem]")}>

        {/* Título + ação principal */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Pessoas &amp; Acessos</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Gerencie todas as pessoas, equipes, cargos e níveis de acesso do NuFlow.
            </p>
          </div>
          <button
            onClick={() => { setAba("pessoas"); setShowForm(v => !v) }}
            className="shrink-0 flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm px-4 py-2 rounded-lg transition-colors font-semibold"
          >
            <Plus className="w-4 h-4" /> Nova pessoa
          </button>
        </div>

        {/* Números — cada card é também um filtro */}
        <div className={cn(
          "grid gap-3 grid-cols-2 md:grid-cols-3",
          // Com o painel aberto sobra menos largura: cinco colunas só a partir
          // do 2xl, senão os rótulos viram "Tot…" e o número perde o nome.
          pessoaAberta ? "2xl:grid-cols-5" : "lg:grid-cols-5",
        )}>
          {cards.map(c => {
            const selecionado = aba === "pessoas" && c.ativo
            return (
              <button
                key={c.label}
                onClick={() => { setAba("pessoas"); c.aplicar() }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-zinc-900/60 px-4 py-3.5 text-left transition-colors",
                  selecionado ? "border-purple-500/50 bg-purple-500/5" : "border-zinc-800 hover:border-zinc-700",
                )}
              >
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", c.bg)}>
                  <c.Icon className={cn("w-4 h-4", c.cor)} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-zinc-500 leading-tight truncate">{c.label}</p>
                  <p className="text-xl font-semibold text-zinc-100 leading-tight tabular-nums">{c.valor}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Abas */}
        <div className="flex items-center gap-0 border-b border-zinc-800">
          {abas.map(t => (
            <button
              key={t.id}
              onClick={() => { setAba(t.id); setShowForm(false); setConflito(null) }}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                aba === t.id ? "border-purple-500 text-purple-400" : "border-transparent text-zinc-500 hover:text-zinc-300",
              )}
            >
              <t.Icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Formulário Nova Pessoa ── */}
        {showForm && (
          <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-100">Nova pessoa</p>
              <button onClick={() => { setShowForm(false); setConflito(null) }} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="sm:col-span-2">
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
                  {FUNCOES.map(fn => <option key={fn} value={fn}>{FUNCAO_FORM_LABEL[fn] ?? fn}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-zinc-400 block mb-1">Equipes</label>
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
                      className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                    >
                      {adicionandoEmail ? "Salvando..." : "Sim, adicionar e-mail"}
                    </button>
                  )}
                  <button
                    onClick={() => setConflito(null)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={criarUsuario}
                disabled={loading || !form.nome.trim() || !form.senha || !form.email}
                className="bg-purple-600 hover:bg-purple-500 text-white text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {loading ? "Criando..." : "Criar pessoa"}
              </button>
              <button onClick={() => { setShowForm(false); setConflito(null) }} className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── Aba Pessoas ── */}
        {aba === "pessoas" && (
          <>
            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Buscar por nome, e-mail ou telefone..."
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setPagina(1) }}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-800 rounded-lg bg-zinc-900 text-zinc-200 placeholder:text-zinc-600 outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <Filtro valor={fVinculo} onChange={v => { setFVinculo(v); setPagina(1) }}>
                <option value="todos">Todos os vínculos</option>
                <option value="interno">Interno</option>
                <option value="parceiro">Parceiro</option>
                <option value="sistema">Sistema / Teste</option>
              </Filtro>

              <Filtro valor={fEquipe} onChange={v => { setFEquipe(v); setPagina(1) }}>
                <option value="todos">Todas as equipes</option>
                {equipesDisponiveis.map(a => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
                <option value="">Sem equipe</option>
              </Filtro>

              <Filtro valor={fNivel} onChange={v => { setFNivel(v); setPagina(1) }}>
                <option value="todos">Todos os níveis</option>
                {NIVEIS.map(n => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}
              </Filtro>

              <Filtro valor={fStatus} onChange={v => { setFStatus(v); setPagina(1) }}>
                <option value="todos">Todos os status</option>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
                <option value="sem_atividade">Nunca acessaram</option>
              </Filtro>

              {fPerfil !== "todos" && (
                <button
                  onClick={() => { setFPerfil("todos"); setPagina(1) }}
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-purple-500/40 bg-purple-500/10 text-purple-300"
                >
                  Perfil: {PERFIL_LABEL[fPerfil as PerfilAcesso]} <X className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={exportar}
                disabled={lista.length === 0}
                className="ml-auto flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
                title="Exporta as pessoas visíveis, com os filtros aplicados"
              >
                <Download className="w-3.5 h-3.5" /> Exportar
              </button>
            </div>

            {/* Tabela */}
            <div className="border border-zinc-800 rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-zinc-800/50 border-b border-zinc-800">
                  <tr>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500">PESSOA</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500">FUNÇÃO</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500">EQUIPE</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500">VÍNCULO</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500">NÍVEL</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500">ACESSO</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500">STATUS</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500">ATIVIDADE</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-zinc-500">AÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {paginada.map(p => {
                    const vinculo = vinculoDe(p)
                    const nivel = nivelDe(p)
                    const perfil = perfilDe(p)
                    const areas = p.areas ?? []
                    const ativo = p.status === "ativo"
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setPessoaAbertaId(p.id)}
                        className={cn(
                          "hover:bg-zinc-800/40 cursor-pointer group transition-colors",
                          pessoaAbertaId === p.id && "bg-zinc-800/60",
                        )}
                      >
                        <td className="px-3 py-3 max-w-[230px]">
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 overflow-hidden",
                              corAvatar(p.id),
                            )}>
                              {p.avatarUrl
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                                : iniciais(p.nome)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-zinc-100 truncate">{p.nome}</p>
                              <p className="text-xs text-zinc-500 truncate">
                                {p.email || <span className="italic text-zinc-600">sem e-mail</span>}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {funcaoDe(p)
                            ? <span className="text-xs px-2 py-0.5 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300">{funcaoDe(p)}</span>
                            : <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {areas.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
                              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", AREA_PONTO[areas[0]] ?? "bg-zinc-500")} />
                              {AREA_LABEL[areas[0]] ?? areas[0]}
                              {areas.length > 1 && <span className="text-zinc-600">+{areas.length - 1}</span>}
                            </span>
                          ) : <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border", VINCULO_COR[vinculo])}>
                            {VINCULO_LABEL[vinculo]}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border", NIVEL_COR[nivel])}>
                            {NIVEL_LABEL[nivel]}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap", PERFIL_COR[perfil])}>
                            {PERFIL_LABEL[perfil]}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn(
                            "text-[11px] font-medium px-2 py-0.5 rounded-full",
                            ativo ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500",
                          )}>
                            {ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("text-xs", p.ultimaAtividade ? "text-zinc-400" : "text-zinc-600 italic")}>
                            {formatarAtividade(p.ultimaAtividade)}
                          </span>
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end">
                            <MenuLinha itens={[
                              { label: "Editar pessoa", Icon: Pencil, run: () => setEditTarget(p) },
                              { label: "Editar permissões", Icon: ShieldCheck, run: () => setPermUser({ id: p.id, nome: p.nome, tipo: p.tipo, areas: p.areas }) },
                              { label: "Redefinir senha", Icon: KeyRound, run: () => setResetTarget({ id: p.id, nome: p.nome, email: p.email }) },
                              ...(p.tipo === "solicitante"
                                ? [{ label: "Promover", Icon: UserCog, run: () => setPromoverTarget({ id: p.id, nome: p.nome }) }]
                                : []),
                              { label: "Mesclar duplicado", Icon: GitMerge, run: () => abrirMesclar(p) },
                              { label: ativo ? "Desativar conta" : "Reativar conta", Icon: Power, run: () => toggleStatus(p.id, p.status) },
                              { label: "Excluir cadastro", Icon: Trash2, run: () => abrirExcluir(p), perigo: true },
                            ]} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {lista.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center">
                        <Users className="w-8 h-8 mx-auto mb-2 text-zinc-700" />
                        <p className="text-sm text-zinc-500">
                          {error
                          ? mensagemDeErro(error, "Não foi possível carregar as pessoas.")
                          : isLoading
                            ? "Carregando..."
                            : filtroAtivo
                              ? "Nenhuma pessoa com esses filtros."
                              : "Nenhuma pessoa cadastrada ainda."}
                        </p>
                        {filtroAtivo && (
                          <button onClick={limparFiltros} className="text-xs text-purple-400 hover:text-purple-300 mt-2">
                            Limpar filtros
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {lista.length > 0 && (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-zinc-500">
                  Mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, lista.length)} de {lista.length} pessoa{lista.length === 1 ? "" : "s"}
                  {filtroAtivo && <span className="text-zinc-600"> (de {pessoas.length})</span>}
                </p>
                {totalPaginas > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPagina(p => Math.max(1, p - 1))}
                      disabled={paginaAtual === 1}
                      className="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                      .filter(n => n === 1 || n === totalPaginas || Math.abs(n - paginaAtual) <= 1)
                      .map((n, i, arr) => (
                        <span key={n} className="flex items-center gap-1">
                          {i > 0 && n - arr[i - 1] > 1 && <span className="text-zinc-600 px-1">…</span>}
                          <button
                            onClick={() => setPagina(n)}
                            className={cn(
                              "w-8 h-8 rounded-md text-sm transition-colors tabular-nums",
                              n === paginaAtual
                                ? "bg-purple-600 text-white font-semibold"
                                : "border border-zinc-800 text-zinc-400 hover:bg-zinc-800",
                            )}
                          >
                            {n}
                          </button>
                        </span>
                      ))}
                    <button
                      onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                      disabled={paginaAtual === totalPaginas}
                      className="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Aba Equipes ── */}
        {aba === "equipes" && (
          <AbaEquipes
            pessoas={pessoas}
            onAbrirEquipe={area => {
              setFEquipe(area)
              setFStatus("todos")
              setFPerfil("todos")
              setPagina(1)
              setAba("pessoas")
            }}
          />
        )}

        {/* ── Aba Perfis de acesso ── */}
        {aba === "perfis" && (
          <AbaPerfis
            pessoas={pessoas}
            onAbrirPerfil={perfil => {
              setFPerfil(perfil)
              setFStatus("todos")
              setFEquipe("todos")
              setFNivel("todos")
              setPagina(1)
              setAba("pessoas")
            }}
          />
        )}
      </main>

      {/* ── Painel lateral ── */}
      {pessoaAberta && (
        <PainelPessoa
          key={pessoaAberta.id}
          pessoa={pessoaAberta}
          perfilHref={perfilProfissionalHref(pessoaAberta.id)}
          onClose={() => setPessoaAbertaId(null)}
          acoes={{
            onEditar: () => setEditTarget(pessoaAberta),
            onPermissoes: () => setPermUser({ id: pessoaAberta.id, nome: pessoaAberta.nome, tipo: pessoaAberta.tipo, areas: pessoaAberta.areas }),
            onSenha: () => setResetTarget({ id: pessoaAberta.id, nome: pessoaAberta.nome, email: pessoaAberta.email }),
            onMesclar: () => abrirMesclar(pessoaAberta),
            onStatus: () => toggleStatus(pessoaAberta.id, pessoaAberta.status),
            onExcluir: () => abrirExcluir(pessoaAberta),
          }}
        />
      )}

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
            <h3 className="font-semibold text-white mb-1">Promover pessoa</h3>
            <p className="text-sm text-zinc-400 mb-4">{promoverTarget.nome} será promovido de solicitante.</p>
            <label className="text-xs text-zinc-500 mb-1 block">Novo papel</label>
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
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50 transition-colors"
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

      {/* Excluir cadastro vazio / mesclar se tiver vínculos */}
      {deleteTarget && (() => {
        const v = deleteTarget.vinculos
        const carregando = deleteTarget.carregando
        const podeExcluir = !!v?.podeExcluir
        return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !deletando && setDeleteTarget(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Excluir cadastro vazio</p>
                <p className="text-xs text-zinc-400">{deleteTarget.nome}</p>
              </div>
            </div>

            {carregando ? (
              <p className="text-sm text-zinc-400">Verificando vínculos…</p>
            ) : podeExcluir ? (
              <>
                <p className="text-sm text-zinc-300">
                  <strong>{deleteTarget.nome}</strong> não tem vínculos. A conta será <strong>excluída definitivamente</strong> (não é só desativar).
                </p>
                {(v?.memberships ?? 0) > 1 && (
                  <p className="text-xs text-amber-400">Pertence a {v?.memberships} organizações — a exclusão global requer super-admin.</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={excluirPessoa} disabled={deletando}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50">
                    {deletando ? "Excluindo..." : "Excluir definitivamente"}
                  </button>
                  <button onClick={() => setDeleteTarget(null)} disabled={deletando}
                    className="flex-1 border border-zinc-700 text-zinc-300 text-sm py-2 rounded-lg hover:bg-zinc-800 transition-colors">
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="text-xs font-semibold text-amber-400 mb-1">Esta pessoa tem vínculos. Mescle com outro cadastro antes de excluir.</p>
                  <ul className="text-[11px] text-zinc-400 space-y-0.5">
                    {!!v?.demandas && <li>• {v.demandas} demanda(s)</li>}
                    {!!v?.comentarios && <li>• {v.comentarios} comentário(s)</li>}
                    {!!v?.historicos && <li>• {v.historicos} registro(s) de histórico</li>}
                    {!!v?.coberturas && <li>• {v.coberturas} vínculo(s) em coberturas</li>}
                    {!!v?.eventos && <li>• {v.eventos} vínculo(s) em eventos</li>}
                    {!!v?.profissional && <li>• {v.profissional} perfil profissional vinculado</li>}
                  </ul>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { const alvo = pessoas.find(x => x.id === deleteTarget.id); setDeleteTarget(null); if (alvo) abrirMesclar(alvo) }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                    <GitMerge className="w-4 h-4" /> Mesclar duplicado
                  </button>
                  <button onClick={() => setDeleteTarget(null)}
                    className="flex-1 border border-zinc-700 text-zinc-300 text-sm py-2 rounded-lg hover:bg-zinc-800 transition-colors">
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        )
      })()}

      {permUser && (
        <PermissoesModal
          key={permUser.id}
          usuarioId={permUser.id}
          usuarioNome={permUser.nome}
          usuarioTipo={permUser.tipo}
          usuarioAreas={permUser.areas}
          open={!!permUser}
          onClose={() => setPermUser(null)}
          onSalvo={() => mutate()}
        />
      )}

      {mesclarModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !mesclarModal.mesclando && setMesclarModal(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-blue-400" />
                <h2 className="font-semibold text-zinc-100 text-sm">Mesclar cadastros duplicados</h2>
              </div>
              <button onClick={() => setMesclarModal(null)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-1">Manter (principal)</p>
                <p className="font-semibold text-zinc-100 text-sm">{mesclarModal.principal.nome}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {mesclarModal.principal.email || <span className="text-zinc-600 italic">sem e-mail</span>}
                  {mesclarModal.principal.telefone && <span className="ml-2 text-zinc-500">{mesclarModal.principal.telefone}</span>}
                </p>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">Buscar cadastro duplicado para remover:</label>
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
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">Remover (duplicado)</p>
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
                <p className="text-xs text-zinc-500 italic">Nenhuma pessoa encontrada com esse termo.</p>
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
                  <GitMerge className="w-4 h-4" /> {mesclarModal.mesclando ? "Mesclando..." : "Confirmar mesclagem"}
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
