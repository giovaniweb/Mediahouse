import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { executarAgenteComTools, MODELO_RAPIDO } from "@/lib/claude"
import { executarFerramenta } from "@/lib/ia-tools-executor"

export const maxDuration = 60

// POST /api/whatsapp/webhook — Secretária IA completa via WhatsApp
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const event = body.event
    const data = body.data

    if (event !== "messages.upsert") return NextResponse.json({ ok: true })

    const message = data?.message
    if (!message) return NextResponse.json({ ok: true })
    if (data.key?.fromMe) return NextResponse.json({ ok: true })

    const telefone = data.key?.remoteJid?.replace("@s.whatsapp.net", "") ?? ""
    const textoOriginal = (message.conversation ?? message.extendedTextMessage?.text ?? "").trim()
    const textoUpper = textoOriginal.toUpperCase()

    if (!telefone || !textoOriginal) return NextResponse.json({ ok: true })

    // Salva mensagem recebida
    await prisma.mensagemWhatsapp.create({
      data: { telefone, tipoMensagem: "text", conteudo: textoOriginal, direcao: "entrada", status: "recebido" },
    })

    const pushName = data.pushName ?? "Usuário"

    // ── Identifica quem está falando ──────────────────────────────────────────
    const [videomaker, usuario] = await Promise.all([
      prisma.videomaker.findFirst({
        where: { telefone: { contains: telefone.slice(-8) } },
        select: { id: true, nome: true, telefone: true, cidade: true },
      }),
      prisma.usuario.findFirst({
        where: { telefone: { contains: telefone.slice(-8) } },
        select: { id: true, nome: true, tipo: true, telefone: true },
      }),
    ])

    const identidade = videomaker
      ? { tipo: "videomaker" as const, id: videomaker.id, nome: videomaker.nome }
      : usuario
      ? { tipo: "usuario" as const, id: usuario.id, nome: usuario.nome, perfil: usuario.tipo }
      : { tipo: "desconhecido" as const, nome: pushName }

    // ── Comandos estruturados (resposta rápida) ───────────────────────────────
    if (textoUpper === "SIM" || textoUpper === "CONFIRMAR" || textoUpper === "OK") {
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
          await sendWhatsappMessage(telefone, `✅ *Captação confirmada!*\n\n📋 *${demanda.codigo}* — ${demanda.titulo}\n\nÓtimo! Aguarde contato com mais detalhes. 🎬`, demanda.id)
          return NextResponse.json({ ok: true })
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
          await sendWhatsappMessage(telefone, `Entendido. Escalaremos outro profissional para *${demanda.codigo}*. Obrigado! 🙏`, demanda.id)
          return NextResponse.json({ ok: true })
        }
      }
    }

    if (textoUpper === "STATUS" || textoUpper === "MINHAS DEMANDAS") {
      if (videomaker) {
        const demandas = await prisma.demanda.findMany({
          where: { videomakerId: videomaker.id, statusInterno: { notIn: ["encerrado", "postado", "entregue_cliente", "expirado"] } },
          take: 5, orderBy: { createdAt: "desc" },
        })
        if (demandas.length > 0) {
          const lista = demandas.map(d => `• *${d.codigo}* — ${d.titulo}\n  ↳ ${d.statusInterno}`).join("\n")
          await sendWhatsappMessage(telefone, `📋 *Suas demandas ativas:*\n\n${lista}\n\nDigite o *código* de uma demanda para mais detalhes.`)
        } else {
          await sendWhatsappMessage(telefone, `Olá ${videomaker.nome}! Você não tem demandas ativas no momento. ✅`)
        }
        return NextResponse.json({ ok: true })
      }
    }

    if (textoUpper === "AGENDA" || textoUpper === "MINHA AGENDA" || textoUpper === "AGENDA HOJE" || textoUpper === "AGENDA AMANHÃ") {
      if (videomaker) {
        const hoje = new Date()
        const diasFuturos = textoUpper.includes("AMANHÃ") ? 2 : 7
        const inicio = textoUpper.includes("AMANHÃ")
          ? new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1)
          : new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())

        const [eventos, captacoes] = await Promise.all([
          prisma.evento.findMany({
            where: { videomakerId: videomaker.id, inicio: { gte: inicio, lte: new Date(inicio.getTime() + diasFuturos * 86400000) } },
            orderBy: { inicio: "asc" }, take: 10,
            select: { titulo: true, inicio: true, fim: true, local: true, tipo: true },
          }),
          prisma.demanda.findMany({
            where: {
              videomakerId: videomaker.id,
              dataCaptacao: { gte: inicio, lte: new Date(inicio.getTime() + diasFuturos * 86400000) },
              statusInterno: { notIn: ["encerrado", "postado", "entregue_cliente"] },
            },
            select: { codigo: true, titulo: true, dataCaptacao: true, cidade: true },
          }),
        ])

        if (eventos.length === 0 && captacoes.length === 0) {
          await sendWhatsappMessage(telefone, `📅 *Agenda de ${videomaker.nome}*\n\nNenhum compromisso agendado para os próximos ${diasFuturos} dias. ✅`)
        } else {
          const linhasEventos = eventos.map(e =>
            `📌 *${e.titulo}*\n   ${e.inicio.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${e.local ? `\n   📍 ${e.local}` : ""}`
          )
          const linhasCaptacoes = captacoes.map(c =>
            `🎬 *${c.codigo}* — ${c.titulo}\n   ${c.dataCaptacao?.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) ?? "Horário a definir"}${c.cidade ? `\n   📍 ${c.cidade}` : ""}`
          )
          const tudo = [...linhasCaptacoes, ...linhasEventos].join("\n\n")
          await sendWhatsappMessage(telefone, `📅 *Agenda de ${videomaker.nome}*\n\n${tudo}\n\nPrecisa de algo mais? 😊`)
        }
        return NextResponse.json({ ok: true })
      }
    }

    if (textoUpper === "AJUDA" || textoUpper === "MENU" || textoUpper === "?") {
      const menu = identidade.tipo === "videomaker"
        ? `🤖 *NuFlow — Assistente IA*\n\nOlá ${identidade.nome}! Veja o que posso fazer:\n\n*STATUS* — Ver suas demandas ativas\n*AGENDA* — Ver sua agenda completa\n*AGENDA HOJE* — Compromissos de hoje\n*AGENDA AMANHÃ* — Amanhã\n*SIM / NÃO* — Confirmar/recusar captação\n\n💬 Ou me envie uma mensagem livre como:\n• "nova demanda: gravar vídeo institucional"\n• "qual minha agenda de sexta?"\n• "status da VID-0023"`
        : `🤖 *NuFlow — Assistente IA*\n\nOlá! Como posso ajudar?\n\n💬 Me envie uma mensagem livre, como:\n• "nova demanda: precisamos de vídeo para evento"\n• "qual o status da VID-0023?"\n• "agenda do João para semana que vem"`

      await sendWhatsappMessage(telefone, menu)
      return NextResponse.json({ ok: true })
    }

    // ── Saudações curtas → responde com menu ─────────────────────────────────
    const saudacoes = ["oi", "olá", "ola", "hey", "hi", "bom dia", "boa tarde", "boa noite", "oi!", "olá!", "oii", "oiii"]
    if (saudacoes.includes(textoUpper.toLowerCase()) || textoOriginal.length <= 5) {
      const saudacao = identidade.tipo === "videomaker"
        ? `Olá ${identidade.nome}! 👋\n\nDigite *AJUDA* para ver o que posso fazer por você, ou me envie uma mensagem mais detalhada.`
        : `Olá! 👋 Sou o assistente NuFlow.\n\nDigite *AJUDA* para ver os comandos disponíveis, ou me envie uma mensagem descrevendo o que precisa.`
      await sendWhatsappMessage(telefone, saudacao)
      return NextResponse.json({ ok: true })
    }

    // ── Secretária IA com tool-use para mensagens complexas ───────────────────
    if (textoOriginal.length > 5) {
      const contextoIdentidade = identidade.tipo === "videomaker"
        ? `Videomaker: ${identidade.nome} (id: ${identidade.id}, tel: ${telefone})`
        : identidade.tipo === "usuario"
        ? `Usuário sistema: ${identidade.nome} (${identidade.perfil}, tel: ${telefone})`
        : `Pessoa externa: ${identidade.nome} (tel: ${telefone})`

      const promptSecretaria = `Você é a Secretária IA do NuFlow respondendo via WhatsApp.

IDENTIDADE DE QUEM MENSAGEM: ${contextoIdentidade}
MENSAGEM RECEBIDA: "${textoOriginal}"

Analise a mensagem e tome a ação correta:

1. **Consulta de status de demanda** (menciona código como VID-XXXX ou pergunta sobre projeto):
   → Use buscar_demanda_por_codigo para encontrar e responder com o status atual

2. **Nova demanda** (menciona criar, gravar, fazer vídeo, projeto novo):
   → Use criar_demanda_rascunho para registrar
   → Confirme para o usuário com o código gerado

3. **Consulta de agenda** (menciona agenda, horário, semana, compromisso):
   → Use buscar_agenda_videomaker para mostrar a agenda
   → Formate de forma clara e amigável

4. **Criar evento na agenda** (pede para agendar, marcar, bloquear data):
   → Use criar_evento_agenda para criar
   → Confirme o agendamento

5. **Pergunta sobre o sistema / dúvida** → Responda diretamente sem usar tools

6. **Pedido de relatório / métricas** (apenas para usuários gestores):
   → Use buscar_metricas e responda com resumo

DEPOIS de usar as tools necessárias, use enviar_whatsapp com:
- telefone: "${telefone}"
- Uma resposta concisa, amigável e bem formatada (use *negrito* para destaques)
- Máximo 10 linhas
- Termine com uma oferta de ajuda adicional

Se não conseguir identificar a intenção, envie uma mensagem amigável pedindo mais detalhes.`

      try {
        await executarAgenteComTools(
          promptSecretaria,
          executarFerramenta,
          MODELO_RAPIDO,
          5
        )
        return NextResponse.json({ ok: true, processado: "secretaria_ia" })
      } catch (e) {
        console.error("[WhatsApp Secretária] Erro:", e)
        // Fallback: resposta básica
        await sendWhatsappMessage(
          telefone,
          `Olá ${identidade.nome}! 👋\n\nRecebi sua mensagem mas ocorreu um erro temporário. Por favor, tente novamente ou acesse o sistema diretamente.\n\nDigite *AJUDA* para ver os comandos disponíveis.`
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[WhatsApp Webhook] Erro:", e)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

// GET — health check
export async function GET() {
  return NextResponse.json({ ok: true, webhook: "NuFlow WhatsApp Secretária IA ativa" })
}

