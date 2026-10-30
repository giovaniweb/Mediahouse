"use client"

// Painel da plataforma: criar empresa, ligar/desligar, gerir quem entra.
//
// A tela existe porque as APIs já existiam e não tinham porta: `superAdmin`,
// `requireSuperAdmin` e os endpoints de organização estavam prontos desde a
// Fase 1 do SaaS, e mesmo assim criar uma empresa exigia rodar `ts-node` na
// máquina de alguém. Isso fazia de cada cliente novo uma tarefa de engenharia.
import styles from "./Organizations.module.css"
import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"
import useSWR from "swr"
import { Plus, Power, UserPlus, X, Users, ToggleLeft } from "lucide-react"
import { toast } from "sonner"
import { fetcher } from "@/lib/fetcher"
import { Header } from "@/components/layout/Header"
import { PageIntro } from "@/components/layout/PageIntro"
import { erroDaResposta, mensagemDeErro } from "@/lib/erro-cliente"
import { FUNCAO_LABEL } from "@/lib/pessoas-ui"

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

/** Pessoa achada na busca da plataforma (/api/admin/usuarios). */
type PessoaAchada = {
  id: string
  nome: string
  email: string | null
  empresas: { nome: string; papel: string }[]
}
const nomeDoPapel = (papel: string) => FUNCAO_LABEL[papel] ?? papel

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
  const { data, mutate, isLoading, error } = useSWR<{ organizacoes: Org[] }>("/api/admin/organizacoes", fetcher)
  const [criando, setCriando] = useState(false)
  const [aberta, setAberta] = useState<Org | null>(null)
  const [modulosDe, setModulosDe] = useState<Org | null>(null)
  const [alterando, setAlterando] = useState<string | null>(null)
  const alteracaoEmCurso = useRef(false)
  const orgs = data?.organizacoes ?? []

  async function alternarAtivo(org: Org) {
    if (alteracaoEmCurso.current) return
    alteracaoEmCurso.current = true
    setAlterando(org.id)
    try {
      const res = await fetch(`/api/admin/organizacoes/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !org.ativo }),
      })
      if (!res.ok) throw await erroDaResposta(res)
      toast.success(org.ativo ? `${org.nome} desligada` : `${org.nome} ligada`)
      await mutate()
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível alterar a empresa."))
    } finally {
      alteracaoEmCurso.current = false
      setAlterando(null)
    }
  }

  return (
    <>
    {/* O mesmo cabeçalho das outras telas (barra + abertura), em vez de um
        título próprio com ícone: a área do SaaS é parte do sistema. */}
    <Header title="Empresas do SaaS" />
    <PageIntro eyebrow="PLATAFORMA / EMPRESAS" title="Cada empresa, seu espaço." description="Cadastre as empresas que usam o NuFlow e gerencie acessos, módulos e a área pública de cada uma.">
      <button
        onClick={() => setCriando(true)}
        className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-500"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Nova empresa
      </button>
    </PageIntro>
    <div className={styles.page}>
      <div className="flex flex-wrap gap-5 text-sm text-purple-300"><Link href="/admin/leads">Interessados no NuFlow →</Link><Link href="/comecar">Página de captura ↗</Link></div>

      {isLoading ? <p role="status">Carregando empresas…</p> : error ? <div role="alert">Não foi possível carregar as empresas. <button onClick={() => mutate()}>Tentar novamente</button></div> : <>
        <section className={styles.metrics} aria-label="Resumo das empresas">
          <article><p>Empresas</p><strong>{orgs.length}</strong><small>Espaços cadastrados</small></article>
          <article><p>Ativas</p><strong>{orgs.filter(o => o.ativo).length}</strong><small>Acesso habilitado</small></article>
          <article><p>Desligadas</p><strong>{orgs.filter(o => !o.ativo).length}</strong><small>Acesso desabilitado</small></article>
          <article><p>Vínculos de pessoas</p><strong>{orgs.reduce((n,o) => n + o._count.membros, 0)}</strong><small>Uma pessoa pode ter mais de um vínculo</small></article>
        </section>
        <h2 className={styles.sectionTitle}>Empresas</h2>
        {orgs.length === 0 && <p>Nenhuma empresa cadastrada.</p>}
      </>}

      <div className="grid gap-3">
        {orgs.map((org) => (
          <div
            key={org.id}
            className={`rounded-xl border p-4 transition-colors ${
              org.ativo ? "border-zinc-800 bg-zinc-900/60" : "border-zinc-800/60 bg-zinc-900/30 opacity-60"
            }`}
          >
            <div className={styles.company}>
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
                <p className="mt-1 text-xs text-zinc-400">
                  Área pública: <Link href={`/c/${org.slug}`} target="_blank" className="text-purple-300 hover:underline"><code>/c/{org.slug}</code></Link>
                </p>
              </div>
              <div className={styles.actions}>
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
                  disabled={alterando !== null}
                  aria-busy={alterando === org.id}
                  aria-label={alterando === org.id ? `Salvando ${org.nome}` : `${org.ativo ? "Desligar" : "Ligar"} empresa ${org.nome}`}
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
    </>
  )
}

function ModalNovaEmpresa({ onClose, onCriada }: { onClose: () => void; onCriada: () => void }) {
  const [nome, setNome] = useState("")
  const [slug, setSlug] = useState("")
  const [adminTexto, setAdminTexto] = useState("")
  const [admin, setAdmin] = useState<PessoaAchada | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    if (!nome.trim() || salvando) return
    setSalvando(true)
    // Escolhida na lista vai pelo id; e-mail digitado sem escolher segue valendo.
    const quem = admin ? { adminUsuarioId: admin.id } : adminTexto.trim() ? { adminEmail: adminTexto.trim() } : {}
    try {
      const res = await fetch("/api/admin/organizacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, ...(slug.trim() ? { slug: slug.trim() } : {}), ...quem }),
      })
      if (!res.ok) throw await erroDaResposta(res)
      const { membership, organizacao } = await res.json()
      toast.success(
        Object.keys(quem).length > 0 && !membership
          ? "Empresa criada — mas essa pessoa não foi achada no sistema. Vincule em Pessoas."
          : `Empresa criada em /c/${organizacao.slug}${admin ? `, com ${admin.nome} como admin` : ""}.`
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
        ajuda="Vira o endereço da área pública da empresa: /c/slug. Só minúsculas, números e hífen."
      />
      <BuscaPessoa
        rotulo="Admin da empresa (opcional)"
        texto={adminTexto}
        onTexto={setAdminTexto}
        escolhida={admin}
        onEscolher={setAdmin}
        ajuda="Digite o nome ou o e-mail de quem já tem conta. Sem ninguém, a empresa nasce vazia."
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
  const { data, mutate, isLoading, error } = useSWR<{ membros: Membro[] }>(`/api/admin/organizacoes/${org.id}/usuarios`, fetcher)
  const [texto, setTexto] = useState("")
  const [pessoa, setPessoa] = useState<PessoaAchada | null>(null)
  const [papel, setPapel] = useState<string>("solicitante")
  const membros = data?.membros ?? []

  async function vincular() {
    if (!pessoa && !texto.trim()) return
    try {
      const res = await fetch(`/api/admin/organizacoes/${org.id}/usuarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(pessoa ? { usuarioId: pessoa.id } : { email: texto.trim() }), papel }),
      })
      if (!res.ok) throw await erroDaResposta(res)
      setTexto("")
      setPessoa(null)
      toast.success(`${pessoa?.nome ?? "Pessoa"} vinculada como ${nomeDoPapel(papel)}.`)
      mutate()
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível vincular."))
    }
  }

  async function desvincular(m: Membro) {
    try {
      const res = await fetch(`/api/admin/organizacoes/${org.id}/usuarios?usuarioId=${encodeURIComponent(m.usuario.id)}`, {
        method: "DELETE",
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
        {isLoading && <p role="status">Carregando pessoas…</p>}
        {error && <div role="alert">Não foi possível carregar as pessoas. <button onClick={() => mutate()}>Tentar novamente</button></div>}
        {!isLoading && !error && membros.length === 0 && <p className="text-sm text-zinc-500">Ninguém vinculado ainda.</p>}
        {membros.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-800/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-200">{m.usuario.nome}</p>
              <p className="truncate text-xs text-zinc-500">{m.usuario.email ?? "sem e-mail"} · {nomeDoPapel(m.papel)}</p>
            </div>
            <button onClick={() => desvincular(m)} aria-label={`Desvincular ${m.usuario.nome}`} title="Desvincular" className="shrink-0 text-zinc-600 hover:text-red-400">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-zinc-800 pt-3">
        <BuscaPessoa
          rotulo="Vincular pessoa"
          texto={texto}
          onTexto={setTexto}
          escolhida={pessoa}
          onEscolher={setPessoa}
          ajuda="Digite o nome ou o e-mail. Vincular não cria login: a pessoa precisa já existir no sistema."
        />
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs text-zinc-500">
            Papel
            <select
              value={papel}
              onChange={(e) => setPapel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
            >
              {PAPEIS.map((p) => <option key={p} value={p}>{nomeDoPapel(p)}</option>)}
            </select>
          </label>
          <button
            onClick={vincular}
            disabled={!pessoa && !texto.trim()}
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
  const { data, mutate, isLoading, error } = useSWR<{ modulos: ModuloDaOrg[] }>(`/api/admin/organizacoes/${org.id}/modulos`, fetcher)
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
      {/* Pergunta que esta tela não respondia: "cadê o audiovisual?". Não é
          módulo — está em toda empresa; o que a pessoa vê depende do papel dela. */}
      <p className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400">
        Sempre ligados, em toda empresa: Demandas, Gravações Externas e Aprovações do audiovisual.
        Os avisos por WhatsApp não dependem de Mensagens: a empresa conecta o número dela em
        Configurações → WhatsApp.
      </p>
      <div className="space-y-2">
        {isLoading && <p role="status">Carregando módulos…</p>}
        {error && <div role="alert">Não foi possível carregar os módulos. <button onClick={() => mutate()}>Tentar novamente</button></div>}
        {!isLoading && !error && modulos.length === 0 && <p>Nenhum módulo disponível.</p>}
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
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current
    element?.showModal()
    return () => { element?.close(); previous?.focus() }
  }, [])
  return (
    <dialog ref={dialog} aria-labelledby={titleId} className={styles.dialog}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(e => e.getClientRects().length > 0)
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
      } }}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-medium text-zinc-100">{titulo}</h2>
          <button autoFocus aria-label="Fechar" onClick={onClose} className={styles.close}><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

// Procurar quem já tem conta enquanto digita. Antes os dois campos pediam o
// e-mail exato, sem dizer se ele existia — e o Giovani precisava saber de cor o
// e-mail do Gabriel para fazê-lo admin da GH Produção.
//
// A lista fica no fluxo do diálogo (não flutua): um <dialog> corta o que passa
// da borda, e a lista é curta. O e-mail digitado sem escolher ainda vale — o
// servidor procura por ele.
function BuscaPessoa({ rotulo, ajuda, texto, onTexto, escolhida, onEscolher }: {
  rotulo: string
  ajuda?: string
  texto: string
  onTexto: (v: string) => void
  escolhida: PessoaAchada | null
  onEscolher: (p: PessoaAchada | null) => void
}) {
  const idLista = useId()
  const idAjuda = useId()
  const [termo, setTermo] = useState("")
  const [aberta, setAberta] = useState(false)
  const [ativo, setAtivo] = useState(0)

  // Espera a pessoa parar de digitar antes de perguntar ao servidor.
  useEffect(() => {
    const t = setTimeout(() => setTermo(texto.trim()), 250)
    return () => clearTimeout(t)
  }, [texto])

  const chave = !escolhida && termo.length >= 2 ? `/api/admin/usuarios?busca=${encodeURIComponent(termo)}` : null
  const { data, error, isLoading } = useSWR<{ usuarios: PessoaAchada[] }>(chave, fetcher, { keepPreviousData: true })
  const achados = data?.usuarios ?? []
  const mostrar = aberta && !!chave

  function escolher(p: PessoaAchada) {
    onEscolher(p)
    onTexto(p.email ?? p.nome)
    setAberta(false)
  }

  if (escolhida) {
    return (
      <div className="text-xs text-zinc-500">
        {rotulo}
        <div className="mt-1 flex items-start justify-between gap-2 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-zinc-100">{escolhida.nome}</p>
            <p className="truncate text-xs text-zinc-400">{escolhida.email ?? "sem e-mail"}</p>
            {escolhida.empresas.length > 0 && (
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                {escolhida.empresas.map((e) => `${e.nome} (${nomeDoPapel(e.papel)})`).join(" · ")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { onEscolher(null); onTexto("") }}
            aria-label={`Trocar ${escolhida.nome}`}
            title="Trocar"
            className="shrink-0 text-zinc-500 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="text-xs text-zinc-500">
      <label>
        {rotulo}
        <input
          role="combobox"
          aria-expanded={mostrar}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-describedby={ajuda ? idAjuda : undefined}
          aria-activedescendant={mostrar && achados[ativo] ? `${idLista}-${achados[ativo].id}` : undefined}
          value={texto}
          onChange={(e) => { onTexto(e.target.value); setAberta(true); setAtivo(0) }}
          onFocus={() => setAberta(true)}
          onBlur={() => setAberta(false)}
          onKeyDown={(e) => {
            if (!mostrar) return
            // Esc fecha a lista, não o diálogo.
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setAberta(false); return }
            if (achados.length === 0) return
            if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((i) => (i + 1) % achados.length) }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((i) => (i - 1 + achados.length) % achados.length) }
            else if (e.key === "Enter") { e.preventDefault(); escolher(achados[ativo] ?? achados[0]) }
          }}
          placeholder="nome ou e-mail"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
      </label>
      {mostrar && (
        <div className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900">
          {isLoading && achados.length === 0 && <p role="status" className="px-3 py-2 text-xs text-zinc-500">Procurando…</p>}
          {error && <p role="alert" className="px-3 py-2 text-xs text-red-400">Não foi possível buscar. Tente de novo.</p>}
          {!isLoading && !error && achados.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-500">Ninguém ativo com esse nome ou e-mail.</p>
          )}
          <ul id={idLista} role="listbox" aria-label={rotulo} className="max-h-56 overflow-y-auto">
            {achados.map((p, i) => (
              <li
                key={p.id}
                id={`${idLista}-${p.id}`}
                role="option"
                aria-selected={i === ativo}
                // mousedown, e não click: o blur do campo fecharia a lista antes.
                onMouseDown={(e) => { e.preventDefault(); escolher(p) }}
                onMouseEnter={() => setAtivo(i)}
                className={`cursor-pointer px-3 py-2 ${i === ativo ? "bg-zinc-800" : ""}`}
              >
                <p className="truncate text-sm text-zinc-200">{p.nome}</p>
                <p className="truncate text-xs text-zinc-500">
                  {p.email ?? "sem e-mail"}
                  {p.empresas.length > 0 && ` · ${p.empresas.map((e) => `${e.nome} (${nomeDoPapel(e.papel)})`).join(", ")}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ajuda && <span id={idAjuda} className="mt-1 block text-[11px] text-zinc-600">{ajuda}</span>}
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
