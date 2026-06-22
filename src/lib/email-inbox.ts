import crypto from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { calcularPeso } from "@/lib/peso-demanda"
import { fetchMicrosoftMessages, refreshMicrosoftAccessToken } from "@/lib/microsoft-mail"
import { htmlToPlainText, parseInboundEmail, type EmailParseResult } from "@/lib/email-inbox-parser"

function filterParts(value?: string | null): string[] {
  return (value ?? "")
    .split(/[,;\n]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function matchesConfig(
  message: { subject?: string | null; from?: { emailAddress?: { address?: string } } },
  config: { remetenteFiltro: string | null; assuntoFiltro: string | null }
): boolean {
  const senderFilters = filterParts(config.remetenteFiltro)
  const subjectFilters = filterParts(config.assuntoFiltro)
  const sender = message.from?.emailAddress?.address?.toLowerCase() ?? ""
  const subject = message.subject?.toLowerCase() ?? ""
  const senderOk = senderFilters.length === 0 || senderFilters.some((filter) => sender.includes(filter))
  const subjectOk = subjectFilters.length === 0 || subjectFilters.some((filter) => subject.includes(filter))
  return senderOk && subjectOk
}

function parseStoredData(value: Prisma.JsonValue | null): EmailParseResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as unknown as EmailParseResult
}

async function defaultRequester(
  organizacaoId: string,
  configuredUserId?: string | null
): Promise<string | null> {
  if (configuredUserId) {
    const membership = await prisma.usuarioOrganizacao.findFirst({
      where: { organizacaoId, usuarioId: configuredUserId, usuario: { status: "ativo" } },
      select: { usuarioId: true },
    })
    if (membership) return membership.usuarioId
  }

  const membership = await prisma.usuarioOrganizacao.findFirst({
    where: {
      organizacaoId,
      papel: { in: ["admin", "gestor", "operacao"] },
      usuario: { status: "ativo" },
    },
    orderBy: { createdAt: "asc" },
    select: { usuarioId: true },
  })
  return membership?.usuarioId ?? null
}

async function uniqueDemandCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `MAIL-${new Date().getFullYear().toString().slice(-2)}-${crypto.randomInt(100000, 999999)}`
    const exists = await prisma.demanda.findUnique({ where: { codigo: code }, select: { id: true } })
    if (!exists) return code
  }
  throw new Error("Não foi possível gerar um código único para a demanda.")
}

export async function createDemandFromInboxEmail(
  emailId: string,
  options: { force?: boolean } = {}
): Promise<{
  demandaId: string
  codigo: string
}> {
  const email = await prisma.emailEntrada.findUnique({
    where: { id: emailId },
    include: { config: true },
  })
  if (!email) throw new Error("E-mail não encontrado.")
  if (email.demandaId) {
    const existing = await prisma.demanda.findUnique({
      where: { id: email.demandaId },
      select: { id: true, codigo: true },
    })
    if (existing) return { demandaId: existing.id, codigo: existing.codigo }
  }

  const parsed =
    parseStoredData(email.dadosExtraidos) ??
    parseInboundEmail(email.assunto, email.corpoTexto, email.recebidoEm)
  if (!parsed.eligibleForDemand && !options.force) {
    const reason = parsed.missing.length
      ? `Campos pendentes: ${parsed.missing.join(", ")}`
      : "O e-mail não solicita um videomaker."
    await prisma.emailEntrada.update({
      where: { id: email.id },
      data: {
        status: "revisao",
        erro: reason,
        dadosExtraidos: parsed as unknown as Prisma.InputJsonValue,
      },
    })
    throw new Error(reason)
  }

  const solicitanteId = await defaultRequester(
    email.organizacaoId,
    email.config.solicitantePadraoId
  )
  if (!solicitanteId) {
    await prisma.emailEntrada.update({
      where: { id: email.id },
      data: { status: "revisao", erro: "Nenhum solicitante padrão ativo na organização." },
    })
    throw new Error("Configure um solicitante padrão para a caixa de entrada.")
  }

  const code = await uniqueDemandCode()
  try {
    const created = await prisma.$transaction(async (tx) => {
      const claimed = await tx.emailEntrada.updateMany({
        where: {
          id: email.id,
          demandaId: null,
          status: { in: ["pendente", "pronto", "revisao", "erro"] },
        },
        data: {
          status: "processando",
          erro: null,
          tentativas: { increment: 1 },
          dadosExtraidos: parsed as unknown as Prisma.InputJsonValue,
        },
      })
      if (claimed.count === 0) throw new Error("EMAIL_ALREADY_PROCESSING")

      const demanda = await tx.demanda.create({
        data: {
          organizacaoId: email.organizacaoId,
          codigo: code,
          titulo: parsed.demand.titulo,
          descricao: parsed.demand.descricao,
          departamento: parsed.demand.departamento,
          area: "audiovisual",
          tipoVideo: parsed.demand.tipoVideo,
          cidade: parsed.demand.cidade,
          prioridade: "normal",
          statusInterno: "aguardando_aprovacao_interna",
          statusVisivel: "entrada",
          pesoDemanda: calcularPeso(parsed.demand.tipoVideo, "normal"),
          solicitanteId,
          nomeSolicitante: parsed.demand.nomeSolicitante,
          dataEvento: parsed.demand.dataEvento ? new Date(parsed.demand.dataEvento) : null,
          dataCaptacao: parsed.demand.dataEvento ? new Date(parsed.demand.dataEvento) : null,
          localEvento: parsed.demand.localEvento,
          localGravacao: parsed.demand.localGravacao,
          referencia: `E-mail: ${email.assunto}`,
        },
      })

      await tx.historicoStatus.create({
        data: {
          demandaId: demanda.id,
          statusNovo: "aguardando_aprovacao_interna",
          usuarioId: solicitanteId,
          origem: "automacao",
          observacao: `Demanda criada pela Caixa de Entrada a partir de ${email.remetenteEmail}.`,
        },
      })

      await tx.alertaIA.create({
        data: {
          organizacaoId: email.organizacaoId,
          demandaId: demanda.id,
          tipoAlerta: "demanda_email",
          mensagem: `Nova demanda criada pelo e-mail "${email.assunto}".`,
          severidade: "aviso",
          acaoSugerida: "Revisar e aprovar a demanda recebida por e-mail",
        },
      })

      await tx.emailEntrada.update({
        where: { id: email.id },
        data: {
          status: "criado",
          demandaId: demanda.id,
          processadoEm: new Date(),
          erro: null,
        },
      })
      return demanda
    })
    return { demandaId: created.id, codigo: created.codigo }
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_PROCESSING") {
      throw new Error("E-mail já está sendo processado.")
    }
    await prisma.emailEntrada.update({
      where: { id: email.id },
      data: {
        status: "erro",
        erro: error instanceof Error ? error.message : String(error),
        tentativas: { increment: 1 },
      },
    }).catch(() => null)
    throw error
  }
}

export async function syncEmailInbox(configId: string): Promise<{
  recebidos: number
  criados: number
  revisao: number
}> {
  const config = await prisma.configEmailEntrada.findUnique({ where: { id: configId } })
  if (!config || !config.ativo || !config.refreshTokenCriptografado) {
    throw new Error("Caixa de entrada não conectada ou inativa.")
  }

  const syncStartedAt = new Date()
  const since = config.ultimaSincronizacaoEm
    ? new Date(config.ultimaSincronizacaoEm.getTime() - 10 * 60 * 1000)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  try {
    const accessToken = await refreshMicrosoftAccessToken(config)
    const messages = await fetchMicrosoftMessages(accessToken, since)
    let recebidos = 0
    let criados = 0
    let revisao = 0

    for (const message of messages) {
      if (!message.id || !matchesConfig(message, config)) continue
      const existing = await prisma.emailEntrada.findUnique({
        where: {
          organizacaoId_mensagemProvedorId: {
            organizacaoId: config.organizacaoId,
            mensagemProvedorId: message.id,
          },
        },
        select: { id: true },
      })
      if (existing) continue

      const rawBody = message.body?.content || message.bodyPreview || ""
      const bodyText = message.body?.contentType === "html"
        ? htmlToPlainText(rawBody)
        : rawBody.trim()
      const subject = message.subject?.trim() || "(sem assunto)"
      const receivedAt = new Date(message.receivedDateTime)
      const parsed = parseInboundEmail(subject, bodyText, receivedAt)
      const inboxEmail = await prisma.emailEntrada.create({
        data: {
          organizacaoId: config.organizacaoId,
          configId: config.id,
          mensagemProvedorId: message.id,
          internetMessageId: message.internetMessageId,
          conversationId: message.conversationId,
          remetenteNome: message.from?.emailAddress?.name,
          remetenteEmail: message.from?.emailAddress?.address?.toLowerCase() || "desconhecido",
          destinatarios: (message.toRecipients ?? [])
            .map((item) => item.emailAddress?.address?.toLowerCase())
            .filter((item): item is string => !!item),
          assunto: subject,
          recebidoEm: receivedAt,
          corpoTexto: bodyText,
          corpoHtml: message.body?.contentType === "html" ? rawBody : null,
          possuiAnexos: message.hasAttachments ?? false,
          dadosExtraidos: parsed as unknown as Prisma.InputJsonValue,
          status: parsed.eligibleForDemand ? "pronto" : "revisao",
          erro: parsed.eligibleForDemand
            ? null
            : parsed.missing.length
              ? `Campos pendentes: ${parsed.missing.join(", ")}`
              : "E-mail não elegível para criação automática.",
        },
      })
      recebidos += 1

      if (config.criarDemandaAutomaticamente && parsed.eligibleForDemand) {
        try {
          await createDemandFromInboxEmail(inboxEmail.id)
          criados += 1
        } catch {
          revisao += 1
        }
      } else if (!parsed.eligibleForDemand) {
        revisao += 1
      }
    }

    await prisma.configEmailEntrada.update({
      where: { id: config.id },
      data: { ultimaSincronizacaoEm: syncStartedAt, ultimoErro: null },
    })
    return { recebidos, criados, revisao }
  } catch (error) {
    await prisma.configEmailEntrada.update({
      where: { id: config.id },
      data: { ultimoErro: error instanceof Error ? error.message : String(error) },
    }).catch(() => null)
    throw error
  }
}

export async function syncAllEmailInboxes() {
  const configs = await prisma.configEmailEntrada.findMany({
    where: { ativo: true, refreshTokenCriptografado: { not: null } },
    select: { id: true, organizacaoId: true },
  })
  const results: Array<Record<string, unknown>> = []
  for (const config of configs) {
    try {
      results.push({
        organizacaoId: config.organizacaoId,
        ...(await syncEmailInbox(config.id)),
      })
    } catch (error) {
      results.push({
        organizacaoId: config.organizacaoId,
        erro: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}
