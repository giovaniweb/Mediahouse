// A regra da cobrança diária a quem PEDIU a demanda (Giovani, 25/11/2026): o
// que é cobrado em qual coluna, as chaves que ligam e desligam e o texto.
//
// Separado de lib/cobranca-solicitante.ts (que agenda na fila) para a validação
// da fila (lib/regras-operacionais.ts) poder perguntar "ainda vale?" sem
// importar quem agenda — e para dar para testar sem banco o que é puro.
import type { Prisma, StatusInterno } from "@prisma/client"
import { DISPONIVEL_NA_PLATAFORMA, PADRAO_MODULOS } from "@/lib/modulos"
import type { EtapaCobranca } from "@/lib/avisos-arte"

/**
 * O que se cobra em cada coluna. Em Aprovação, só o que espera a resposta de
 * quem pediu: o vídeo pronto (edição finalizada, revisão pendente). Ajuste
 * pedido e impedimento também moram na coluna, mas a bola está com a equipe —
 * cobrar quem pediu ali seria cobrar a pessoa errada. Em Para Postar, as duas.
 */
export const STATUS_DA_COBRANCA: Record<EtapaCobranca, readonly StatusInterno[]> = {
  aprovar: ["edicao_finalizada", "revisao_pendente"],
  postar: ["aprovado", "postagem_pendente"],
}
export const TODOS_STATUS_DA_COBRANCA: StatusInterno[] = [...STATUS_DA_COBRANCA.aprovar, ...STATUS_DA_COBRANCA.postar]

/** O nome da regra na fila (regraContexto.regra) e na página de avisos. */
export const REGRA_DA_ETAPA = { aprovar: "cobranca_aprovacao", postar: "cobranca_postagem" } as const
export type RegraCobranca = (typeof REGRA_DA_ETAPA)[EtapaCobranca]

export function etapaDaCobranca(statusInterno: string | null | undefined): EtapaCobranca | null {
  if (!statusInterno) return null
  if ((STATUS_DA_COBRANCA.aprovar as readonly string[]).includes(statusInterno)) return "aprovar"
  if ((STATUS_DA_COBRANCA.postar as readonly string[]).includes(statusInterno)) return "postar"
  return null
}

export function etapaDaRegra(regra: unknown): EtapaCobranca | null {
  return regra === REGRA_DA_ETAPA.aprovar ? "aprovar" : regra === REGRA_DA_ETAPA.postar ? "postar" : null
}

/**
 * A chave de ambiente COBRANCA_SOLICITANTE, por cima do módulo da empresa:
 *   (vazia) ou "ligado"  — vale o módulo "cobranca" de cada empresa;
 *   "desligado"          — ninguém é cobrado, em nenhuma empresa;
 *   "teste:<tel>,<tel>"  — só esses números (8 últimos dígitos), e só nas
 *                          empresas com o módulo ligado: para conferir o envio
 *                          real antes de soltar para todos.
 */
export function ambientePermite(telefone?: string | null, valor = process.env.COBRANCA_SOLICITANTE): boolean {
  const v = valor?.trim() ?? ""
  if (v === "" || v === "ligado") return true
  if (!v.startsWith("teste:")) return false
  if (!telefone) return false
  const fim = (t: string) => t.replace(/\D/g, "").slice(-8)
  const alvo = fim(telefone)
  return alvo.length === 8 && v.slice(6).split(",").some((t) => fim(t) === alvo)
}

/** O ambiente desliga a cobrança em todas as empresas? */
export const ambienteDesligado = (valor = process.env.COBRANCA_SOLICITANTE) => {
  const v = valor?.trim() ?? ""
  return v !== "" && v !== "ligado" && !v.startsWith("teste:")
}

/**
 * O módulo "cobranca" está ligado nesta empresa? Lido pela transação de quem
 * pergunta (a fila e a rotina já rodam com a empresa declarada). Sem linha,
 * vale o padrão do catálogo — desligado.
 */
export async function cobrancaLigadaNaEmpresa(tx: Prisma.TransactionClient, organizacaoId: string): Promise<boolean> {
  if (!DISPONIVEL_NA_PLATAFORMA.cobranca || ambienteDesligado()) return false
  const linha = await tx.moduloOrganizacao.findUnique({
    where: { organizacaoId_modulo: { organizacaoId, modulo: "cobranca" } },
    select: { ativo: true },
  })
  return linha?.ativo ?? PADRAO_MODULOS.cobranca
}

/** A rotina só cobra de segunda a sexta (o botão da ficha cobra em qualquer dia). */
export function diaUtilEmSaoPaulo(agora: Date): boolean {
  const dia = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(agora)
  return !["Sat", "Sun"].includes(dia)
}

const primeiroNome = (nome?: string | null) => nome?.trim().split(/\s+/)[0] || null

/**
 * O texto da cobrança. Leve, sem ameaça: a brincadeira fica na arte, que só
 * vai da 2ª vez em diante. `peca` é "arte" no Growth (área design).
 */
export function textoDaCobranca(c: {
  etapa: EtapaCobranca; vez: number; nome?: string | null; codigo: string; titulo: string
  link: string; peca: "video" | "arte"; linkDeLogin?: boolean
}): string {
  const ola = primeiroNome(c.nome) ? `Olá, ${primeiroNome(c.nome)}!` : "Olá!"
  const titulo = c.titulo.length > 80 ? `${c.titulo.slice(0, 77)}...` : c.titulo
  const aPeca = c.peca === "arte" ? "A arte" : "O vídeo"
  const pronto = c.peca === "arte" ? "pronta" : "pronto"
  const aprovado = c.peca === "arte" ? "aprovada" : "aprovado"
  const lembrete = c.vez >= 2 ? `\n\n_Lembrete nº ${c.vez}. Cobramos uma vez por dia até ${c.etapa === "aprovar" ? "a aprovação" : "a confirmação"}._` : ""
  if (c.etapa === "aprovar") {
    const como = c.linkDeLogin ? "Para ver e aprovar no NuFlow:" : "Para ver e aprovar:"
    return `⏰ *${aPeca} espera a sua aprovação*\n\n${ola} ${aPeca} de *${titulo}* (${c.codigo}) está ${pronto} e só falta o seu ok. ${como}\n${c.link}${lembrete}`
  }
  return `📱 *Já foi postado?*\n\n${ola} ${aPeca} de *${titulo}* (${c.codigo}) foi ${aprovado} e está em Para Postar. Se já foi ao ar, é só confirmar aqui, sem login:\n${c.link}${lembrete}`
}
