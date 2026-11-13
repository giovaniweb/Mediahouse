import { createHash, randomUUID } from "node:crypto"
import { garantirEspelhoDoVideomaker, type EspelhoGarantido } from "@/lib/espelho-do-videomaker"
import { Prisma } from "@prisma/client"
import { registrarAuditoria, type AtorAuditoria } from "@/lib/auditoria"
import { registrarAceite } from "@/lib/juridico/aceite-servidor"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { cancelarSaidasPendentes, criarSaida, destinoAutorizado } from "@/lib/whatsapp-outbox"
import { telefoneCompleto } from "@/lib/whatsapp-identidade"
import { dadosDaGravacao, enfileirarAvisos } from "@/lib/avisos-gravacao"
import { mensagensDoEvento } from "@/lib/avisos-gravacao-textos"
import { ESTADOS_DE_AVISO, ESTADOS_DO_CONVITE, momentoDoJob, ondeDoJob, rotuloDoMomento } from "@/lib/ficha-do-job"
import { EVENTO_CONVITE } from "@/lib/status"

type Tx = Prisma.TransactionClient
export class ConviteInvalido extends Error {
  constructor(message: string, public status = 409) { super(message) }
}
const estadosDeConvite = ESTADOS_DO_CONVITE

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
  if (!estadosDeConvite.includes(d.statusInterno)) throw new ConviteInvalido("A gravação não está na etapa de convite")
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
    // Primeira gravação dele com esta empresa, e há kit montado: o convite já
    // aponta o guia e as referências, que estão no mesmo link (29/10/2026).
    const primeira = !await tx.conviteVideomaker.findFirst({ where: { videomakerId, status: "aceito", demanda: { organizacaoId: ator.organizacaoId } }, select: { id: true } })
    const temKit = primeira && !!await tx.materialVideomaker.findFirst({ where: { organizacaoId: ator.organizacaoId, tipo: { in: ["guia", "referencia"] } }, select: { id: true } })
    const cliente = d.clienteFinalNome?.trim() || d.titulo
    await criarSaida(tx, { organizacaoId: ator.organizacaoId, origem: "manual", referencia: convite.id,
      chave: `convite:${convite.id}`, telefone, expiraEm: convite.expiresAt,
      texto: [
        `Olá ${v.videomaker.nome}! Convite para gravação: ${cliente} (${d.codigo}). Confira as condições e responda pelo link:`,
        link,
        temKit && "É a sua primeira gravação com a gente: no mesmo link estão o guia de captação e os vídeos de referência. Veja antes de gravar.",
      ].filter(Boolean).join("\n\n") })
  }
  return convite
}

/** O chamador autentica o token ou o profissional antes de entrar na transação. */
export async function responderConvite(tx: Tx, e: {
  organizacaoId: string; token: string; acao: "aceitar" | "recusar";
  videomakerId?: string; versao?: number; recebidoEm?: Date; origem: "automacao" | "whatsapp" | "manual";
  usuarioId?: string;
  /** Só a página do convite manda: o videomaker clicou em Aceitar com a linha
   *  dos Termos do Profissional e da Privacidade à vista, Onda 3. WhatsApp e
   *  resposta manual não mostram os termos, então não geram aceite. */
  aceiteTermos?: { ipHash: string | null };
}) {
  const inicial = await tx.conviteVideomaker.findFirst({ where: { token: e.token, demanda: { organizacaoId: e.organizacaoId } } })
  if (!inicial) throw new ConviteInvalido("Convite não encontrado", 404)
  const d = await bloquearDemanda(tx, e.organizacaoId, inicial.demandaId)
  const c = await tx.conviteVideomaker.findUniqueOrThrow({ where: { id: inicial.id } })
  if ((e.videomakerId && e.videomakerId !== c.videomakerId) || (e.versao !== undefined && e.versao !== c.versao)) throw new ConviteInvalido("Destinatário ou versão do convite não corresponde", 403)
  await profissional(tx, e.organizacaoId, c.videomakerId)
  const status = e.acao === "aceitar" ? "aceito" : "recusado"
  // Reenvio após commit não toca mais no job, histórico, auditoria ou saída.
  if (c.status === status) return { status, demandaId: d.id, espelho: null }
  if (c.status !== "pendente") throw new ConviteInvalido("Convite já respondido ou substituído")
  if (c.expiresAt <= new Date()) throw new ConviteInvalido("Convite expirado", 410)
  if (e.recebidoEm && (c.createdAt > e.recebidoEm || d.updatedAt > e.recebidoEm)) throw new ConviteInvalido("Convite alterado após a mensagem")
  const alterarJob = e.acao === "aceitar" || d.videomakerId === c.videomakerId
  if (alterarJob && (!estadosDeConvite.includes(d.statusInterno) || (d.videomakerId !== null && d.videomakerId !== c.videomakerId))) throw new ConviteInvalido("A vaga já foi preenchida ou o job avançou")
  await tx.conviteVideomaker.update({ where: { id: c.id }, data: { status, respondidoEm: new Date() } })
  let espelho: EspelhoGarantido | null = null
  if (alterarJob) {
    const novo = e.acao === "aceitar" ? "videomaker_aceitou" : "videomaker_recusou"
    await tx.demanda.update({ where: { id: d.id, organizacaoId: e.organizacaoId }, data: {
      videomakerId: e.acao === "aceitar" ? c.videomakerId : null,
      statusInterno: novo, statusVisivel: STATUS_PARA_COLUNA[novo],
    } })
    await tx.historicoStatus.create({ data: { demandaId: d.id, statusAnterior: d.statusInterno,
      statusNovo: novo, origem: e.origem, observacao: `Resposta registrada no convite ${c.id}` } })
    // Aceitou e trabalha por uma empresa: o card vai para lá, no mesmo commit.
    // O aviso à empresa dele é de quem chama, depois do commit (avisarEspelhoNovo).
    if (e.acao === "aceitar") espelho = await garantirEspelhoDoVideomaker(tx, d.id)
  }
  const ator: AtorAuditoria = e.usuarioId ? { organizacaoId: e.organizacaoId, usuarioId: e.usuarioId }
    : { organizacaoId: e.organizacaoId, tecnico: `convite:${c.id}` }
  await registrarAuditoria(tx, ator, { acao: "convite.responder", recurso: "convite", recursoId: c.id, correlationId: randomUUID() })
  // A prova do aceite entra na mesma transação da resposta: aceite do convite
  // sem a prova dos termos (ou o contrário) não existe.
  if (status === "aceito" && e.aceiteTermos) {
    await registrarAceite(tx, ator, {
      organizacaoId: e.organizacaoId, titularTipo: "videomaker", titularId: c.videomakerId,
      documentos: ["profissionais", "privacidade"], origem: "convite_videomaker", ipHash: e.aceiteTermos.ipHash,
    })
  }
  // Os avisos da gravação (lib/avisos-gravacao.ts): aceito avisa a operação e o
  // cliente; recusado avisa a operação e a gestão. Convite que já não mexe na
  // gravação (o job seguiu com outro) não avisa ninguém.
  if (alterarJob) {
    const g = await dadosDaGravacao(tx, e.organizacaoId, d.id)
    const evento = status === "aceito" ? "confirmada" : "recusada"
    if (g) await enfileirarAvisos(tx, { organizacaoId: e.organizacaoId, gravacao: g, motivo: evento, mensagens: mensagensDoEvento(evento, g), autorUsuarioId: e.usuarioId })
  }
  return { status, demandaId: d.id, espelho }
}

const linkDoConvite = (token: string) => `${process.env.NEXTAUTH_URL || "https://nuflow.space"}/convite/${token}`
const nomeDaGravacao = (d: { clienteFinalNome: string | null; titulo: string }) => d.clienteFinalNome?.trim() || d.titulo
/** "Qua, 12/11 · 14:00", ou "data a combinar". */
function quandoDaGravacao(d: { dataCaptacao: Date | null; dataEvento: Date | null }) {
  const m = momentoDoJob(d)
  return m ? rotuloDoMomento(m) : "data a combinar"
}
function ondeDaGravacao(d: { localGravacao: string | null; localEvento: string | null; cidade: string | null }) {
  const { endereco, cidade } = ondeDoJob(d)
  return [endereco, cidade].filter(Boolean).join(" · ") || "local a combinar"
}

/**
 * A troca de videomaker (11/11/2026). Chamada pelo PUT da demanda, na mesma
 * transação que grava o novo, antes de `emitirConvite`.
 *
 * - Todo convite `pendente` vira `substituido` (como já era).
 * - O `aceito` de quem saiu também vira `substituido`: a página do convite
 *   dele passa a dizer que foi substituído, em vez de "Participação confirmada".
 *   (A entrega pelo link já conferia `demanda.videomakerId`; isto é a frase.)
 * - Só numa troca de verdade (há um novo), quem saiu e ainda contava com a
 *   gravação — convite pendente dentro do prazo, ou aceito — recebe um aviso
 *   curto no WhatsApp. Tirar o videomaker sem pôr outro (o "Recusou") não avisa:
 *   ali foi ele quem disse não.
 */
export async function substituirConvites(tx: Tx, organizacaoId: string, demandaId: string, novoVideomakerId: string | null) {
  const agora = new Date()
  const antigos = await tx.conviteVideomaker.findMany({
    where: { demandaId, status: { in: ["pendente", "aceito"] }, demanda: { organizacaoId } },
    include: { videomaker: { select: { nome: true, telefone: true } } },
    orderBy: { createdAt: "desc" },
  })
  // A mensagem do convite que perde a validade sai da fila (link morto), e o
  // aviso de mudança ainda não enviado para quem sai, também.
  await cancelarSaidasPendentes(tx, organizacaoId, { chaves: antigos.filter((c) => c.status === "pendente").map((c) => `convite:${c.id}`) }, "convite_substituido")
  if (antigos.some((c) => c.videomakerId !== novoVideomakerId)) {
    await cancelarSaidasPendentes(tx, organizacaoId, { prefixo: `convite-mudanca:${demandaId}:` }, "convite_substituido")
  }
  await tx.conviteVideomaker.updateMany({ where: { demandaId, status: "pendente" }, data: { status: "substituido" } })
  const aceitosDeOutros = antigos.filter((c) => c.status === "aceito" && c.videomakerId !== novoVideomakerId).map((c) => c.id)
  if (aceitosDeOutros.length) await tx.conviteVideomaker.updateMany({ where: { id: { in: aceitosDeOutros } }, data: { status: "substituido" } })
  if (!novoVideomakerId) return
  const d = await tx.demanda.findFirst({ where: { id: demandaId, organizacaoId },
    select: { codigo: true, titulo: true, clienteFinalNome: true, dataCaptacao: true, dataEvento: true } })
  if (!d) return
  const avisados = new Set<string>()
  for (const c of antigos) {
    if (c.videomakerId === novoVideomakerId || avisados.has(c.videomakerId)) continue
    if (c.status === "pendente" && c.expiresAt <= agora) continue
    avisados.add(c.videomakerId)
    const telefone = telefoneCompleto(c.videomaker.telefone)
    if (!telefone || !await destinoAutorizado(tx, organizacaoId, telefone)) continue
    await criarSaida(tx, { organizacaoId, origem: "manual", referencia: c.id, chave: `convite-substituido:${c.id}`,
      telefone, expiraEm: new Date(Date.now() + 24 * 3600_000),
      texto: `Olá ${c.videomaker.nome}! A gravação ${nomeDaGravacao(d)} (${d.codigo}), ${quandoDaGravacao(d)}, passou para outro videomaker. O seu convite não vale mais. Qualquer dúvida, fale com a equipe.` })
  }
}

/**
 * "Reenviar convite" na linha "Quem vai" (11/11/2026): o convite venceu ou a
 * pessoa não recebeu. Os pendentes viram `substituido` e sai um convite novo
 * (token novo, 48h, WhatsApp novo — a chave `convite:<id>` é de outro id).
 * Depois que ele confirmou, não há o que reenviar: é o "Avisar mudança".
 */
export async function reenviarConvite(tx: Tx, ator: AtorAuditoria, demandaId: string) {
  const d = await bloquearDemanda(tx, ator.organizacaoId, demandaId)
  if (!d.videomakerId) throw new ConviteInvalido("Escale um videomaker antes de reenviar o convite.")
  if (!estadosDeConvite.includes(d.statusInterno)) throw new ConviteInvalido("O convite só se reenvia antes de o videomaker confirmar. Depois, use “Avisar mudança”.")
  if (await tx.conviteVideomaker.findFirst({ where: { demandaId, videomakerId: d.videomakerId, status: "aceito" }, select: { id: true } })) {
    throw new ConviteInvalido("Ele já confirmou. Use “Avisar mudança” para mandar os dados de novo.")
  }
  const v = await profissional(tx, ator.organizacaoId, d.videomakerId)
  const telefone = telefoneCompleto(v.videomaker.telefone)
  if (!telefone || !await destinoAutorizado(tx, ator.organizacaoId, telefone)) {
    throw new ConviteInvalido(`${v.videomaker.nome} não tem um WhatsApp válido no cadastro. Confira o número antes de reenviar.`)
  }
  const pendentes = await tx.conviteVideomaker.findMany({ where: { demandaId, status: "pendente" }, select: { id: true } })
  await cancelarSaidasPendentes(tx, ator.organizacaoId, { chaves: pendentes.map((c) => `convite:${c.id}`) }, "convite_substituido")
  await tx.conviteVideomaker.updateMany({ where: { demandaId, status: "pendente" }, data: { status: "substituido" } })
  if (d.statusInterno !== "videomaker_notificado") {
    await tx.demanda.update({ where: { id: d.id, organizacaoId: ator.organizacaoId },
      data: { statusInterno: "videomaker_notificado", statusVisivel: STATUS_PARA_COLUNA.videomaker_notificado } })
  }
  const convite = await emitirConvite(tx, ator, demandaId, d.videomakerId)
  await tx.historicoStatus.create({ data: { demandaId, statusAnterior: d.statusInterno, statusNovo: EVENTO_CONVITE,
    usuarioId: "usuarioId" in ator ? ator.usuarioId : null, origem: "manual",
    observacao: `Convite reenviado para ${v.videomaker.nome} (link novo, vale 48h)` } })
  return convite
}


/**
 * "Avisar mudança" (11/11/2026): o videomaker já confirmou e a data, a hora ou
 * o local mudaram no card. Manda os dados de agora e o link do convite (que
 * mostra a ficha ao vivo). O mesmo texto não sai duas vezes: a chave leva o
 * resumo do conteúdo.
 */
export async function avisarMudancaAoVideomaker(tx: Tx, ator: AtorAuditoria, demandaId: string) {
  const d = await bloquearDemanda(tx, ator.organizacaoId, demandaId)
  if (!d.videomakerId) throw new ConviteInvalido("Escale um videomaker antes de avisar.")
  if (!ESTADOS_DE_AVISO.includes(d.statusInterno)) throw new ConviteInvalido("Só dá para avisar a mudança com o videomaker confirmado e antes da gravação.")
  const v = await profissional(tx, ator.organizacaoId, d.videomakerId)
  const telefone = telefoneCompleto(v.videomaker.telefone)
  if (!telefone || !await destinoAutorizado(tx, ator.organizacaoId, telefone)) {
    throw new ConviteInvalido(`${v.videomaker.nome} não tem um WhatsApp válido no cadastro. Confira o número.`)
  }
  const convite = await tx.conviteVideomaker.findFirst({ where: { demandaId, videomakerId: d.videomakerId, status: "aceito" }, orderBy: { createdAt: "desc" } })
  const quando = quandoDaGravacao(d), onde = ondeDaGravacao(d)
  const texto = [
    `Olá ${v.videomaker.nome}! Mudou a gravação ${nomeDaGravacao(d)} (${d.codigo}):`,
    `Quando: ${quando}\nOnde: ${onde}`,
    convite ? `Os detalhes estão no seu link: ${linkDoConvite(convite.token)}` : null,
  ].filter(Boolean).join("\n\n")
  const resumo = createHash("sha256").update(`${d.videomakerId}|${texto}`).digest("hex").slice(0, 16)
  const chave = `convite-mudanca:${d.id}:${resumo}`
  if (await tx.saidaWhatsapp.findFirst({ where: { organizacaoId: ator.organizacaoId, chave }, select: { id: true } })) {
    throw new ConviteInvalido("Este mesmo aviso já foi mandado. Mude a data ou o local antes de avisar de novo.")
  }
  await criarSaida(tx, { organizacaoId: ator.organizacaoId, origem: "manual", referencia: convite?.id ?? d.id, chave,
    telefone, expiraEm: new Date(Date.now() + 24 * 3600_000), texto })
  await tx.historicoStatus.create({ data: { demandaId, statusAnterior: d.statusInterno, statusNovo: EVENTO_CONVITE,
    usuarioId: "usuarioId" in ator ? ator.usuarioId : null, origem: "manual",
    observacao: `${v.videomaker.nome} avisado da mudança: ${quando} · ${onde}` } })
  return { ok: true }
}
