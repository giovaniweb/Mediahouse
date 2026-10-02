import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { quemRecebeTudo } from "@/lib/notificados"
import { StatusInterno } from "@prisma/client"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { sendWhatsappMessage, getWhatsappConfig } from "@/lib/whatsapp"
import { decryptSecret } from "@/lib/secret-crypto"
import { executarAgenteComTools, MODELO_WHATSAPP, TOOLS_WHATSAPP, TOOLS_WHATSAPP_DESCONHECIDO, SYSTEM_WHATSAPP } from "@/lib/claude"
import { contextoWhatsApp } from "@/lib/ia-tool-contexto"
import { identidadeWhatsApp, jidRecebidoVerificado } from "@/lib/whatsapp-identidade"
import { executarFerramenta } from "@/lib/ia-tools-executor"
import { downloadEvolutionMedia, uploadMedia } from "@/lib/storage"
import { transcreverAudio } from "@/lib/transcription"
import { declararOrg } from "@/lib/org-contexto"

export const maxDuration = 60

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Segredo por header (preferido) ou querystring — a Evolution nem sempre
  // permite header customizado, e o webhook é configurado por URL.
  const segredo = req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("s")

  try {
    await processarMensagem(body, segredo)
  } catch (e) {
    console.error("[WH] Erro no processamento:", e)
  }

  // Sempre 200: a Evolution reenvia em erro, e reenvio de payload rejeitado
  // viraria laço. O descarte fica registrado no log, não na resposta.
  return NextResponse.json({ ok: true })
}

// ─── Detecta tipo de mídia na mensagem ──────────────────────────────────────

type MediaInfo = {
  tipo: "image" | "video" | "audio" | "document"
  mimetype: string
  caption?: string
  fileName?: string
}

function detectarMidia(message: Record<string, unknown>): MediaInfo | null {
  if (message.imageMessage) {
    const m = message.imageMessage as Record<string, unknown>
    return { tipo: "image", mimetype: (m.mimetype as string) || "image/jpeg", caption: m.caption as string | undefined }
  }
  if (message.videoMessage) {
    const m = message.videoMessage as Record<string, unknown>
    return { tipo: "video", mimetype: (m.mimetype as string) || "video/mp4", caption: m.caption as string | undefined }
  }
  if (message.audioMessage) {
    const m = message.audioMessage as Record<string, unknown>
    return { tipo: "audio", mimetype: (m.mimetype as string) || "audio/ogg; codecs=opus" }
  }
  if (message.documentMessage) {
    const m = message.documentMessage as Record<string, unknown>
    return {
      tipo: "document",
      mimetype: (m.mimetype as string) || "application/octet-stream",
      fileName: (m.fileName as string) || "documento",
    }
  }
  return null
}

// ─── Processamento real ─────────────────────────────────────────────────────

// Compara o segredo apresentado com o guardado (cifrado), em tempo constante.
function segredoConfere(apresentado: string | null, cifrado: string): boolean {
  if (!apresentado) return false
  let esperado: string
  try {
    esperado = decryptSecret(cifrado)
  } catch {
    return false
  }
  const a = Buffer.from(apresentado)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function processarMensagem(body: unknown, segredoApresentado: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as any
  const event = b?.event as string | undefined
  const data = b?.data
  const instanceName = (b?.instance ?? b?.instanceName) as string | undefined

  const eventNorm = event?.toLowerCase().replace(/_/g, ".") ?? ""

  // ── Resolve a organização pela instância Evolution (multiempresa) ───────
  //
  // Sem fallback: antes, payload sem `instance` era processado como se fosse da
  // Contourline. Como o endpoint é público, bastava um POST sem esse campo para
  // injetar mensagem naquela empresa — e as ferramentas de escrita da IA criam
  // demanda e evento. Instância desconhecida ou ausente agora é descartada.
  if (!instanceName) {
    console.warn("[WH] Payload sem instância — descartado")
    return
  }
  const configs = await prisma.configWhatsapp.findMany({
    where: { OR: [{ instanceId: instanceName }, { instanceName }] },
    select: { organizacaoId: true, webhookSecret: true, organizacao: { select: { ativo: true } } },
    take: 2,
  }).catch(() => [])
  const cfg = configs.length === 1 ? configs[0] : null
  if (!cfg?.organizacaoId || !cfg.organizacao?.ativo) {
    console.warn(`[WH] Instância desconhecida "${instanceName}" — ignorando`)
    return
  }

  // ── Autenticação do webhook ────────────────────────────────────────────
  // Sem segredo não existe origem confiável para identidade ou ferramentas.
  if (cfg.webhookSecret) {
    if (!segredoConfere(segredoApresentado, cfg.webhookSecret)) {
      // Descartar em silêncio é a mesma doença de sempre: a mensagem some, o
      // sistema segue verde e o único vestígio é um console.warn no log da
      // Vercel, que ninguém lê. Se a Evolution perder a query `?s=` ao montar
      // a chamada, TODA entrada morre aqui — e ninguém saberia por meses.
      //
      // Um alerta por hora: rejeição costuma vir em rajada, e o objetivo é
      // aparecer na tela, não inundá-la.
      console.warn(`[WH] Segredo inválido para "${instanceName}" — descartado`)
      const jaAvisou = await prisma.alertaIA.findFirst({
        where: {
          organizacaoId: cfg.organizacaoId,
          tipoAlerta: "whatsapp_webhook_rejeitado",
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        select: { id: true },
      }).catch(() => null)
      if (!jaAvisou) {
        await prisma.alertaIA.create({
          data: {
            organizacaoId: cfg.organizacaoId,
            tipoAlerta: "whatsapp_webhook_rejeitado",
            mensagem: segredoApresentado
              ? "Mensagens do WhatsApp estão chegando com segredo inválido e sendo descartadas."
              : "Mensagens do WhatsApp estão chegando SEM o segredo e sendo descartadas — a Evolution provavelmente perdeu o `?s=` da URL do webhook.",
            severidade: "critico",
            acaoSugerida: "Configurações › WhatsApp › Reativar recebimento de respostas",
            status: "ativo",
          },
        }).catch(() => null)
      }
      return
    }
  } else {
    console.warn(
      `[WH] Instância "${instanceName}" sem webhookSecret — mensagem descartada. ` +
        `Configure em Configurações › WhatsApp e aponte a Evolution para a URL com ?s=<segredo>.`
    )
    return
  }

  const orgId: string = cfg.organizacaoId  // garantido não-nulo daqui pra frente
  const organizacaoId: string = orgId       // alias usado pelo restante do fluxo

  // A empresa vem da configuração que casou com a instância da Evolution. O
  // webhook não tem sessão, então sob RLS ela precisa ser declarada aqui — senão
  // nenhuma mensagem recebida encontra a demanda a que pertence.
  declararOrg(organizacaoId)

  // ── Evento de conexão ──────────────────────────────────────────────────
  if (eventNorm === "connection.update") {
    const state = data?.state ?? data?.status ?? "desconhecido"
    console.log(`[WH-CONN] Estado: ${state}`)

    // Guarda o estado anterior ANTES de sobrescrever: é a diferença entre os
    // dois que revela o reinício. Uma instância que morre de vez (OOM, deploy,
    // crash) não manda "close" — ela só reaparece com "open", e sem comparar
    // com o que estava gravado esse retorno passa despercebido.
    const cfgAntes = await prisma.configWhatsapp.findFirst({
      where: { OR: [{ instanceId: instanceName }, { instanceName }] },
      select: { id: true, lastStatus: true, connectedAt: true },
    }).catch(() => null)

    if (cfgAntes) {
      await prisma.configWhatsapp.update({
        where: { id: cfgAntes.id },
        data: {
          lastStatus: String(state),
          ativo: state === "open",
          ...(state === "open" ? { connectedAt: new Date() } : {}),
        },
      }).catch(() => null)
    }

    if (state === "close" || state === "disconnected") {
      console.error("[WH-CONN] ⚠️ WhatsApp DESCONECTADO")
      await prisma.alertaIA.create({
        data: {
          tipoAlerta: "whatsapp_desconectado",
          mensagem: "WhatsApp desconectado. Acesse Configurações → WhatsApp para reconectar via QR Code.",
          severidade: "critico",
          acaoSugerida: "Acessar /configuracoes e reconectar o WhatsApp",
          status: "ativo",
          organizacaoId,
        },
      }).catch(() => null)
    }

    // Voltou a ficar de pé. Cada um destes é uma queda que aconteceu — é a
    // única contagem de instabilidade que existe: a instância reinicia, perde o
    // histórico dela e nada no NuFlow registrava que isso tinha acontecido.
    if (state === "open" && cfgAntes) {
      const desde = cfgAntes.connectedAt
      const horasDePe = desde ? (Date.now() - desde.getTime()) / 3_600_000 : null
      // "connecting" → "open" na mesma subida é a sequência normal de um boot;
      // não conta como queda nova, senão cada reinício viraria dois alertas.
      if (cfgAntes.lastStatus !== "connecting") {
        console.warn(`[WH-CONN] Instância reconectou (estava de pé há ${horasDePe?.toFixed(1) ?? "?"}h)`)
        await prisma.alertaIA.create({
          data: {
            tipoAlerta: "whatsapp_reconectou",
            mensagem: horasDePe !== null && horasDePe < 24
              ? `WhatsApp reconectou — estava de pé há apenas ${horasDePe < 1 ? `${Math.round(horasDePe * 60)} min` : `${horasDePe.toFixed(1)}h`}.`
              : "WhatsApp reconectou.",
            severidade: horasDePe !== null && horasDePe < 6 ? "aviso" : "info",
            acaoSugerida: "Reinícios frequentes derrubam mensagens de entrada — verificar memória/estabilidade do servidor da Evolution",
            status: "ativo",
            organizacaoId,
          },
        }).catch(() => null)
      }
    }
    return
  }

  // Processa apenas MESSAGES_UPSERT
  if (eventNorm !== "messages.upsert") return

  const message = data?.message
  if (!message) return

  // Ignora mensagens enviadas por nós e de grupos
  if (data.key?.fromMe) return
  if (data.key?.remoteJid?.endsWith("@g.us")) return

  const remoteJid: string = data.key?.remoteJid ?? ""
  const pushName: string = data.pushName ?? data.key?.pushName ?? ""
  const messageId: string = data.key?.id ?? ""

  // ── Deduplicação ──────────────────────────────────────────────────────
  if (messageId) {
    const jaProcessado = await prisma.mensagemWhatsapp.findFirst({
      where: { conteudo: { startsWith: `[id:${messageId}]` }, organizacaoId },
    }).catch(() => null)
    if (jaProcessado) {
      console.log(`[WH-DEDUP] ${messageId} já processada`)
      return
    }
  }

  const remetente = jidRecebidoVerificado(remoteJid, data.key?.remoteJidAlt)
  if (!remetente) {
    console.warn("[WH] Remetente sem vínculo verificável de número; mensagem não executada")
    return
  }
  const { replyJid, telefone } = remetente
  // Atalho de resposta — sempre injeta a organização resolvida pela instância.
  const responder = (msg: string, demandaId?: string) => sendWhatsappMessage(replyJid, msg, demandaId, orgId)

  // ── Detecta mídia ──────────────────────────────────────────────────────
  const midia = detectarMidia(message)

  // Extrai texto da mensagem (ou caption de mídia)
  let textoOriginal = (
    message.conversation ??
    message.extendedTextMessage?.text ??
    midia?.caption ??
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.listResponseMessage?.singleSelectReply?.selectedRowId ??
    ""
  ).trim()

  const textoUpper = textoOriginal.toUpperCase()

  // Variáveis para mídia processada
  let mediaUrl: string | null = null
  const mediaType: string | null = midia?.mimetype ?? null
  let audioTranscrito: string | null = null

  console.log(`[WH] De: ${remoteJid} (${pushName}) | Reply: ${replyJid} | Tel: ${telefone} | Texto: "${textoOriginal}" | Mídia: ${midia?.tipo ?? "nenhuma"}`)

  if (!telefone) return
  // Permite mensagens sem texto se tiver mídia
  if (!textoOriginal && !midia) return

  // ── Processa mídia (download + upload storage) ────────────────────────
  if (midia) {
    try {
      const config = await getWhatsappConfig(organizacaoId)
      if (config) {
        const downloaded = await downloadEvolutionMedia(
          config.instanceUrl,
          config.instanceId,
          config.apiKey,
          { key: { id: messageId, remoteJid } }
        )

        if (downloaded) {
          // Upload para Supabase Storage
          mediaUrl = await uploadMedia(downloaded.buffer, downloaded.fileName, downloaded.mimetype, orgId)

          // Se é áudio, transcrever
          if (midia.tipo === "audio") {
            audioTranscrito = await transcreverAudio(downloaded.buffer, downloaded.fileName)
            if (audioTranscrito) {
              console.log(`[WH] Áudio transcrito: "${audioTranscrito.slice(0, 100)}..."`)
              // O texto transcrito se torna o "textoOriginal" para processamento pela IA
              textoOriginal = audioTranscrito
            }
          }
        }
      }
    } catch (e) {
      console.error("[WH] Erro ao processar mídia:", e)
    }
  }

  // Busca histórico recente ANTES de salvar
  const historicoRecente = await prisma.mensagemWhatsapp.findMany({
    where: {
      organizacaoId,
      telefone: { in: [telefone, replyJid] },
      direcao: { in: ["entrada", "saida"] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { conteudo: true, direcao: true, createdAt: true },
  })

  // Salva mensagem recebida
  await prisma.mensagemWhatsapp.create({
    data: {
      telefone,
      tipoMensagem: midia?.tipo ?? "text",
      conteudo: messageId
        ? `[id:${messageId}] ${textoOriginal || "[mídia]"}`
        : textoOriginal || "[mídia]",
      mediaUrl: mediaUrl ?? undefined,
      mediaType: mediaType ?? undefined,
      direcao: "entrada",
      status: "recebido",
      organizacaoId,
    },
  }).catch(() => null)

  // Se recebemos apenas mídia sem texto e sem transcrição
  if (!textoOriginal && midia && !audioTranscrito) {
    if (midia.tipo === "audio") {
      // Áudio que falhou transcrição — avisa e pede para mandar de novo ou digitar
      const msg = `Hey ${pushName?.split(" ")[0] || ""}! Recebi seu áudio, mas não consegui entender. 🎙️\n\nPode tentar mandar de novo ou digitar o que precisa? 😊`
      await responder(msg)
      return
    }
    const tipoLabel = midia.tipo === "image" ? "imagem" : midia.tipo === "video" ? "vídeo" : midia.tipo === "document" ? "documento" : "arquivo"
    const msg = mediaUrl
      ? `Hey ${pushName?.split(" ")[0] || ""}! Recebi sua ${tipoLabel}! 📎\n\nSe quiser vincular a uma demanda, me diga o código (ex: VID-0023). Ou me conta o que precisa!`
      : `Recebi sua ${tipoLabel}, mas tive um problema ao processar. Pode tentar novamente? 🙏`
    await responder(msg)
    return
  }

  // ── Identifica quem está falando ────────────────────────────────────────
  const telNorm = telefone
  const { videomaker, editor, usuario, contatoExistente } = await identidadeWhatsApp(orgId, telefone)

  // Auto-registra contato se é usuário/videomaker/editor conhecido mas sem ContatoWhatsApp
  if (!contatoExistente && (videomaker || editor || usuario)) {
    const ref = editor ?? videomaker ?? usuario
    await prisma.contatoWhatsApp.createMany({
      data: [{
        telefone: telNorm,
        nome: ref!.nome,
        tipo: editor ? "editor" : videomaker ? "videomaker" : "usuario",
        referenciaId: ref!.id,
        organizacaoId: orgId,
      }],
      skipDuplicates: true,
    }).catch(() => null)
  }

  // Prioridade: editor (videomaker interno) > videomaker (externo) > usuario > contato externo > desconhecido
  const identidade = editor
    ? { tipo: "editor" as const, id: editor.id, nome: editor.nome }
    : videomaker
    ? { tipo: "videomaker" as const, id: videomaker.id, nome: videomaker.nome }
    : usuario
    ? { tipo: "usuario" as const, id: usuario.id, nome: usuario.nome, perfil: usuario.tipo }
    : contatoExistente
    ? { tipo: "externo" as const, nome: contatoExistente.nome }
    : { tipo: "desconhecido" as const, nome: pushName || "" }

  // Primeiro nome para saudação informal
  const primeiroNome = identidade.nome ? identidade.nome.split(" ")[0] : (pushName?.split(" ")[0] || "")

  // ── Primeiro contato: pedir nome ────────────────────────────────────────
  if (identidade.tipo === "desconhecido" && !contatoExistente) {
    // Verifica se já perguntamos o nome (olha histórico recente)
    const jaPerguntouNome = historicoRecente.some(m =>
      m.direcao === "saida" && m.conteudo.includes("como posso te chamar")
    )

    if (!jaPerguntouNome) {
      // Primeira mensagem de contato desconhecido — pedir nome
      const msg = `Hey! Aqui é a *NuFlow* 🤖\n\nAinda não nos conhecemos! Como posso te chamar?`
      await responder(msg)

      // Notifica admin sobre novo contato
      await notificarAdminNovoContato(pushName || "Desconhecido", telefone, textoOriginal, orgId)
      return
    }

    // Se já perguntamos e a resposta parece um nome (texto curto sem comando)
    const pareceNome = textoOriginal.length <= 50 && !textoOriginal.includes("/") && !/^(status|agenda|ajuda|menu|sim|não|nao|\?)$/i.test(textoOriginal)
    if (jaPerguntouNome && pareceNome) {
      // Salva o contato com o nome informado
      const nomeContato = textoOriginal.trim()
      await prisma.contatoWhatsApp.upsert({
        where: { organizacaoId_telefone: { organizacaoId: orgId, telefone: telNorm } },
        create: { telefone: telNorm, nome: nomeContato, tipo: "externo", organizacaoId: orgId },
        update: { nome: nomeContato },
      }).catch(() => null)

      const msg = `Prazer, *${nomeContato.split(" ")[0]}*! 😊\n\nComo posso te ajudar? Pode me pedir um vídeo, conteúdo, cobertura, ou qualquer coisa!`
      await responder(msg)
      return
    }
  }

  // ── Comandos estruturados (resposta rápida sem IA) ──────────────────────

  // ── Helper: busca demanda aguardando confirmação do videomaker ────────────
  // Estratégias em ordem de confiabilidade:
  // 1. Por videomakerId + status "videomaker_notificado" (caminho ideal)
  // 2. Por videomakerId + qualquer status que indique pendência (cobre demandas normais onde o status não muda)
  // 3. Por última mensagem SAÍDA para este telefone com demandaId (fallback quando telefone não bate no Prisma)
  async function encontrarDemandaNotificada(vmId?: string): Promise<import("@prisma/client").Demanda | null> {
    if (!vmId) return null
    const candidatas = await prisma.demanda.findMany({
      where: { organizacaoId: orgId, videomakerId: vmId, statusInterno: StatusInterno.videomaker_notificado },
      take: 2,
    })
    // SIM sem código não pode escolher arbitrariamente entre dois convites.
    return candidatas.length === 1 ? candidatas[0] : null
  }

  if (textoUpper === "SIM" || textoUpper === "CONFIRMAR" || textoUpper === "SIM!" || textoUpper === "TOPO" || textoUpper === "TOPEI" || /^(SIM|CONFIRMAR|TOPO|TOPEI)[.!,\s]*$/.test(textoUpper)) {
    const demanda = await encontrarDemandaNotificada(videomaker?.id)
    if (demanda) {
      const alterada = await prisma.$transaction(async tx => {
        const mudou = await tx.demanda.updateMany({
          where: { id: demanda.id, organizacaoId: orgId, videomakerId: videomaker!.id, statusInterno: "videomaker_notificado" },
          data: { statusInterno: "videomaker_aceitou", statusVisivel: STATUS_PARA_COLUNA["videomaker_aceitou"] },
        })
        if (mudou.count !== 1) return false
        await tx.historicoStatus.create({ data: { demandaId: demanda.id, statusAnterior: demanda.statusInterno, statusNovo: "videomaker_aceitou", origem: "whatsapp", observacao: "Resposta via WhatsApp verificado" } })
        return true
      })
      if (!alterada) { await responder("O convite mudou. Consulte a equipe antes de confirmar."); return }
      await responder(
        `✅ *Captação confirmada!*\n\n📋 *${demanda.codigo}* — ${demanda.titulo}\n\nÓtimo! Aguarde contato com mais detalhes. 🎬`,
        demanda.id
      )
      await notificarAdminMovimentacao(demanda.codigo, demanda.titulo, identidade.nome || pushName, "Videomaker ACEITOU captação", orgId)
      return
    }
    // SIM sem demanda pendente — responde para não cair na IA
    await responder(
      `Hey ${primeiroNome}! 👋 Não encontrei uma captação pendente de confirmação para você.\n\nSe você recebeu uma solicitação recentemente, verifique com a equipe. Qualquer dúvida, é só falar! 😊`
    )
    return
  }

  if (textoUpper === "NÃO" || textoUpper === "NAO" || textoUpper === "RECUSAR" || textoUpper === "RECUSO" || /^(N[ÃA]O|RECUSAR|RECUSO)[.!,\s]*$/.test(textoUpper)) {
    const demanda = await encontrarDemandaNotificada(videomaker?.id)
    if (demanda) {
      const alterada = await prisma.$transaction(async tx => {
        const mudou = await tx.demanda.updateMany({
          where: { id: demanda.id, organizacaoId: orgId, videomakerId: videomaker!.id, statusInterno: "videomaker_notificado" },
          data: { statusInterno: "videomaker_recusou", statusVisivel: STATUS_PARA_COLUNA["videomaker_recusou"], videomakerId: null },
        })
        if (mudou.count !== 1) return false
        await tx.historicoStatus.create({ data: { demandaId: demanda.id, statusAnterior: demanda.statusInterno, statusNovo: "videomaker_recusou", origem: "whatsapp", observacao: "Resposta via WhatsApp verificado" } })
        return true
      })
      if (!alterada) { await responder("O convite mudou. Consulte a equipe antes de confirmar."); return }
      await responder(
        `Entendido, ${primeiroNome}. Escalaremos outro profissional para *${demanda.codigo}*. Obrigado! 🙏`,
        demanda.id
      )
      await notificarAdminMovimentacao(demanda.codigo, demanda.titulo, identidade.nome || pushName, "Videomaker RECUSOU captação — precisa escalar outro", orgId)
      return
    }
    // NÃO sem demanda pendente — responde para não cair na IA
    await responder(
      `Hey ${primeiroNome}! 👋 Não encontrei uma captação pendente de confirmação para você. Se precisar de ajuda, é só falar!`
    )
    return
  }

  if (textoUpper === "STATUS" || textoUpper === "MINHAS DEMANDAS") {
    const vmId = videomaker?.id
    const edId = editor?.id
    if (vmId || edId) {
      const demandas = await prisma.demanda.findMany({
        where: {
          organizacaoId: orgId,
          ...(vmId ? { videomakerId: vmId } : { editorId: edId }),
          statusInterno: { notIn: ["encerrado", "postado", "entregue_cliente", "expirado"] },
        },
        take: 5, orderBy: { createdAt: "desc" },
      })
      if (demandas.length > 0) {
        const lista = demandas.map(d => `• *${d.codigo}* — ${d.titulo}\n  ↳ ${d.statusInterno}`).join("\n")
        await responder(`📋 *Suas demandas ativas:*\n\n${lista}\n\nDigite o *código* para mais detalhes.`)
      } else {
        await responder(`Hey ${primeiroNome}! Você não tem demandas ativas no momento. ✅`)
      }
      return
    }
  }

  if (textoUpper === "AGENDA" || textoUpper === "MINHA AGENDA" || textoUpper === "AGENDA HOJE" || textoUpper === "AGENDA AMANHÃ") {
    const temAgenda = videomaker || editor
    if (temAgenda) {
      const hoje = new Date()
      const diasFuturos = textoUpper.includes("AMANHÃ") ? 2 : 7
      const inicio = textoUpper.includes("AMANHÃ")
        ? new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1)
        : new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
      const fimPeriodo = new Date(inicio.getTime() + diasFuturos * 86400000)

      const eventoWhere = editor
        ? { organizacaoId: orgId, editorId: editor.id, inicio: { gte: inicio, lte: fimPeriodo } }
        : { organizacaoId: orgId, videomakerId: videomaker!.id, inicio: { gte: inicio, lte: fimPeriodo } }

      const [eventos, captacoes] = await Promise.all([
        prisma.evento.findMany({
          where: eventoWhere,
          orderBy: { inicio: "asc" }, take: 10,
          select: { titulo: true, inicio: true, fim: true, local: true, tipo: true },
        }),
        videomaker ? prisma.demanda.findMany({
          where: {
            organizacaoId: orgId,
            videomakerId: videomaker.id,
            dataCaptacao: { gte: inicio, lte: fimPeriodo },
            statusInterno: { notIn: ["encerrado", "postado", "entregue_cliente"] },
          },
          select: { codigo: true, titulo: true, dataCaptacao: true, cidade: true },
        }) : Promise.resolve([]),
      ])

      if (eventos.length === 0 && captacoes.length === 0) {
        await responder(`📅 Hey ${primeiroNome}! Nenhum compromisso nos próximos ${diasFuturos} dias. ✅`)
      } else {
        const linhasEventos = eventos.map(e =>
          `📌 *${e.titulo}*\n   ${e.inicio.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${e.local ? `\n   📍 ${e.local}` : ""}`
        )
        const linhasCaptacoes = captacoes.map(c =>
          `🎬 *${c.codigo}* — ${c.titulo}\n   ${c.dataCaptacao?.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) ?? "Horário a definir"}${c.cidade ? `\n   📍 ${c.cidade}` : ""}`
        )
        const tudo = [...linhasCaptacoes, ...linhasEventos].join("\n\n")
        await responder(`📅 *Sua agenda, ${primeiroNome}:*\n\n${tudo}`)
      }
      return
    } else {
      await responder(`Hey ${primeiroNome}! Agenda é exclusiva para videomakers internos da equipe. 📋`)
      return
    }
  }

  if (textoUpper === "AJUDA" || textoUpper === "MENU" || textoUpper === "?") {
    const menu = identidade.tipo === "videomaker"
      ? `Hey ${primeiroNome}! Aqui é a *NuFlow* 🤖\n\nO que posso fazer por você:\n\n*STATUS* — Suas demandas ativas\n*AGENDA* — Sua agenda\n*SIM / NÃO* — Confirmar/recusar captação\n\n💬 Ou manda uma mensagem livre, áudio ou arquivo!`
      : `Hey ${primeiroNome}! Aqui é a *NuFlow* 🤖\n\nMe manda o que precisa:\n\n💬 Texto, áudio ou arquivo\n📋 "nova demanda: [descrição]"\n🔍 "status da VID-0023"`

    await responder(menu)
    return
  }

  // ── Detecta e ignora respostas automáticas de outros sistemas/bots ────
  const autoReplyPatterns = [
    /agradecemos sua mensagem/i,
    /não estamos disponíveis/i,
    /entraremos em contato/i,
    /seja muito bem[- ]?vindo/i,
    /aqui é a equipe d[aeo]/i,
    /assessor[ae] d[aeo]/i,
    /me chamo .+, assessor/i,
    /resposta automática/i,
    /mensagem automática/i,
    /atendimento automático/i,
    /horário de atendimento/i,
  ]
  if (autoReplyPatterns.some(pattern => pattern.test(textoOriginal))) {
    console.log(`[WH] Ignorando resposta automática de ${telefone}: "${textoOriginal.slice(0, 60)}..."`)
    return
  }

  // ── Saudações → resposta informal ──────────────────────────────────────
  const saudacoes = ["oi", "olá", "ola", "hey", "hi", "bom dia", "boa tarde", "boa noite", "oi!", "olá!", "oii", "oiii", "eae", "eai", "fala", "salve"]
  if (saudacoes.includes(textoOriginal.toLowerCase())) {
    const saudacao = `Hey ${primeiroNome}! Aqui é a *NuFlow* 🤖\n\nComo posso te ajudar? Manda aí!`
    await responder(saudacao)
    return
  }

  // ── Secretária IA — processa TODA mensagem restante ───────────────────
  const idProprioVideomaker = videomaker?.id ?? null
  const idProprioEditor = editor?.id ?? null
  const idProprioUsuario = usuario?.id ?? null

  const contextoIdentidade = identidade.tipo === "editor"
    ? `Videomaker Interno (Editor): ${identidade.nome} (editor_id: ${identidade.id}, tel: ${telefone}) — TEM AGENDA PRÓPRIA`
    : identidade.tipo === "videomaker"
    ? `Videomaker Externo: ${identidade.nome} (videomaker_id: ${identidade.id}, tel: ${telefone}) — TEM AGENDA PRÓPRIA`
    : identidade.tipo === "usuario"
    ? `Usuário sistema: ${identidade.nome} (usuario_id: ${idProprioUsuario}, perfil: ${identidade.perfil}, tel: ${telefone})`
    : identidade.tipo === "externo"
    ? `Pessoa externa conhecida: ${identidade.nome} (tel: ${telefone}) — NÃO tem agenda`
    : `Pessoa externa: ${identidade.nome || pushName || "desconhecido"} (tel: ${telefone}) — NÃO tem agenda`

  // Regras de permissão por tipo
  const permissaoRole = identidade.tipo === "videomaker" || identidade.tipo === "editor"
    ? `\n\nPERMISSÕES DO USUÁRIO (${identidade.tipo.toUpperCase()}):
- PODE: consultar suas demandas, sua agenda, confirmar/recusar captação, enviar arquivos
- NÃO PODE: pedir relatórios, ver métricas, criar demandas para outros, acessar banco de ideias
- Se pedir relatório ou métricas, responda: "Essa função é exclusiva para gestores. 📊"`
    : identidade.tipo === "usuario" && identidade.perfil !== "admin" && identidade.perfil !== "gestor"
    ? `\n\nPERMISSÕES DO USUÁRIO (${identidade.perfil?.toUpperCase() ?? "OPERADOR"}):
- PODE: consultar demandas, criar demandas
- NÃO PODE: pedir relatórios, ver métricas gerais
- Se pedir relatório ou métricas, responda: "Essa função é exclusiva para gestores. 📊"`
    : ""

  // Histórico da conversa (mais antigo → mais recente)
  const historicoOrdenado = [...historicoRecente].reverse()
  const historicoFormatado = historicoOrdenado.length > 0
    ? "\n\n--- HISTÓRICO DA CONVERSA ---\n" +
      historicoOrdenado
        .map(m => {
          const conteudo = m.conteudo.replace(/^\[id:[^\]]+\]\s*/, "")
          return `${m.direcao === "entrada" ? "👤" : "🤖"} ${conteudo}`
        })
        .join("\n") +
      "\n--- FIM ---"
    : ""

  // Contexto extra para mídia/áudio
  let contextoMidia = ""
  if (audioTranscrito) {
    contextoMidia = `\n\n⚠️ ÁUDIO TRANSCRITO: A mensagem abaixo é a transcrição de um áudio enviado pelo usuário. Trate normalmente, mas saiba que veio de fala (pode ser informal/coloquial).`
  }
  if (midia && midia.tipo !== "audio" && mediaUrl) {
    contextoMidia += `\n\n📎 ARQUIVO RECEBIDO: ${midia.tipo} (${midia.mimetype}). URL no storage: ${mediaUrl}. Se o usuário mencionar uma demanda, use vincular_arquivo_demanda para anexar.`
  }

  const promptSecretaria = `CONTEXTO:
- Quem está falando: ${contextoIdentidade}
- Primeiro nome: ${primeiroNome}
- Data/hora: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
- IDs: videomaker_id="${idProprioVideomaker ?? "N/A"}", editor_id="${idProprioEditor ?? "N/A"}", usuario_id="${idProprioUsuario ?? "N/A"}"
- JID para resposta: "${replyJid}"
- Telefone (para telefone_solicitante): "${telefone}"${permissaoRole}${contextoMidia}
${historicoFormatado}

MENSAGEM ATUAL: "${textoOriginal}"

INSTRUÇÕES:
- SEMPRE comece a resposta com "Hey ${primeiroNome}!" — tom informal e amigável.
- Se houver histórico, a mensagem atual é continuação.
- Para demandas: buscar_demanda_por_codigo se mencionar VID-XXXX.

REGRA CRÍTICA — CRIAÇÃO DE DEMANDAS (SIGA À RISCA):
- QUALQUER pessoa pode solicitar uma demanda via WhatsApp — não precisa ser cadastrada.
- Quando alguém pedir vídeo, conteúdo, cobertura, anúncio, etc. → CRIE A DEMANDA IMEDIATAMENTE.
- NÃO peça confirmação. NÃO apresente resumo. NÃO faça perguntas desnecessárias.
- Use estruturar_demanda para organizar, depois criar_demanda_rascunho para criar, depois enviar_whatsapp para confirmar.
- Execute as 3 ferramentas EM SEQUÊNCIA sem parar.
- A demanda cai automaticamente em APROVAÇÃO para o gestor — é só rascunho.
- SEMPRE passe telefone_solicitante="${telefone}" e nome_solicitante="${primeiroNome}" ao criar.
- Se faltam dados essenciais (o quê?), pergunte UMA coisa APENAS. Prazo e local são OPCIONAIS — crie sem eles.
- Se recebeu arquivo (📎 acima), pergunte se quer vincular a alguma demanda.

REGRAS DE AGENDA:
- Somente videomakers internos (editor) e videomakers externos têm agenda própria.
- Para agendar: use criar_evento_agenda com editor_id="${idProprioEditor ?? "N/A"}" ou videomaker_id="${idProprioVideomaker ?? "N/A"}".
- A ferramenta VERIFICA CONFLITOS automaticamente. Se houver conflito, repasse as sugestões ao usuário.
- Se pessoa NÃO é videomaker/editor, informe que agenda é exclusiva para equipe interna.
- Para consultar agenda: buscar_agenda_videomaker (funciona para editor também, passe editor_id).
- SEMPRE termine com enviar_whatsapp para responder ao usuário.`

  // A lista orienta o modelo; o executor revalida autoridade em cada chamada.
  const remetenteConhecido = !!(usuario || editor || videomaker)
  const ferramentas = remetenteConhecido ? TOOLS_WHATSAPP : TOOLS_WHATSAPP_DESCONHECIDO
  const contexto = contextoWhatsApp(orgId, replyJid, mediaUrl ?? undefined)

  try {
    await executarAgenteComTools(
      promptSecretaria,
      (nome, input) => executarFerramenta(nome, input, contexto),
      MODELO_WHATSAPP,
      8,
      ferramentas,
      SYSTEM_WHATSAPP
    )
  } catch (e) {
    console.error("[WhatsApp Secretária] Erro:", e)
    await responder(`Hey ${primeiroNome}! Tive um probleminha técnico. Pode mandar de novo? 🙏`)
  }
}

/**
 * Notifica admin sobre novo contato tentando falar
 */
async function notificarAdminNovoContato(nome: string, telefone: string, mensagem: string, organizacaoId?: string | null) {
  try {
    const admins = await quemRecebeTudo(organizacaoId)
    for (const admin of admins) {
      if (admin.telefone) {
        await sendWhatsappMessage(
          admin.telefone,
          `👤 *Novo contato via WhatsApp!*\n\n📱 ${telefone}\n👤 ${nome}\n💬 "${mensagem.slice(0, 100)}"\n\nO sistema está coletando o nome da pessoa.`,
          undefined, organizacaoId
        ).catch(() => null)
      }
    }
  } catch (e) {
    console.warn("[WH] Falha ao notificar novo contato:", e)
  }
}

/**
 * Notifica admin sobre movimentação em demanda
 */
async function notificarAdminMovimentacao(codigo: string, titulo: string, nome: string, acao: string, organizacaoId?: string | null) {
  try {
    const admins = await quemRecebeTudo(organizacaoId)
    for (const admin of admins) {
      if (admin.telefone) {
        await sendWhatsappMessage(
          admin.telefone,
          `🔔 *NuFlow — Movimentação*\n\n📋 *${codigo}* — ${titulo}\n👤 ${nome}\n📌 ${acao}`,
          undefined, organizacaoId
        ).catch(() => null)
      }
    }
  } catch (e) {
    console.warn("[WH] Falha ao notificar movimentação:", e)
  }
}

// GET — health check
export async function GET() {
  return NextResponse.json({ ok: true, webhook: "NuFlow WhatsApp Secretária IA ativa" })
}
