// Rede de profissionais: o score que uma empresa vê antes de contratar.
//
// O que vale aqui é o que a Política de Avaliações e os Termos do Profissional
// prometem (src/lib/juridico, Onda 3):
//   - outras empresas veem só a MÉDIA das notas e a QUANTIDADE de avaliações,
//     além de cidade e áreas de atuação. Sem comentário, sem nota a nota, sem o
//     nome de quem avaliou e sem o contato do profissional;
//   - a média é dos últimos 24 meses e só aparece a partir de 3 avaliações.
//     Antes disso, "Novo na rede";
//   - nota contestada sai da média enquanto a Plataforma analisa;
//   - o COMENTÁRIO é da empresa que contratou e do profissional avaliado.
//
// A conta mora no banco (função score_rede), porque sob RLS cada empresa só
// enxerga as próprias avaliações, e a média é da rede inteira. A função devolve
// só número.
import { Prisma } from "@prisma/client"
import { prisma, prismaBase } from "@/lib/prisma"
import { scoreExibivel, type ScoreRede } from "@/lib/rede-score"

export { MINIMO_AVALIACOES_REDE, scoreExibivel, textoScore, type ScoreRede } from "@/lib/rede-score"

export type TipoProfissional = "videomaker" | "editor"

const SEM_AVALIACAO: ScoreRede = { media: null, avaliacoes: 0 }

/** Score da rede de vários profissionais de uma vez. Quem não tem nota volta "novo". */
export async function scoresDaRede(tipo: TipoProfissional, ids: string[]): Promise<Map<string, ScoreRede>> {
  const mapa = new Map<string, ScoreRede>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const linhas = await prismaBase.$queryRaw<{ id: string; media: number | null; avaliacoes: number }[]>`
    SELECT id, media, avaliacoes FROM public.score_rede(${tipo}, ${unicos}::text[])
  `
  for (const l of linhas) mapa.set(l.id, scoreExibivel(l.media, Number(l.avaliacoes)))
  for (const id of unicos) if (!mapa.has(id)) mapa.set(id, SEM_AVALIACAO)
  return mapa
}

export async function scoreDaRede(tipo: TipoProfissional, id: string): Promise<ScoreRede> {
  return (await scoresDaRede(tipo, [id])).get(id) ?? SEM_AVALIACAO
}

// ── Comentários: só os da empresa que contratou ─────────────────────────────
//
// Uma avaliação é DESTA empresa quando a linha tem o dono dela, ou quando nasceu
// sem dono pelo convite de um serviço DESTA empresa (a avaliação por convite
// guarda o serviço, e o serviço tem empresa). Avaliação antiga sem dono e sem
// serviço não é de empresa nenhuma: a nota fica na média, o comentário fica só
// com o profissional.
//
// Avaliação removida pela contestação some também da lista da empresa.

type LinhaAvaliacao = { id: string; organizacaoId: string | null; demandaId: string | null }

async function daEmpresa<T extends LinhaAvaliacao>(linhas: T[], organizacaoId: string): Promise<T[]> {
  const semDono = [...new Set(linhas.filter(l => !l.organizacaoId && l.demandaId).map(l => l.demandaId as string))]
  const servicosDaEmpresa = semDono.length
    ? new Set((await prisma.demanda.findMany({ where: { id: { in: semDono }, organizacaoId }, select: { id: true } })).map(d => d.id))
    : new Set<string>()
  return linhas.filter(l => l.organizacaoId === organizacaoId || (!l.organizacaoId && !!l.demandaId && servicosDaEmpresa.has(l.demandaId)))
}

const ONDE_VISIVEL = (organizacaoId: string) => ({
  removidaEm: null,
  OR: [{ organizacaoId }, { organizacaoId: null, demandaId: { not: null } }],
})

export async function avaliacoesVideomakerDaEmpresa(videomakerId: string, organizacaoId: string, take = 50) {
  const linhas = await prisma.avaliacaoVideomaker.findMany({
    where: { videomakerId, ...ONDE_VISIVEL(organizacaoId) },
    orderBy: { createdAt: "desc" },
    take: take * 2,
    select: { id: true, nota: true, comentario: true, origem: true, demandaId: true, organizacaoId: true, createdAt: true },
  })
  return (await daEmpresa(linhas, organizacaoId)).slice(0, take).map(semDono)
}

export async function avaliacoesEditorDaEmpresa(editorId: string, organizacaoId: string, take = 50) {
  const linhas = await prisma.avaliacaoEditor.findMany({
    where: { editorId, ...ONDE_VISIVEL(organizacaoId) },
    orderBy: { createdAt: "desc" },
    take: take * 2,
    select: {
      id: true, nota: true, comentario: true, origem: true, demandaId: true, organizacaoId: true, createdAt: true,
      atendeuDemandas: true, foiAtencioso: true, contratariaNovamente: true,
    },
  })
  return (await daEmpresa(linhas, organizacaoId)).slice(0, take).map(semDono)
}

// O id da empresa e o do serviço não vão para a tela: a lista não diz quem
// avaliou (Onda 3, "o editor não vê quem avaliou"); servem só ao filtro acima.
function semDono<T extends { organizacaoId: string | null; demandaId: string | null }>(l: T): Omit<T, "organizacaoId" | "demandaId"> {
  const { organizacaoId: _o, demandaId: _d, ...resto } = l
  return resto
}

// ── O profissional logado ───────────────────────────────────────────────────

export type ProfissionalDaSessao = { tipo: TipoProfissional; id: string; nome: string; naRede: boolean }

/** O videomaker (ou editor) ligado ao usuário logado. É daqui, e só daqui, que sai o id passado às funções da rede. */
export async function profissionalDaSessao(usuarioId: string): Promise<ProfissionalDaSessao | null> {
  const vm = await prisma.videomaker.findUnique({ where: { usuarioId }, select: { id: true, nome: true, naRede: true } })
  if (vm) return { tipo: "videomaker", id: vm.id, nome: vm.nome, naRede: vm.naRede }
  const ed = await prisma.editor.findUnique({ where: { usuarioId }, select: { id: true, nome: true } })
  if (ed) return { tipo: "editor", id: ed.id, nome: ed.nome, naRede: true }
  return null
}

export type AvaliacaoDoProfissional = {
  id: string
  nota: number
  comentario: string | null
  createdAt: Date
  empresa: string | null
  removidaEm: Date | null
  contestacaoStatus: "em_analise" | "mantida" | "removida" | null
  contestacaoDecisao: string | null
  contestacoes: number
}

export async function avaliacoesDoProfissional(p: Pick<ProfissionalDaSessao, "tipo" | "id">): Promise<AvaliacaoDoProfissional[]> {
  return prismaBase.$queryRaw<AvaliacaoDoProfissional[]>`
    SELECT * FROM public.avaliacoes_do_profissional(${p.tipo}, ${p.id})
  `
}

const MSG_CONTESTACAO: Record<string, string> = {
  nao_encontrada: "Avaliação não encontrada.",
  removida: "Esta avaliação já foi removida.",
  em_analise: "Esta avaliação já está em análise.",
  limite: "Esta avaliação já teve as duas análises previstas na Política.",
}

/** Abre a contestação. Devolve a mensagem de erro, ou null quando deu certo. */
export async function contestarAvaliacao(p: Pick<ProfissionalDaSessao, "tipo" | "id">, avaliacaoId: string, motivo: string): Promise<string | null> {
  try {
    await prismaBase.$queryRaw`SELECT public.contestar_avaliacao(${p.tipo}, ${avaliacaoId}, ${p.id}, ${motivo}) AS id`
    return null
  } catch (e) {
    const texto = e instanceof Error ? e.message : String(e)
    const codigo = texto.match(/contestacao:([a-z_]+)/)?.[1]
    if (codigo && MSG_CONTESTACAO[codigo]) return MSG_CONTESTACAO[codigo]
    if (e instanceof Prisma.PrismaClientKnownRequestError || /check constraint/.test(texto)) return "Explique o motivo em pelo menos 10 caracteres."
    throw e
  }
}

export async function definirParticipacaoRede(videomakerId: string, naRede: boolean): Promise<boolean> {
  const linhas = await prismaBase.$queryRaw<{ naRede: boolean | null }[]>`
    SELECT public.definir_participacao_rede(${videomakerId}, ${naRede}) AS "naRede"
  `
  return linhas[0]?.naRede ?? naRede
}

export type ConviteRedeRecebido = { id: string; empresa: string; mensagem: string | null; createdAt: Date }

export async function convitesRedeDoProfissional(videomakerId: string): Promise<ConviteRedeRecebido[]> {
  return prismaBase.$queryRaw<ConviteRedeRecebido[]>`
    SELECT * FROM public.convites_rede_do_profissional(${videomakerId})
  `
}

/** "aceito" | "recusado", ou null se o convite não é dele ou já foi respondido. */
export async function responderConviteRede(conviteId: string, videomakerId: string, aceitar: boolean): Promise<string | null> {
  const linhas = await prismaBase.$queryRaw<{ status: string | null }[]>`
    SELECT public.responder_convite_rede(${conviteId}, ${videomakerId}, ${aceitar}) AS status
  `
  return linhas[0]?.status ?? null
}
