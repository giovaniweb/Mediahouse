import type { Prisma, StatusInterno, StatusVisivel } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { COLUNAS_LABEL, COLUNAS_ORDER, STATUS_PARA_COLUNA, estaAtrasada } from "@/lib/status"
import { dataCalendario, dataEmSaoPaulo } from "@/lib/datas"

// Demandas lidas pelo MCP (/api/mcp). Quem chama é um cliente externo com o
// token da empresa, então o recorte é estreito de propósito: o pedido e o
// briefing. Nada de dinheiro (custos, notas fiscais, valores), de contato
// pessoal (telefones, e-mails, cliente final) nem de links de material.

/** Argumento que o cliente MCP mandou errado: volta como texto para ele corrigir. */
export class ArgumentoInvalido extends Error {}

export const LIMITE_PADRAO = 50
export const LIMITE_MAXIMO = 100
const BRIEFING_NA_LISTA = 600

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

export async function listarDemandas(organizacaoId: string, filtros: FiltrosListagem) {
  if (!organizacaoId) throw new Error("organizacaoId é obrigatório")
  const statusWhere = whereDoStatus(filtros.status)
  const limite = Math.min(Math.max(Math.trunc(filtros.limite ?? LIMITE_PADRAO) || LIMITE_PADRAO, 1), LIMITE_MAXIMO)

  return comOrg(organizacaoId, async () => {
    let editores: { id: string; nome: string }[] | null = null
    if (filtros.editor?.trim()) {
      // Só editores que já trabalharam em demanda desta empresa: o cadastro de
      // editor é global, e a lista de sugestões não pode mostrar o de outra.
      const daEmpresa = await prisma.editor.findMany({
        where: { demandas: { some: { organizacaoId } } },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      })
      editores = daEmpresa.filter((e) => editorCasa(e.nome, filtros.editor!))
      if (!editores.length) {
        throw new ArgumentoInvalido(
          `Nenhum editor desta empresa corresponde a "${filtros.editor}". Editores: ${daEmpresa.map((e) => e.nome).join(", ") || "nenhum"}.`
        )
      }
    }

    const where: Prisma.DemandaWhereInput = {
      organizacaoId,
      ...statusWhere,
      ...(editores ? { editorId: { in: editores.map((e) => e.id) } } : {}),
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

/** Demanda pelo id ou pelo código, só desta empresa, com o briefing inteiro. */
export async function lerDemanda(organizacaoId: string, idOuCodigo: string) {
  if (!organizacaoId) throw new Error("organizacaoId é obrigatório")
  const chave = idOuCodigo?.trim()
  if (!chave) throw new ArgumentoInvalido("Informe o id ou o código da demanda.")

  const d = await comOrg(organizacaoId, () =>
    prisma.demanda.findFirst({
      where: { organizacaoId, OR: [{ id: chave }, { codigo: chave }] },
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
  )
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
