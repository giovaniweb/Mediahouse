// Pessoas & Acessos — as dimensões que a tela mostra, derivadas do que o banco
// já guarda. Nada aqui é campo novo: Vínculo, Nível e Perfil de acesso são
// leituras de `categoria`, `papel/tipo` e `liderAudiovisual`.
//
// O motivo de existir este arquivo: a tabela, o painel lateral e a aba de
// perfis precisam concordar sobre o que é um "Líder". Quando cada um derivava
// por conta própria, a mesma pessoa aparecia como Líder na linha e Executor no
// painel — o tipo de divergência que faz o usuário parar de confiar na tela.

export interface PessoaLista {
  id: string
  nome: string
  email: string | null
  telefone?: string | null
  avatarUrl?: string | null
  tipo: string
  status: string
  createdAt: string
  categoria?: string | null
  funcaoProfissional?: string | null
  areas?: string[]
  liderAudiovisual?: boolean
  /** Recebe todo aviso da operação no WhatsApp, independente do cargo. */
  recebeTodosAvisos?: boolean
  ultimaAtividade?: string | null
}

// ─── Vínculo ─────────────────────────────────────────────────────────────────
// Quem está na casa x quem é de fora. Solicitante é interno: pede demanda de
// dentro da empresa.
//
// A chave é "externo", não "parceiro": o vocabulário da casa é videomaker
// interno / videomaker externo, e sinônimo que mora no código volta para a tela
// mais cedo ou mais tarde.

export type Vinculo = "interno" | "externo" | "sistema"

export function vinculoDe(p: Pick<PessoaLista, "categoria">): Vinculo {
  const c = p.categoria ?? "interna"
  if (c === "externo") return "externo"
  if (c === "sistema") return "sistema"
  return "interno"
}

export const VINCULO_LABEL: Record<Vinculo, string> = {
  interno: "Interno",
  externo: "Externo",
  sistema: "Sistema",
}

export const VINCULO_COR: Record<Vinculo, string> = {
  interno: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  externo: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  sistema: "bg-zinc-500/10 text-zinc-400 border-zinc-700",
}

// ─── Nível ───────────────────────────────────────────────────────────────────
// Quanta autoridade a pessoa tem, em quatro degraus. Vem do papel na
// organização — não é um campo que alguém preenche à mão e esquece.

export type Nivel = "supervisor" | "lider" | "executor" | "solicitante"

export function nivelDe(p: Pick<PessoaLista, "tipo" | "liderAudiovisual">): Nivel {
  if (p.tipo === "admin") return "supervisor"
  if (p.tipo === "gestor" || p.liderAudiovisual) return "lider"
  if (p.tipo === "solicitante") return "solicitante"
  return "executor"
}

export const NIVEL_LABEL: Record<Nivel, string> = {
  supervisor: "Supervisor",
  lider: "Líder",
  executor: "Executor",
  solicitante: "Solicitante",
}

export const NIVEL_COR: Record<Nivel, string> = {
  supervisor: "bg-zinc-800 text-zinc-200 border-zinc-700",
  lider: "bg-zinc-800 text-zinc-200 border-zinc-700",
  executor: "bg-zinc-800/60 text-zinc-400 border-zinc-700",
  solicitante: "bg-zinc-800/60 text-zinc-400 border-zinc-700",
}

export const NIVEIS: Nivel[] = ["supervisor", "lider", "executor", "solicitante"]

// ─── Perfil de acesso ────────────────────────────────────────────────────────
// O que a pessoa enxerga no sistema. Um perfil por pessoa, derivado do papel:
// a lista da aba "Perfis de acesso" e a coluna ACESSO leem daqui.

export type PerfilAcesso =
  | "administrador" | "gestor" | "lider" | "executor" | "executor_ext" | "solicitante"

export function perfilDe(p: Pick<PessoaLista, "tipo" | "categoria" | "liderAudiovisual">): PerfilAcesso {
  if (p.tipo === "admin") return "administrador"
  if (p.tipo === "gestor") return "gestor"
  if (p.liderAudiovisual) return "lider"
  if (p.tipo === "solicitante") return "solicitante"
  if (vinculoDe(p) === "externo") return "executor_ext"
  return "executor"
}

export const PERFIL_LABEL: Record<PerfilAcesso, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  lider: "Líder",
  executor: "Executor",
  executor_ext: "Executor Ext.",
  solicitante: "Solicitante",
}

export const PERFIL_DESCRICAO: Record<PerfilAcesso, string> = {
  administrador: "Acesso total ao sistema.",
  gestor: "Gerencia equipe, demandas e aprovações.",
  lider: "Gerencia as demandas da própria equipe.",
  executor: "Trabalha nas demandas atribuídas.",
  executor_ext: "Acesso limitado para videomakers externos.",
  solicitante: "Cria demandas e acompanha solicitações.",
}

export const PERFIL_COR: Record<PerfilAcesso, string> = {
  administrador: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  gestor: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  lider: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
  executor: "bg-zinc-800 text-zinc-300 border-zinc-700",
  executor_ext: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  solicitante: "bg-zinc-800/60 text-zinc-400 border-zinc-700",
}

export const PERFIS: PerfilAcesso[] = [
  "administrador", "gestor", "lider", "executor", "executor_ext", "solicitante",
]

// ─── Equipes (áreas de atuação) ──────────────────────────────────────────────

export const AREA_LABEL: Record<string, string> = {
  audiovisual: "Audiovisual",
  growth: "Growth",
  eventos: "Eventos",
}

export const AREA_PONTO: Record<string, string> = {
  audiovisual: "bg-purple-500",
  growth: "bg-amber-500",
  eventos: "bg-sky-500",
}

export const AREA_ACENTO: Record<string, string> = {
  audiovisual: "text-purple-400 bg-purple-500/10",
  growth: "text-amber-400 bg-amber-500/10",
  eventos: "text-sky-400 bg-sky-500/10",
}

// ─── Função profissional ─────────────────────────────────────────────────────

export const FUNCAO_LABEL: Record<string, string> = {
  social: "Social Media", designer: "Designer", analista_crm: "Analista CRM",
  gestor_trafego: "Gestor de Tráfego", videomaker: "Videomaker", editor: "Videomaker",
  fotografo: "Fotógrafo", atendimento: "Atendimento", copywriter: "Copywriter",
  produtor: "Produtor", coordenador: "Coordenador", gestor: "Gestor",
  admin: "Supervisor", operacao: "Operação", auxiliar_admin: "Auxiliar Admin",
  gestor_eventos: "Gestor de Eventos", solicitante: "Solicitante", outro: "Outro",
}

export function funcaoDe(p: Pick<PessoaLista, "funcaoProfissional" | "tipo">): string | null {
  const f = p.funcaoProfissional?.trim()
  if (!f) return null
  return FUNCAO_LABEL[f] ?? f
}

// ─── Acesso ao sistema ───────────────────────────────────────────────────────
// Sem e-mail não existe login. Na prática hoje todo mundo tem e-mail — por isso
// esta função serve para o aviso no painel da pessoa, e não como número de topo:
// um card que marca zero todo dia não informa nada.

export function temAcesso(p: Pick<PessoaLista, "email">): boolean {
  return !!p.email?.trim()
}

/**
 * Nunca deixou rastro no sistema: nenhuma mudança de status, nenhum comentário.
 *
 * É a conta que se pode desativar sem medo — e o número que substitui o
 * "sem acesso" do desenho, que com os dados reais daria zero sempre.
 */
export function semAtividade(p: Pick<PessoaLista, "ultimaAtividade">): boolean {
  return !p.ultimaAtividade
}

// ─── Iniciais e cor do avatar ────────────────────────────────────────────────

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return "?"
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

const CORES_AVATAR = [
  "bg-purple-500/20 text-purple-300",
  "bg-blue-500/20 text-blue-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-amber-500/20 text-amber-300",
  "bg-pink-500/20 text-pink-300",
  "bg-cyan-500/20 text-cyan-300",
  "bg-indigo-500/20 text-indigo-300",
]

/** Cor estável por pessoa — a mesma pessoa tem sempre o mesmo tom. */
export function corAvatar(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CORES_AVATAR[h % CORES_AVATAR.length]
}

// ─── Última atividade ────────────────────────────────────────────────────────

const FUSO = "America/Sao_Paulo"

function diaSP(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d)
}

/**
 * "Hoje, 16:48" · "Ontem, 20:14" · "12 ago" · "Nunca".
 *
 * Sempre no fuso de São Paulo: às 21h de Brasília o dia em UTC já virou, e a
 * atividade de hoje apareceria como sendo de amanhã.
 */
export function formatarAtividade(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return "Nunca"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "Nunca"

  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO, hour: "2-digit", minute: "2-digit",
  }).format(d)

  const dia = diaSP(d)
  const hoje = diaSP(agora)
  if (dia === hoje) return `Hoje, ${hora}`

  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
  if (dia === diaSP(ontem)) return `Ontem, ${hora}`

  const mesmoAno = dia.slice(0, 4) === hoje.slice(0, 4)
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO, day: "2-digit", month: "short",
    ...(mesmoAno ? {} : { year: "numeric" }),
  }).format(d).replace(".", "")
}
