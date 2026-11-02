import type { Prisma, StatusInterno, StatusVisivel } from "@prisma/client"
import type { Session } from "next-auth"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { oQueAPessoaVe } from "@/lib/escopo-demanda"
import { criarDemanda } from "@/lib/criar-demanda"
import { listarDepartamentos } from "@/lib/departamentos"
import { COLUNAS_LABEL, COLUNAS_ORDER, STATUS_PARA_COLUNA, estaAtrasada } from "@/lib/status"
import { dataCalendario, dataEmSaoPaulo } from "@/lib/datas"

// Demandas pelo MCP (/api/mcp), com a chave de UMA pessoa (lib/mcp-token.ts).
// O assistente age como ela: lê o que ela vê no quadro (oQueAPessoaVe) e cria
// pelas regras dela (criarDemanda, o mesmo código da tela). O recorte de saída
// é estreito de propósito: o pedido e o briefing. Nada de dinheiro (custos,
// notas fiscais, valores), de contato pessoal (telefones, e-mails, cliente
// final) nem de links de material.

/** Argumento que o cliente MCP mandou errado: volta como texto para ele corrigir. */
export class ArgumentoInvalido extends Error {}

/** Quem está do outro lado: a pessoa da chave, na empresa da chave. */
export type QuemPergunta = { organizacaoId: string; sessao: Session; tokenId: string }

export const LIMITE_PADRAO = 50
export const LIMITE_MAXIMO = 100
const BRIEFING_NA_LISTA = 600
/** Freios da criação, além do limite por minuto da rota: IA em laço para aqui. */
export const CRIADAS_POR_DIA = 30
const MINUTOS_TITULO_REPETIDO = 10

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}
function palavras(s: string): string[] {
  return normalizar(s).split(/[^a-z0-9]+/).filter(Boolean)
}

/**
 * O editor da busca é este? Aceita parte do nome ("Cristiano", "Drumm") e
 * também o nome com complemento ("Cristiano Drummond - reels"): casa quando
 * cada palavra da busca começa uma palavra do nome, ou quando todas as
 * palavras do nome aparecem na busca. Palavra inteira, não trecho solto —
 * senão "Ana" casaria com "Mariana".
 */
export function editorCasa(nome: string, busca: string): boolean {
  const n = palavras(nome), b = palavras(busca)
  if (!n.length || !b.length) return false
  return b.every((p) => n.some((w) => w.startsWith(p))) || n.every((w) => b.includes(w))
}

const STATUS_INTERNOS = Object.keys(STATUS_PARA_COLUNA) as StatusInterno[]

/**
 * Sem status = só as abertas (tudo fora de Finalizado). "todas" tira o filtro.
 * Aceita a coluna do quadro pelo código ou pelo rótulo ("edicao", "Edição",
 * "Para Postar") e também o status interno ("editando", "fila_edicao").
 */
export function whereDoStatus(status?: string | null): Prisma.DemandaWhereInput {
  const s = normalizar(status ?? "").replace(/\s+/g, "_")
  if (!s || s === "abertas") return { statusVisivel: { not: "finalizado" } }
  if (s === "todas") return {}
  if ((COLUNAS_ORDER as string[]).includes(s)) return { statusVisivel: s as StatusVisivel }
  if ((STATUS_INTERNOS as string[]).includes(s)) return { statusInterno: s as StatusInterno }
  throw new ArgumentoInvalido(
    `Status desconhecido: "${status}". Use "abertas" (padrão), "todas", uma coluna (${COLUNAS_ORDER.join(", ")}) ou um status interno (${STATUS_INTERNOS.join(", ")}).`
  )
}

const SELECT_BASE = {
  id: true,
  codigo: true,
  titulo: true,
  descricao: true,
  statusVisivel: true,
  statusInterno: true,
  dataLimite: true,
  nomeSolicitante: true,
  solicitante: { select: { nome: true } },
  editor: { select: { nome: true } },
  produtos: { select: { produto: { select: { nome: true } } } },
} satisfies Prisma.DemandaSelect

type DemandaBase = Prisma.DemandaGetPayload<{ select: typeof SELECT_BASE }>

function resumo(d: DemandaBase) {
  return {
    id: d.id,
    codigo: d.codigo,
    titulo: d.titulo,
    equipamentos: d.produtos.map((p) => p.produto.nome),
    status: COLUNAS_LABEL[d.statusVisivel],
    statusInterno: d.statusInterno,
    prazo: d.dataLimite ? dataCalendario(d.dataLimite) : null,
    atrasada: estaAtrasada(d),
    abertoPor: d.solicitante.nome,
    // Quem pediu de fato, quando não foi quem cadastrou (pedido por WhatsApp).
    solicitante: d.nomeSolicitante && d.nomeSolicitante !== d.solicitante.nome ? d.nomeSolicitante : null,
    editor: d.editor?.nome ?? null,
  }
}

export interface FiltrosListagem {
  editor?: string | null
  status?: string | null
  limite?: number | null
}

export async function listarDemandas(quem: QuemPergunta, filtros: FiltrosListagem) {
  const { organizacaoId } = quem
  const statusWhere = whereDoStatus(filtros.status)
  const limite = Math.min(Math.max(Math.trunc(filtros.limite ?? LIMITE_PADRAO) || LIMITE_PADRAO, 1), LIMITE_MAXIMO)

  return comOrg(organizacaoId, async () => {
    const escopo = await oQueAPessoaVe(quem.sessao, organizacaoId)
    let editores: { id: string; nome: string }[] | null = null
    if (filtros.editor?.trim()) {
      // Só editores de demandas que a pessoa vê: o cadastro de editor é global,
      // e a lista de sugestões não pode mostrar o de outra empresa.
      const visiveis = await prisma.editor.findMany({
        where: { demandas: { some: escopo } },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      })
      editores = visiveis.filter((e) => editorCasa(e.nome, filtros.editor!))
      if (!editores.length) {
        throw new ArgumentoInvalido(
          `Nenhum editor corresponde a "${filtros.editor}". Editores: ${visiveis.map((e) => e.nome).join(", ") || "nenhum"}.`
        )
      }
    }

    const where: Prisma.DemandaWhereInput = {
      AND: [escopo, statusWhere, ...(editores ? [{ editorId: { in: editores.map((e) => e.id) } }] : [])],
    }
    const abertas = "statusVisivel" in statusWhere && typeof statusWhere.statusVisivel === "object"
    const [total, demandas] = await Promise.all([
      prisma.demanda.count({ where }),
      prisma.demanda.findMany({
        where,
        select: SELECT_BASE,
        // Abertas: o que vence primeiro. Finalizadas ou todas: o mais recente.
        orderBy: abertas
          ? [{ dataLimite: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]
          : [{ updatedAt: "desc" }],
        take: limite,
      }),
    ])

    return {
      total,
      mostrando: demandas.length,
      ...(editores ? { editores: editores.map((e) => e.nome) } : {}),
      demandas: demandas.map((d) => {
        const briefing = d.descricao ?? ""
        const cortado = briefing.length > BRIEFING_NA_LISTA
        return {
          ...resumo(d),
          briefing: cortado ? `${briefing.slice(0, BRIEFING_NA_LISTA)}…` : briefing,
          briefingCortado: cortado,
        }
      }),
    }
  })
}

// Chaves de `detalhesEntrega` que parecem dinheiro. Os formulários de hoje não
// têm nenhuma, mas o Json aceita qualquer chave e o MCP não pode deixar passar.
const PARECE_DINHEIRO = /valor|pre[cç]o|or[cç]amento|verba|invest|custo|pagamento|fiscal|cach[eê]|r\$/i

function detalhesSemDinheiro(json: Prisma.JsonValue | null): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {}
  const out: Record<string, string> = {}
  for (const [chave, valor] of Object.entries(json)) {
    if (typeof valor === "string" && valor.trim() && !PARECE_DINHEIRO.test(chave)) out[chave] = valor
  }
  return out
}

/** Demanda pelo id ou pelo código, se a pessoa a vê, com o briefing inteiro. */
export async function lerDemanda(quem: QuemPergunta, idOuCodigo: string) {
  const { organizacaoId } = quem
  const chave = idOuCodigo?.trim()
  if (!chave) throw new ArgumentoInvalido("Informe o id ou o código da demanda.")

  const d = await comOrg(organizacaoId, async () => {
    const escopo = await oQueAPessoaVe(quem.sessao, organizacaoId)
    return prisma.demanda.findFirst({
      where: { AND: [escopo, { OR: [{ id: chave }, { codigo: chave }] }] },
      select: {
        ...SELECT_BASE,
        area: true,
        departamento: true,
        tipoVideo: true,
        formato: true,
        prioridade: true,
        motivoUrgencia: true,
        campanha: true,
        objetivo: true,
        plataforma: true,
        publico: true,
        mensagemPrincipal: true,
        referencia: true,
        detalhesEntrega: true,
        cidade: true,
        dataCaptacao: true,
        dataPostagem: true,
        createdAt: true,
        linhaProjeto: true,
        linhaProjetoRef: { select: { nome: true } },
        videomaker: { select: { nome: true } },
        designer: { select: { nome: true } },
      },
    })
  })
  // Fora do escopo responde igual a inexistente: "sem permissão" contaria que existe.
  if (!d) throw new ArgumentoInvalido(`Demanda não encontrada: ${chave}`)

  return {
    ...resumo(d),
    briefing: d.descricao ?? "",
    detalhes: detalhesSemDinheiro(d.detalhesEntrega),
    area: d.area,
    departamento: d.departamento,
    tipoVideo: d.tipoVideo,
    formato: d.formato,
    linha: d.linhaProjetoRef?.nome ?? d.linhaProjeto,
    prioridade: d.prioridade,
    motivoUrgencia: d.motivoUrgencia,
    campanha: d.campanha,
    objetivo: d.objetivo,
    plataforma: d.plataforma,
    publico: d.publico,
    mensagemPrincipal: d.mensagemPrincipal,
    referencia: d.referencia,
    cidade: d.cidade,
    videomaker: d.videomaker?.nome ?? null,
    designer: d.designer?.nome ?? null,
    dataCaptacao: d.dataCaptacao?.toISOString() ?? null,
    // Gravada como o instante em que foi postado, não como dia: o dia é o de São Paulo.
    dataPostagem: d.dataPostagem ? dataEmSaoPaulo(d.dataPostagem) : null,
    criadaEm: d.createdAt.toISOString(),
  }
}

export const FORMATOS = ["9:16", "16:9", "1:1"] as const

/** O que o formulário de "Novo pedido" oferece, para o assistente não chutar valor. */
export async function opcoesParaCriar(quem: QuemPergunta) {
  const { organizacaoId } = quem
  return comOrg(organizacaoId, async () => {
    const [departamentos, tipos, produtos] = await Promise.all([
      listarDepartamentos(organizacaoId),
      prisma.configParametro.findMany({
        where: { organizacaoId, grupo: "tipos_video", ativo: true },
        orderBy: [{ ordem: "asc" }, { label: "asc" }],
        select: { valor: true, label: true },
      }),
      prisma.produto.findMany({ where: { organizacaoId, ativo: true }, orderBy: { nome: "asc" }, select: { nome: true } }),
    ])
    return {
      departamentos,
      tiposDeVideo: tipos,
      equipamentos: produtos.map((p) => p.nome),
      formatos: FORMATOS,
      prioridades: ["normal", "alta", "urgente"],
      areas: ["audiovisual", "design"],
    }
  })
}

export interface EntradaCriacao {
  titulo: string
  briefing: string
  departamento: string
  tipo: string
  cidade?: string | null
  prazo?: string | null
  prioridade?: string | null
  motivoUrgencia?: string | null
  area?: string | null
  formato?: string | null
  objetivo?: string | null
  mensagemPrincipal?: string | null
  referencia?: string | null
  plataforma?: string | null
  publico?: string | null
  equipamentos?: string[] | null
}

/**
 * Cria a demanda como a pessoa da chave, pelo mesmo código da tela: aprovação
 * pelo papel dela (lib/quem-aprova.ts), os mesmos avisos, o mesmo histórico —
 * que ainda diz "pelo assistente (MCP)". A demanda nasce marcada com a chave,
 * para poder ser desfeita em Configurações → Assistentes (MCP).
 */
export async function criarDemandaPeloAssistente(quem: QuemPergunta, e: EntradaCriacao) {
  const { organizacaoId, tokenId } = quem
  const titulo = (e.titulo ?? "").trim()

  return comOrg(organizacaoId, async () => {
    const agora = Date.now()
    const [noDia, repetida] = await Promise.all([
      prisma.demanda.count({ where: { mcpTokenId: tokenId, createdAt: { gte: new Date(agora - 24 * 3600_000) } } }),
      titulo
        ? prisma.demanda.findFirst({
            where: {
              mcpTokenId: tokenId,
              createdAt: { gte: new Date(agora - MINUTOS_TITULO_REPETIDO * 60_000) },
              titulo: { equals: titulo, mode: "insensitive" },
            },
            select: { codigo: true },
          })
        : null,
    ])
    if (noDia >= CRIADAS_POR_DIA) {
      throw new ArgumentoInvalido(`Este assistente já criou ${CRIADAS_POR_DIA} demandas nas últimas 24 horas, o limite. Peça para criar pela tela do NuFlow.`)
    }
    if (repetida) {
      throw new ArgumentoInvalido(
        `O assistente já criou "${titulo}" (${repetida.codigo}) há menos de ${MINUTOS_TITULO_REPETIDO} minutos. Se for mesmo outra demanda, mude o título.`
      )
    }

    // Equipamento pelo nome, como aparece no formulário: só os ativos da empresa.
    let produtoIds: string[] | undefined
    if (e.equipamentos?.length) {
      const ativos = await prisma.produto.findMany({ where: { organizacaoId, ativo: true }, select: { id: true, nome: true } })
      const faltando: string[] = []
      produtoIds = []
      for (const nome of e.equipamentos) {
        const p = ativos.find((a) => normalizar(a.nome) === normalizar(nome))
        if (p) produtoIds.push(p.id)
        else faltando.push(nome)
      }
      if (faltando.length) {
        throw new ArgumentoInvalido(`Equipamento não encontrado: ${faltando.join(", ")}. Os nomes aceitos estão em opcoes_para_criar.`)
      }
    }

    const resposta = await criarDemanda(quem.sessao, organizacaoId, {
      titulo,
      descricao: e.briefing,
      departamento: e.departamento,
      tipoVideo: e.tipo,
      // O formulário público grava "N/A" quando não há cidade; o assistente também.
      cidade: e.cidade?.trim() || "N/A",
      prioridade: e.prioridade ?? undefined,
      motivoUrgencia: e.motivoUrgencia ?? undefined,
      dataLimite: e.prazo ?? undefined,
      area: e.area ?? undefined,
      formato: e.formato ?? undefined,
      objetivo: e.objetivo ?? undefined,
      mensagemPrincipal: e.mensagemPrincipal ?? undefined,
      referencia: e.referencia ?? undefined,
      plataforma: e.plataforma ?? undefined,
      publico: e.publico ?? undefined,
      produtoIds,
    }, { mcpTokenId: tokenId })
    const corpo = await resposta.json()
    if (resposta.status >= 400) {
      const campos = corpo.campos ? Object.entries(corpo.campos as Record<string, string>).map(([c, m]) => `${c}: ${m}`).join("; ") : ""
      throw new ArgumentoInvalido(campos || corpo.error || "Não foi possível criar a demanda.")
    }
    const statusInterno = corpo.statusInterno as StatusInterno
    return {
      id: corpo.id as string,
      codigo: corpo.codigo as string,
      titulo: corpo.titulo as string,
      status: COLUNAS_LABEL[corpo.statusVisivel as StatusVisivel],
      statusInterno,
      aguardaAprovacao: statusInterno === "aguardando_aprovacao_interna" || statusInterno === "urgencia_pendente_aprovacao",
    }
  })
}
