// Cobrança diária a quem PEDIU a demanda (Giovani, 25/11/2026).
//
// Os cards paravam em Aprovação e em Para Postar porque quem pediu não aprovava
// nem marcava como postado. Agora, uma vez por dia (de segunda a sexta, na
// rotina "cobranca" das 9h), quem pediu recebe no WhatsApp:
//   - em Aprovação: o link de aprovação (/aprovar/<token>) ou, sem ele, o card;
//   - em Para Postar: o link "foi postado" (/postado/<token>), que confirma sem
//     login.
// Da 2ª cobrança em diante vai com a arte de brincadeira (VideoSPC,
// ArteSERASA…, lib/avisos-arte.ts). Para quando o card sai da coluna: a fila
// confere de novo na hora de mandar (regras-operacionais, tipo "solicitante").
//
// Não é rotina paralela: é a rotina "cobranca" (automacoes-regras.ts) e a fila
// do WhatsApp de sempre, com as regras de quem pode receber de sempre —
// destinatário cadastrado (destinoAutorizado), preferência de aviso da pessoa
// (categoria "prazos") e uma por dia (a chave da saída leva o dia).
//
// Nasce desligada: módulo "cobranca" por empresa e a chave COBRANCA_SOLICITANTE
// (lib/cobranca-solicitante-regra.ts).
import type { Prisma } from "@prisma/client"
import { dataEmSaoPaulo } from "@/lib/datas"
import { novoTokenPublico } from "@/lib/acompanhamento-gravacao"
import { arteDaCobranca, type EtapaCobranca } from "@/lib/avisos-arte"
import { ehGravacaoExterna, hashRegra, type ContextoRegra } from "@/lib/regras-operacionais"
import { telefoneCompleto } from "@/lib/whatsapp-identidade"
import { criarSaida, destinoAutorizado } from "@/lib/whatsapp-outbox"
import {
  REGRA_DA_ETAPA, ambientePermite, cobrancaLigadaNaEmpresa, etapaDaCobranca, textoDaCobranca,
} from "@/lib/cobranca-solicitante-regra"

type Tx = Prisma.TransactionClient

/** Validade do link "foi postado". Renovado quando está perto de vencer. */
export const VALIDADE_LINK_POSTADO_DIAS = 14
/** O botão "Cobrar agora" da ficha: no máximo uma vez a cada 10 minutos por card. */
export const INTERVALO_COBRANCA_MANUAL_MS = 10 * 60_000

export class CobrancaRecusada extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

const base = () => (process.env.NEXTAUTH_URL ?? "http://localhost:3000").trim().replace(/\/$/, "")
export const linkDoPostado = (token: string) => `${base()}/postado/${token}`

type DemandaDaCobranca = {
  id: string; organizacaoId: string; codigo: string; titulo: string; area: string
  statusInterno: string; tipoGravacao: string | null; tipoVideo: string | null; departamento: string | null
  nomeSolicitante: string | null; telefoneSolicitante: string | null
  cobrancasSolicitante: number; solicitanteCobradoEm: Date | null; cobrancaSolicitanteEtapa: string | null
  postagemToken: string | null; postagemTokenExpiraEm: Date | null
  solicitante: { nome: string; telefone: string | null; status: string } | null
}

async function lerDemanda(tx: Tx, org: string, id: string): Promise<DemandaDaCobranca | null> {
  // Trava a linha: a rotina e o botão da ficha não contam a mesma cobrança duas vezes.
  await tx.$queryRaw`SELECT id FROM demandas WHERE id=${id} AND "organizacaoId"=${org} FOR UPDATE`
  return tx.demanda.findFirst({
    where: { id, organizacaoId: org },
    select: {
      id: true, organizacaoId: true, codigo: true, titulo: true, area: true, statusInterno: true,
      tipoGravacao: true, tipoVideo: true, departamento: true, nomeSolicitante: true, telefoneSolicitante: true,
      cobrancasSolicitante: true, solicitanteCobradoEm: true, cobrancaSolicitanteEtapa: true,
      postagemToken: true, postagemTokenExpiraEm: true,
      solicitante: { select: { nome: true, telefone: true, status: true } },
    },
  })
}

/**
 * O link que vai na cobrança. Em Aprovação, a aprovação pendente que ainda vale
 * (/aprovar/<token>); sem ela, o card no NuFlow — quem pediu é da equipe e
 * aprova por dentro. Em Para Postar, o link "foi postado", criado ou renovado
 * aqui. Grava por SQL para não mexer no `updatedAt` do card: ele é a "última
 * movimentação" das outras regras (sem atualização há 3 dias, revisão dos avisos).
 */
async function linkDaCobranca(tx: Tx, d: DemandaDaCobranca, etapa: EtapaCobranca, agora: Date) {
  if (etapa === "aprovar") {
    const a = await tx.aprovacaoVideo.findFirst({
      where: { demandaId: d.id, status: "pendente", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(agora.getTime() + 3_600_000) } }] },
      orderBy: { createdAt: "desc" }, select: { token: true },
    })
    return a ? { url: `${base()}/aprovar/${a.token}`, deLogin: false } : { url: `${base()}/demandas/${d.id}`, deLogin: true }
  }
  // Renova com folga: o link que sai hoje precisa valer pelo menos mais dois dias.
  const vale = d.postagemToken && d.postagemTokenExpiraEm && d.postagemTokenExpiraEm.getTime() > agora.getTime() + 2 * 86400_000
  if (vale) return { url: linkDoPostado(d.postagemToken!), deLogin: false }
  const token = d.postagemToken && d.postagemTokenExpiraEm && d.postagemTokenExpiraEm > agora ? d.postagemToken : novoTokenPublico()
  const expira = new Date(agora.getTime() + VALIDADE_LINK_POSTADO_DIAS * 86400_000)
  await tx.$executeRaw`UPDATE demandas SET "postagemToken"=${token}, "postagemTokenExpiraEm"=${expira} WHERE id=${d.id} AND "organizacaoId"=${d.organizacaoId}`
  return { url: linkDoPostado(token), deLogin: false }
}

/** Telefones de quem pediu: o cadastro (se ativo) e o número de quem pediu pelo WhatsApp. */
function telefonesDeQuemPediu(d: DemandaDaCobranca): string[] {
  const valores = [d.solicitante?.status === "ativo" ? d.solicitante.telefone : null, d.telefoneSolicitante]
  return [...new Set(valores.map((v) => telefoneCompleto(v)).filter((v): v is string => !!v))]
}

/** Até as 21h de hoje (São Paulo); se já passou, uma hora. A regra vale só no dia. */
function validadeDaSaida(agora: Date) {
  const fim = new Date(`${dataEmSaoPaulo(agora)}T21:00:00-03:00`)
  return fim.getTime() > agora.getTime() + 15 * 60_000 ? fim : new Date(agora.getTime() + 3_600_000)
}

export type ResultadoCobranca =
  | { cobrou: true; vez: number; etapa: EtapaCobranca; telefones: number }
  | { cobrou: false; motivo: "desligada" | "fora_da_etapa" | "gravacao_externa" | "ja_cobrado_hoje" | "sem_destinatario" | "nao_encontrada" }

/**
 * Agenda a cobrança de UMA demanda, na transação de quem chama (a rotina, por
 * demanda, ou o botão da ficha). Só conta a vez se ao menos um aviso entrou na
 * fila — desligado pela pessoa ou sem número cadastrado não vira "cobrado".
 */
export async function cobrarQuemPediu(tx: Tx, org: string, demandaId: string, opcoes: { manual: boolean; agora?: Date }): Promise<ResultadoCobranca> {
  const agora = opcoes.agora ?? new Date(), hoje = dataEmSaoPaulo(agora)
  if (!await cobrancaLigadaNaEmpresa(tx, org)) return { cobrou: false, motivo: "desligada" }
  const d = await lerDemanda(tx, org, demandaId)
  if (!d) return { cobrou: false, motivo: "nao_encontrada" }
  const etapa = etapaDaCobranca(d.statusInterno)
  if (!etapa) return { cobrou: false, motivo: "fora_da_etapa" }
  // Gravação externa tem os avisos dela (rotina "gravacoes").
  if (ehGravacaoExterna(d)) return { cobrou: false, motivo: "gravacao_externa" }
  const mesmaEtapa = d.cobrancaSolicitanteEtapa === etapa
  if (mesmaEtapa && d.solicitanteCobradoEm) {
    if (!opcoes.manual && dataEmSaoPaulo(d.solicitanteCobradoEm) === hoje) return { cobrou: false, motivo: "ja_cobrado_hoje" }
    if (opcoes.manual && agora.getTime() - d.solicitanteCobradoEm.getTime() < INTERVALO_COBRANCA_MANUAL_MS) {
      throw new CobrancaRecusada("Quem pediu acabou de ser cobrado. Espere uns minutos para cobrar de novo.", 429)
    }
  }
  const destinos: string[] = []
  for (const tel of telefonesDeQuemPediu(d)) {
    if (ambientePermite(tel) && await destinoAutorizado(tx, org, tel)) destinos.push(tel)
  }
  if (!destinos.length) return { cobrou: false, motivo: "sem_destinatario" }

  const vez = mesmaEtapa ? d.cobrancasSolicitante + 1 : 1
  const link = await linkDaCobranca(tx, d, etapa, agora)
  const arte = arteDaCobranca(vez, d.area, etapa)
  const contexto: ContextoRegra = { tipo: "solicitante", id: d.id, revisao: `${hoje}:${vez}`, regra: REGRA_DA_ETAPA[etapa], ...(arte ? { arte } : {}) }
  const texto = textoDaCobranca({
    etapa, vez, nome: d.nomeSolicitante || d.solicitante?.nome, codigo: d.codigo, titulo: d.titulo,
    link: link.url, linkDeLogin: link.deLogin, peca: d.area === "design" ? "arte" : "video",
  })
  const expiraEm = validadeDaSaida(agora)
  let entraram = 0
  for (const tel of destinos) {
    // A arte fica fora da chave, como na rotina: a vez (na revisão) e o dia já
    // fazem dela uma cobrança só.
    const { arte: _arte, ...semArte } = contexto
    const chave = `regra:v1:${hashRegra([semArte, tel, hoje])}`
    const s = await criarSaida(tx, { organizacaoId: org, origem: "regra", regraContexto: contexto, referencia: d.id, chave, telefone: tel, texto, expiraEm, demandaId: d.id })
    if (s.estado === "aguardando") entraram++
  }
  if (!entraram) return { cobrou: false, motivo: "sem_destinatario" }
  await tx.$executeRaw`UPDATE demandas SET "cobrancasSolicitante"=${vez}, "solicitanteCobradoEm"=${agora}, "cobrancaSolicitanteEtapa"=${etapa}
    WHERE id=${d.id} AND "organizacaoId"=${org}`
  return { cobrou: true, vez, etapa, telefones: entraram }
}

/** O que a ficha mostra e o envio a outro número usa: etapa, link e a arte da vez. */
export async function dadosDaCobrancaParaEnvio(tx: Tx, org: string, demandaId: string, agora = new Date()) {
  const d = await lerDemanda(tx, org, demandaId)
  if (!d) return null
  const etapa = etapaDaCobranca(d.statusInterno)
  if (!etapa) return null
  const link = await linkDaCobranca(tx, d, etapa, agora)
  // Para outro número vai sempre com a arte: da vez atual, ou a primeira (VideoSPC).
  const vez = Math.max(2, d.cobrancaSolicitanteEtapa === etapa ? d.cobrancasSolicitante : 0)
  return { d, etapa, link, arte: arteDaCobranca(vez, d.area, etapa)!, peca: d.area === "design" ? "arte" as const : "video" as const, vez }
}
