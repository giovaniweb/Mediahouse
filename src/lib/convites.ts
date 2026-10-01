import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { registrarAuditoria, type AtorAuditoria } from "@/lib/auditoria"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { criarSaida, destinoAutorizado } from "@/lib/whatsapp-outbox"
import { telefoneCompleto } from "@/lib/whatsapp-identidade"

type Tx = Prisma.TransactionClient
export class ConviteInvalido extends Error {
  constructor(message: string, public status = 409) { super(message) }
}
const estadosDeConvite = ["pedido_criado", "aguardando_triagem", "planejamento", "urgencia_aprovada", "videomaker_notificado", "videomaker_recusou"]

/** Todas as respostas disputam a mesma linha do job, inclusive convites diferentes. */
async function bloquearDemanda(tx: Tx, organizacaoId: string, demandaId: string) {
  await tx.$queryRaw`SELECT id FROM demandas WHERE id=${demandaId} AND "organizacaoId"=${organizacaoId} FOR UPDATE`
  const d = await tx.demanda.findFirst({ where: { id: demandaId, organizacaoId } })
  if (!d) throw new ConviteInvalido("Demanda não encontrada", 404)
  return d
}
async function profissional(tx: Tx, organizacaoId: string, videomakerId: string) {
  const v = await tx.videomakerOrganizacao.findFirst({ where: {
    organizacaoId, videomakerId, status: { in: ["ativo", "preferencial"] }, emListaNegra: false,
  }, include: { videomaker: { select: { nome: true, telefone: true, usuario: { select: { status: true } } } } } })
  if (!v || (v.videomaker.usuario && v.videomaker.usuario.status !== "ativo")) throw new ConviteInvalido("Profissional indisponível nesta empresa", 404)
  return v
}
/** Apenas snapshot: não transforma diária em total do job nem cria gasto. */
export async function condicaoDoConvite(tx: Tx, organizacaoId: string, videomakerId: string) {
  const v = await profissional(tx, organizacaoId, videomakerId)
  return {
    // Zero cadastral legado não comprova gratuidade.
    tarifaDiaria: v.valorDiaria !== null && Number.isFinite(v.valorDiaria) && v.valorDiaria > 0
      ? new Prisma.Decimal(v.valorDiaria.toString()).toDecimalPlaces(2) : null,
    condicoes: "Diária de referência na emissão; quantidade de diárias e total do serviço devem ser confirmados com a equipe. Nota fiscal após entrega dos brutos; pagamento em até 15 dias após envio da nota fiscal.",
  }
}
export async function emitirConvite(tx: Tx, ator: AtorAuditoria, demandaId: string, videomakerId: string) {
  const d = await bloquearDemanda(tx, ator.organizacaoId, demandaId)
  if (!estadosDeConvite.includes(d.statusInterno)) throw new ConviteInvalido("O job não está na etapa de convite")
  const v = await profissional(tx, ator.organizacaoId, videomakerId)
  const existente = await tx.conviteVideomaker.findFirst({ where: { demandaId, videomakerId, status: "pendente", expiresAt: { gt: new Date() } } })
  if (existente) return existente
  const convite = await tx.conviteVideomaker.create({ data: {
    demandaId, videomakerId, expiresAt: new Date(Date.now() + 48 * 3600_000),
    ...await condicaoDoConvite(tx, ator.organizacaoId, videomakerId),
  } })
  await registrarAuditoria(tx, ator, { acao: "convite.criar", recurso: "convite", recursoId: convite.id, correlationId: randomUUID() })
  const telefone = telefoneCompleto(v.videomaker.telefone)
  if (telefone && await destinoAutorizado(tx, ator.organizacaoId, telefone)) {
    const link = `${process.env.NEXTAUTH_URL || "https://nuflow.space"}/convite/${convite.token}`
    await criarSaida(tx, { organizacaoId: ator.organizacaoId, origem: "manual", referencia: convite.id,
      chave: `convite:${convite.id}`, telefone, expiraEm: convite.expiresAt,
      texto: `Olá ${v.videomaker.nome}! Convite para ${d.codigo} — ${d.titulo}. Confira as condições e responda pelo link: ${link}` })
  }
  return convite
}

/** O chamador autentica o token ou o profissional antes de entrar na transação. */
export async function responderConvite(tx: Tx, e: {
  organizacaoId: string; token: string; acao: "aceitar" | "recusar";
  videomakerId?: string; versao?: number; recebidoEm?: Date; origem: "automacao" | "whatsapp" | "manual";
  usuarioId?: string;
}) {
  const inicial = await tx.conviteVideomaker.findFirst({ where: { token: e.token, demanda: { organizacaoId: e.organizacaoId } } })
  if (!inicial) throw new ConviteInvalido("Convite não encontrado", 404)
  const d = await bloquearDemanda(tx, e.organizacaoId, inicial.demandaId)
  const c = await tx.conviteVideomaker.findUniqueOrThrow({ where: { id: inicial.id } })
  if ((e.videomakerId && e.videomakerId !== c.videomakerId) || (e.versao !== undefined && e.versao !== c.versao)) throw new ConviteInvalido("Destinatário ou versão do convite não corresponde", 403)
  await profissional(tx, e.organizacaoId, c.videomakerId)
  const status = e.acao === "aceitar" ? "aceito" : "recusado"
  // Reenvio após commit não toca mais no job, histórico, auditoria ou saída.
  if (c.status === status) return { status, demandaId: d.id }
  if (c.status !== "pendente") throw new ConviteInvalido("Convite já respondido ou substituído")
  if (c.expiresAt <= new Date()) throw new ConviteInvalido("Convite expirado", 410)
  if (e.recebidoEm && (c.createdAt > e.recebidoEm || d.updatedAt > e.recebidoEm)) throw new ConviteInvalido("Convite alterado após a mensagem")
  const alterarJob = e.acao === "aceitar" || d.videomakerId === c.videomakerId
  if (alterarJob && (!estadosDeConvite.includes(d.statusInterno) || (d.videomakerId !== null && d.videomakerId !== c.videomakerId))) throw new ConviteInvalido("A vaga já foi preenchida ou o job avançou")
  await tx.conviteVideomaker.update({ where: { id: c.id }, data: { status, respondidoEm: new Date() } })
  if (alterarJob) {
    const novo = e.acao === "aceitar" ? "videomaker_aceitou" : "videomaker_recusou"
    await tx.demanda.update({ where: { id: d.id, organizacaoId: e.organizacaoId }, data: {
      videomakerId: e.acao === "aceitar" ? c.videomakerId : null,
      statusInterno: novo, statusVisivel: STATUS_PARA_COLUNA[novo],
    } })
    await tx.historicoStatus.create({ data: { demandaId: d.id, statusAnterior: d.statusInterno,
      statusNovo: novo, origem: e.origem, observacao: `Resposta registrada no convite ${c.id}` } })
  }
  const ator: AtorAuditoria = e.usuarioId ? { organizacaoId: e.organizacaoId, usuarioId: e.usuarioId }
    : { organizacaoId: e.organizacaoId, tecnico: `convite:${c.id}` }
  await registrarAuditoria(tx, ator, { acao: "convite.responder", recurso: "convite", recursoId: c.id, correlationId: randomUUID() })
  const gestores = await tx.usuario.findMany({ where: { status: "ativo", telefone: { not: null },
    organizacoes: { some: { organizacaoId: e.organizacaoId, OR: [{ papel: { in: ["admin", "gestor"] } }, { recebeTodosAvisos: true }] } },
  }, select: { id: true, telefone: true } })
  for (const g of gestores) {
    const telefone = telefoneCompleto(g.telefone)
    const destino = telefone ? await destinoAutorizado(tx, e.organizacaoId, telefone) : null
    if (!telefone || destino?.tipo !== "usuario" || destino.id !== g.id) continue
    await criarSaida(tx, { organizacaoId: e.organizacaoId, origem: "manual", referencia: c.id,
      chave: `convite:${c.id}:resposta:${g.id}`, telefone, expiraEm: new Date(Date.now() + 86400_000),
      texto: `Convite ${status} — ${d.codigo}: ${d.titulo}. Consulte os detalhes do job no Flow.` })
  }
  return { status, demandaId: d.id }
}
