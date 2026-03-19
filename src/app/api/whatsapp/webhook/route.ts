import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage, getWhatsappConfig } from "@/lib/whatsapp"
import { executarAgenteComTools, MODELO_WHATSAPP, TOOLS_WHATSAPP, SYSTEM_WHATSAPP } from "@/lib/claude"
import { executarFerramenta } from "@/lib/ia-tools-executor"
import { downloadEvolutionMedia, uploadMedia } from "@/lib/storage"
import { transcreverAudio } from "@/lib/transcription"

export const maxDuration = 60

/**
 * Resolve o JID real (@s.whatsapp.net) a partir de um JID @lid.
 *
 * @lid é um identificador de privacidade do Meta/WhatsApp (multi-device).
 * A Evolution API NÃO consegue enviar para @lid — precisamos do @s.whatsapp.net.
 *
 * Estratégias (em ordem):
 * 1. Nosso banco (mensagemWhatsapp) — mensagem saída para este contato
 * 2. Evolution API findMessages — mensagem enviada para este @lid
 * 3. Banco por pushName — busca o telefone pelo nome do contato
 */
async function resolveReplyJid(
  remoteJid: string,
  pushName?: string,
  participant?: string
): Promise<{ replyJid: string; telefone: string }> {
  const lidNumber = remoteJid.replace(/@lid$/, "").split(":")[0]
  const fallback = { replyJid: remoteJid, telefone: lidNumber }

  if (!remoteJid.endsWith("@lid")) {
    const telefone = remoteJid.replace(/@s\.whatsapp\.net$/, "").split(":")[0]
    return { replyJid: remoteJid, telefone }
  }

  // ── Estratégia 0: participant do payload (Evolution API v2) ──────────────
  if (participant) {
    const pClean = participant.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, "").split(":")[0].replace(/\D/g, "")
    if (pClean.length >= 10 && !pClean.includes("@")) {
      const jid = pClean.startsWith("55") ? `${pClean}@s.whatsapp.net` : `55${pClean}@s.whatsapp.net`
      console.log(`[WH-LID] Resolvido via participant → ${jid}`)
      return { replyJid: jid, telefone: pClean }
    }
  }

  // ── Estratégia 1: nosso banco tem alguma mensagem saída para este contato ──
  try {
    const msgSaida = await prisma.mensagemWhatsapp.findFirst({
      where: {
        direcao: "saida",
        status: "enviado",
        OR: [
          { telefone: { contains: lidNumber.slice(-8) } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { telefone: true },
    })
    if (msgSaida?.telefone) {
      const clean = msgSaida.telefone.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, "").split(":")[0]
      if (clean.length >= 10 && !clean.includes("@")) {
        const jid = clean.startsWith("55") ? `${clean}@s.whatsapp.net` : `55${clean}@s.whatsapp.net`
        console.log(`[WH-LID] Resolvido via banco (saida) → ${jid}`)
        return { replyJid: jid, telefone: clean.replace(/^55/, "") }
      }
    }
  } catch (e) {
    console.warn("[WH-LID] Falha na busca do banco:", e)
  }

  // ── Estratégia 2: Evolution API findContacts ──────────────────────────────
  try {
    const config = await getWhatsappConfig()
    if (config) {
      // Tenta findContacts primeiro (mais direto)
      const contactRes = await fetch(`${config.instanceUrl}/chat/findContacts/${config.instanceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.apiKey },
        body: JSON.stringify({ where: { id: remoteJid } }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => null)

      if (contactRes?.ok) {
        const contacts = await contactRes.json()
        const contact = Array.isArray(contacts) ? contacts[0] : contacts
        const contactId = contact?.id ?? contact?.remoteJid ?? ""
        if (contactId.endsWith("@s.whatsapp.net")) {
          const tel = contactId.replace(/@s\.whatsapp\.net$/, "").split(":")[0]
          console.log(`[WH-LID] Resolvido via findContacts → ${contactId}`)
          return { replyJid: contactId, telefone: tel }
        }
        // Se o contato tem um pushName e número no objeto
        const cNumber = contact?.number ?? contact?.pushName ?? ""
        if (cNumber && /^\d{10,}$/.test(cNumber.replace(/\D/g, ""))) {
          const numClean = cNumber.replace(/\D/g, "")
          const jid = numClean.startsWith("55") ? `${numClean}@s.whatsapp.net` : `55${numClean}@s.whatsapp.net`
          console.log(`[WH-LID] Resolvido via findContacts number → ${jid}`)
          return { replyJid: jid, telefone: numClean }
        }
      }

      // Fallback: findMessages
      const res = await fetch(`${config.instanceUrl}/chat/findMessages/${config.instanceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.apiKey },
        body: JSON.stringify({ where: { key: { remoteJid } } }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => null)

      if (res?.ok) {
        const msgs = await res.json()
        let ownerNumber = ""
        try {
          const instRes = await fetch(`${config.instanceUrl}/instance/fetchInstances`, {
            headers: { apikey: config.apiKey },
            signal: AbortSignal.timeout(3000),
          })
          if (instRes.ok) {
            const instances = await instRes.json()
            const inst = Array.isArray(instances)
              ? instances.find((i: { instance?: { instanceName?: string } }) => i.instance?.instanceName === config.instanceId)
              : null
            const owner = inst?.instance?.owner ?? inst?.instance?.ownerJid ?? ""
            ownerNumber = owner.replace(/@s\.whatsapp\.net$/, "")
          }
        } catch { /* ignora */ }

        const sentMsg = Array.isArray(msgs) ? msgs.find(
          (m: { key?: { remoteJid?: string; fromMe?: boolean } }) => {
            const rjid = m.key?.remoteJid ?? ""
            const rNumber = rjid.replace(/@s\.whatsapp\.net$/, "")
            return rjid.endsWith("@s.whatsapp.net") &&
              m.key?.fromMe &&
              (!ownerNumber || rNumber !== ownerNumber) &&
              rNumber !== lidNumber
          }
        ) : null
        if (sentMsg?.key?.remoteJid) {
          const realJid = sentMsg.key.remoteJid
          const telefone = realJid.replace(/@s\.whatsapp\.net$/, "").split(":")[0]
          console.log(`[WH-LID] Resolvido via Evolution findMessages → ${realJid}`)
          return { replyJid: realJid, telefone }
        }
      }
    }
  } catch (e) {
    console.warn("[WH-LID] Falha no findContacts/findMessages:", e)
  }

  // ── Estratégia 3: busca pelo pushName no banco ─────────────────────────────
  if (pushName) {
    try {
      const firstName = pushName.split(" ")[0]
      const [vm, user, ed] = await Promise.all([
        prisma.videomaker.findFirst({
          where: { nome: { contains: firstName, mode: "insensitive" } },
          select: { nome: true, telefone: true },
        }),
        prisma.usuario.findFirst({
          where: { nome: { contains: firstName, mode: "insensitive" } },
          select: { nome: true, telefone: true },
        }),
        prisma.editor.findFirst({
          where: { nome: { contains: firstName, mode: "insensitive" } },
          select: { nome: true, telefone: true },
        }),
      ])
      const found = vm ?? user ?? ed
      if (found?.telefone) {
        const tel = found.telefone.replace(/\D/g, "")
        if (tel.length >= 10) {
          const jid = tel.startsWith("55") ? `${tel}@s.whatsapp.net` : `55${tel}@s.whatsapp.net`
          console.log(`[WH-LID] Resolvido via pushName "${pushName}" (${found.nome}) → ${jid}`)
          return { replyJid: jid, telefone: tel.replace(/^55/, "") }
        }
      }
    } catch (e) {
      console.warn("[WH-LID] Falha na busca por pushName:", e)
    }
  }

  // ── Estratégia 4: Evolution API whatsappNumbers — tenta resolver o LID diretamente ──
  try {
    const config = await getWhatsappConfig()
    if (config) {
      // Tenta verificar se a Evolution consegue resolver o @lid via profilePicture ou fetch
      const profileRes = await fetch(`${config.instanceUrl}/chat/fetchProfile/${config.instanceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.apiKey },
        body: JSON.stringify({ number: remoteJid }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => null)

      if (profileRes?.ok) {
        const profile = await profileRes.json()
        const wuid = profile?.wuid ?? profile?.jid ?? ""
        if (wuid && wuid.endsWith("@s.whatsapp.net")) {
          const tel = wuid.replace(/@s\.whatsapp\.net$/, "").split(":")[0]
          console.log(`[WH-LID] Resolvido via fetchProfile → ${wuid}`)
          return { replyJid: wuid, telefone: tel }
        }
        // Alguns retornam o número direto
        const num = profile?.number ?? profile?.numberExists ?? ""
        if (num && /^\d{10,}$/.test(String(num).replace(/\D/g, ""))) {
          const numClean = String(num).replace(/\D/g, "")
          const jid = numClean.startsWith("55") ? `${numClean}@s.whatsapp.net` : `55${numClean}@s.whatsapp.net`
          console.log(`[WH-LID] Resolvido via fetchProfile number → ${jid}`)
          return { replyJid: jid, telefone: numClean }
        }
      }
    }
  } catch (e) {
    console.warn("[WH-LID] Falha no fetchProfile:", e)
  }

  // Se nada funcionou, usa o @lid como replyJid — sendWhatsappMessage vai tentar enviar
  // pelo lidNumber diretamente (a Evolution pode resolver internamente)
  console.warn(`[WH-LID] @lid ${remoteJid} não resolvido — tentando enviar direto pelo lidNumber: ${lidNumber}`)
  return { replyJid: lidNumber, telefone: lidNumber }
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  try {
    await processarMensagem(body)
  } catch (e) {
    console.error("[WH] Erro no processamento:", e)
  }

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

async function processarMensagem(body: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as any
  const event = b?.event as string | undefined
  const data = b?.data

  const eventNorm = event?.toLowerCase().replace(/_/g, ".") ?? ""

  // ── Evento de conexão ──────────────────────────────────────────────────
  if (eventNorm === "connection.update") {
    const state = data?.state ?? data?.status ?? "desconhecido"
    console.log(`[WH-CONN] Estado: ${state}`)
    if (state === "close" || state === "disconnected") {
      console.error("[WH-CONN] ⚠️ WhatsApp DESCONECTADO")
      await prisma.alertaIA.create({
        data: {
          tipoAlerta: "whatsapp_desconectado",
          mensagem: "WhatsApp desconectado. Acesse Configurações → WhatsApp para reconectar via QR Code.",
          severidade: "critico",
          acaoSugerida: "Acessar /configuracoes e reconectar o WhatsApp",
          status: "ativo",
        },
      }).catch(() => null)
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
      where: { conteudo: { startsWith: `[id:${messageId}]` } },
    }).catch(() => null)
    if (jaProcessado) {
      console.log(`[WH-DEDUP] ${messageId} já processada`)
      return
    }
  }

  // Resolve JID real (passa participant do payload para ajudar na resolução @lid)
  const participant = data.key?.participant ?? data.participant ?? ""
  const { replyJid, telefone } = await resolveReplyJid(remoteJid, pushName, participant)

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
  let mediaType: string | null = midia?.mimetype ?? null
  let audioTranscrito: string | null = null

  console.log(`[WH] De: ${remoteJid} (${pushName}) | Reply: ${replyJid} | Tel: ${telefone} | Texto: "${textoOriginal}" | Mídia: ${midia?.tipo ?? "nenhuma"}`)

  if (!telefone) return
  // Permite mensagens sem texto se tiver mídia
  if (!textoOriginal && !midia) return

  // Se @lid não resolvido, ainda processa — a sendWhatsappMessage vai limpar o JID
  // e tentar enviar pelo número puro (funciona na maioria dos casos)
  if (replyJid.endsWith("@lid")) {
    console.warn(`[WH] @lid não resolvido totalmente para "${pushName}" — tentando processar mesmo assim com número: ${telefone}`)
  }

  // ── Processa mídia (download + upload storage) ────────────────────────
  if (midia) {
    try {
      const config = await getWhatsappConfig()
      if (config) {
        const downloaded = await downloadEvolutionMedia(
          config.instanceUrl,
          config.instanceId,
          config.apiKey,
          { key: { id: messageId, remoteJid } }
        )

        if (downloaded) {
          // Upload para Supabase Storage
          mediaUrl = await uploadMedia(downloaded.buffer, downloaded.fileName, downloaded.mimetype)

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
      telefone: { contains: telefone.slice(-8) },
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
    },
  }).catch(() => null)

  // Se recebemos apenas mídia sem texto e sem transcrição
  if (!textoOriginal && midia && !audioTranscrito) {
    if (midia.tipo === "audio") {
      // Áudio que falhou transcrição — avisa e pede para mandar de novo ou digitar
      const msg = `Hey ${pushName?.split(" ")[0] || ""}! Recebi seu áudio, mas não consegui entender. 🎙️\n\nPode tentar mandar de novo ou digitar o que precisa? 😊`
      await sendWhatsappMessage(replyJid, msg)
      return
    }
    const tipoLabel = midia.tipo === "image" ? "imagem" : midia.tipo === "video" ? "vídeo" : midia.tipo === "document" ? "documento" : "arquivo"
    const msg = mediaUrl
      ? `Hey ${pushName?.split(" ")[0] || ""}! Recebi sua ${tipoLabel}! 📎\n\nSe quiser vincular a uma demanda, me diga o código (ex: VID-0023). Ou me conta o que precisa!`
      : `Recebi sua ${tipoLabel}, mas tive um problema ao processar. Pode tentar novamente? 🙏`
    await sendWhatsappMessage(replyJid, msg)
    return
  }

  // ── Identifica quem está falando ────────────────────────────────────────
  const tel8 = telefone.slice(-8)
  const [videomaker, editor, usuario, contatoExistente] = await Promise.all([
    prisma.videomaker.findFirst({
      where: { telefone: { contains: tel8 } },
      select: { id: true, nome: true, telefone: true, cidade: true },
    }),
    prisma.editor.findFirst({
      where: {
        OR: [
          { telefone: { contains: tel8 } },
          { whatsapp: { contains: tel8 } },
        ],
      },
      select: { id: true, nome: true, telefone: true },
    }),
    prisma.usuario.findFirst({
      where: { telefone: { contains: tel8 } },
      select: { id: true, nome: true, tipo: true, telefone: true },
    }),
    prisma.contatoWhatsApp.findFirst({
      where: { telefone: { contains: tel8 } },
    }),
  ])

  // Auto-registra contato se é usuário/videomaker/editor conhecido mas sem ContatoWhatsApp
  if (!contatoExistente && (videomaker || editor || usuario)) {
    const ref = editor ?? videomaker ?? usuario
    const telNorm = telefone.length >= 10 ? (telefone.startsWith("55") ? telefone : `55${telefone}`) : telefone
    await prisma.contatoWhatsApp.upsert({
      where: { telefone: telNorm },
      create: {
        telefone: telNorm,
        nome: ref!.nome,
        tipo: editor ? "editor" : videomaker ? "videomaker" : "usuario",
        referenciaId: ref!.id,
      },
      update: {},
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
  const primeiroNome = identidade.nome ? identidade.nome.split(" ")[0] : ""

  // ── Primeiro contato: pedir nome ────────────────────────────────────────
  if (identidade.tipo === "desconhecido" && !contatoExistente) {
    // Verifica se já perguntamos o nome (olha histórico recente)
    const jaPerguntouNome = historicoRecente.some(m =>
      m.direcao === "saida" && m.conteudo.includes("como posso te chamar")
    )

    if (!jaPerguntouNome) {
      // Primeira mensagem de contato desconhecido — pedir nome
      const msg = `Hey! Aqui é a *NuFlow* 🤖\n\nAinda não nos conhecemos! Como posso te chamar?`
      await sendWhatsappMessage(replyJid, msg)
      return
    }

    // Se já perguntamos e a resposta parece um nome (texto curto sem comando)
    const pareceNome = textoOriginal.length <= 50 && !textoOriginal.includes("/") && !/^(status|agenda|ajuda|menu|sim|não|nao|\?)$/i.test(textoOriginal)
    if (jaPerguntouNome && pareceNome) {
      // Salva o contato com o nome informado
      const nomeContato = textoOriginal.trim()
      const telNorm = telefone.length >= 10 ? (telefone.startsWith("55") ? telefone : `55${telefone}`) : telefone
      await prisma.contatoWhatsApp.upsert({
        where: { telefone: telNorm },
        create: { telefone: telNorm, nome: nomeContato, tipo: "externo" },
        update: { nome: nomeContato },
      }).catch(() => null)

      const msg = `Prazer, *${nomeContato.split(" ")[0]}*! 😊\n\nComo posso te ajudar? Pode me pedir um vídeo, conteúdo, cobertura, ou qualquer coisa!`
      await sendWhatsappMessage(replyJid, msg)
      return
    }
  }

  // ── Comandos estruturados (resposta rápida sem IA) ──────────────────────

  if (textoUpper === "SIM" || textoUpper === "CONFIRMAR") {
    if (videomaker) {
      const demanda = await prisma.demanda.findFirst({
        where: { videomakerId: videomaker.id, statusInterno: "videomaker_notificado" },
        orderBy: { createdAt: "desc" },
      })
      if (demanda) {
        await prisma.$transaction([
          prisma.demanda.update({ where: { id: demanda.id }, data: { statusInterno: "videomaker_aceitou" } }),
          prisma.historicoStatus.create({
            data: { demandaId: demanda.id, statusAnterior: "videomaker_notificado", statusNovo: "videomaker_aceitou", origem: "whatsapp", observacao: "Confirmado via WhatsApp" },
          }),
        ])
        await sendWhatsappMessage(replyJid, `✅ *Captação confirmada!*\n\n📋 *${demanda.codigo}* — ${demanda.titulo}\n\nÓtimo! Aguarde contato com mais detalhes. 🎬`, demanda.id)
        return
      }
    }
  }

  if (textoUpper === "NÃO" || textoUpper === "NAO" || textoUpper === "RECUSAR" || textoUpper === "RECUSO") {
    if (videomaker) {
      const demanda = await prisma.demanda.findFirst({
        where: { videomakerId: videomaker.id, statusInterno: "videomaker_notificado" },
        orderBy: { createdAt: "desc" },
      })
      if (demanda) {
        await prisma.$transaction([
          prisma.demanda.update({ where: { id: demanda.id }, data: { statusInterno: "videomaker_recusou", videomakerId: null } }),
          prisma.historicoStatus.create({
            data: { demandaId: demanda.id, statusAnterior: "videomaker_notificado", statusNovo: "videomaker_recusou", origem: "whatsapp", observacao: "Recusado via WhatsApp" },
          }),
        ])
        await sendWhatsappMessage(replyJid, `Entendido. Escalaremos outro profissional para *${demanda.codigo}*. Obrigado! 🙏`, demanda.id)
        return
      }
    }
  }

  if (textoUpper === "STATUS" || textoUpper === "MINHAS DEMANDAS") {
    // Funciona para videomakers externos e editores (internos)
    const vmId = videomaker?.id
    const edId = editor?.id
    if (vmId || edId) {
      const demandas = await prisma.demanda.findMany({
        where: {
          ...(vmId ? { videomakerId: vmId } : { editorId: edId }),
          statusInterno: { notIn: ["encerrado", "postado", "entregue_cliente", "expirado"] },
        },
        take: 5, orderBy: { createdAt: "desc" },
      })
      if (demandas.length > 0) {
        const lista = demandas.map(d => `• *${d.codigo}* — ${d.titulo}\n  ↳ ${d.statusInterno}`).join("\n")
        await sendWhatsappMessage(replyJid, `📋 *Suas demandas ativas:*\n\n${lista}\n\nDigite o *código* para mais detalhes.`)
      } else {
        await sendWhatsappMessage(replyJid, `Hey ${primeiroNome}! Você não tem demandas ativas no momento. ✅`)
      }
      return
    }
  }

  if (textoUpper === "AGENDA" || textoUpper === "MINHA AGENDA" || textoUpper === "AGENDA HOJE" || textoUpper === "AGENDA AMANHÃ") {
    // Funciona para videomakers externos E editores (internos)
    const temAgenda = videomaker || editor
    if (temAgenda) {
      const hoje = new Date()
      const diasFuturos = textoUpper.includes("AMANHÃ") ? 2 : 7
      const inicio = textoUpper.includes("AMANHÃ")
        ? new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1)
        : new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
      const fimPeriodo = new Date(inicio.getTime() + diasFuturos * 86400000)

      // Busca eventos por videomakerId OU editorId
      const eventoWhere = editor
        ? { editorId: editor.id, inicio: { gte: inicio, lte: fimPeriodo } }
        : { videomakerId: videomaker!.id, inicio: { gte: inicio, lte: fimPeriodo } }

      const [eventos, captacoes] = await Promise.all([
        prisma.evento.findMany({
          where: eventoWhere,
          orderBy: { inicio: "asc" }, take: 10,
          select: { titulo: true, inicio: true, fim: true, local: true, tipo: true },
        }),
        // Captações agendadas (demandas)
        videomaker ? prisma.demanda.findMany({
          where: {
            videomakerId: videomaker.id,
            dataCaptacao: { gte: inicio, lte: fimPeriodo },
            statusInterno: { notIn: ["encerrado", "postado", "entregue_cliente"] },
          },
          select: { codigo: true, titulo: true, dataCaptacao: true, cidade: true },
        }) : Promise.resolve([]),
      ])

      if (eventos.length === 0 && captacoes.length === 0) {
        await sendWhatsappMessage(replyJid, `📅 Hey ${primeiroNome}! Nenhum compromisso nos próximos ${diasFuturos} dias. ✅`)
      } else {
        const linhasEventos = eventos.map(e =>
          `📌 *${e.titulo}*\n   ${e.inicio.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${e.local ? `\n   📍 ${e.local}` : ""}`
        )
        const linhasCaptacoes = captacoes.map(c =>
          `🎬 *${c.codigo}* — ${c.titulo}\n   ${c.dataCaptacao?.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) ?? "Horário a definir"}${c.cidade ? `\n   📍 ${c.cidade}` : ""}`
        )
        const tudo = [...linhasCaptacoes, ...linhasEventos].join("\n\n")
        await sendWhatsappMessage(replyJid, `📅 *Sua agenda, ${primeiroNome}:*\n\n${tudo}`)
      }
      return
    } else {
      await sendWhatsappMessage(replyJid, `Hey ${primeiroNome}! Agenda é exclusiva para videomakers internos da equipe. 📋`)
      return
    }
  }

  if (textoUpper === "AJUDA" || textoUpper === "MENU" || textoUpper === "?") {
    const menu = identidade.tipo === "videomaker"
      ? `Hey ${primeiroNome}! Aqui é a *NuFlow* 🤖\n\nO que posso fazer por você:\n\n*STATUS* — Suas demandas ativas\n*AGENDA* — Sua agenda\n*SIM / NÃO* — Confirmar/recusar captação\n\n💬 Ou manda uma mensagem livre, áudio ou arquivo!`
      : `Hey ${primeiroNome}! Aqui é a *NuFlow* 🤖\n\nMe manda o que precisa:\n\n💬 Texto, áudio ou arquivo\n📋 "nova demanda: [descrição]"\n🔍 "status da VID-0023"`

    await sendWhatsappMessage(replyJid, menu)
    return
  }

  // ── Saudações → resposta informal ──────────────────────────────────────
  const saudacoes = ["oi", "olá", "ola", "hey", "hi", "bom dia", "boa tarde", "boa noite", "oi!", "olá!", "oii", "oiii", "eae", "eai", "fala", "salve"]
  if (saudacoes.includes(textoOriginal.toLowerCase())) {
    const saudacao = `Hey ${primeiroNome}! Aqui é a *NuFlow* 🤖\n\nComo posso te ajudar? Manda aí!`
    await sendWhatsappMessage(replyJid, saudacao)
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

REGRA CRÍTICA — CRIAÇÃO DE DEMANDAS:
- QUALQUER pessoa pode solicitar uma demanda via WhatsApp — não precisa ser cadastrada.
- Quando alguém pedir um vídeo, conteúdo, cobertura, etc., use estruturar_demanda para organizar.
- Apresente o resumo estruturado e peça confirmação.
- Se confirmar, crie com criar_demanda_rascunho. A demanda cairá automaticamente em APROVAÇÃO.
- SEMPRE passe telefone_solicitante="${telefone}" e nome_solicitante="${primeiroNome}" ao criar.
- Se a descrição for clara e completa, pode criar direto sem pedir confirmação.
- Se faltam dados essenciais (o quê? quando? onde?), pergunte UMA coisa por vez.
- Se recebeu arquivo (📎 acima), pergunte se quer vincular a alguma demanda.

REGRAS DE AGENDA:
- Somente videomakers internos (editor) e videomakers externos têm agenda própria.
- Para agendar: use criar_evento_agenda com editor_id="${idProprioEditor ?? "N/A"}" ou videomaker_id="${idProprioVideomaker ?? "N/A"}".
- A ferramenta VERIFICA CONFLITOS automaticamente. Se houver conflito, repasse as sugestões ao usuário.
- Se pessoa NÃO é videomaker/editor, informe que agenda é exclusiva para equipe interna.
- Para consultar agenda: buscar_agenda_videomaker (funciona para editor também, passe editor_id).
- SEMPRE termine com enviar_whatsapp para responder ao usuário.`

  try {
    await executarAgenteComTools(
      promptSecretaria,
      executarFerramenta,
      MODELO_WHATSAPP,
      5,
      TOOLS_WHATSAPP,
      SYSTEM_WHATSAPP
    )
  } catch (e) {
    console.error("[WhatsApp Secretária] Erro:", e)
    await sendWhatsappMessage(
      replyJid,
      `Hey ${primeiroNome}! Tive um probleminha técnico. Pode mandar de novo? 🙏`
    )
  }
}

// GET — health check
export async function GET() {
  return NextResponse.json({ ok: true, webhook: "NuFlow WhatsApp Secretária IA ativa" })
}
