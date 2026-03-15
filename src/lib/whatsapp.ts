/**
 * WhatsApp service via Evolution API
 */

import { prisma } from "@/lib/prisma"

export async function getWhatsappConfig() {
  return prisma.configWhatsapp.findFirst({ where: { ativo: true } })
}

export async function sendWhatsappMessage(telefone: string, mensagem: string, demandaId?: string) {
  const config = await getWhatsappConfig()
  if (!config) {
    console.warn("[WhatsApp] Nenhuma configuração ativa encontrada")
    return null
  }

  // Normaliza número: remove +, espaços, etc.
  let numero = telefone.replace(/\D/g, "")
  if (!numero) return null
  // Adiciona DDI 55 (Brasil) se estiver faltando (10 ou 11 dígitos = sem DDI)
  if (numero.length === 10 || numero.length === 11) {
    numero = "55" + numero
  }

  try {
    const res = await fetch(`${config.instanceUrl}/message/sendText/${config.instanceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.apiKey,
      },
      body: JSON.stringify({
        number: numero,
        textMessage: { text: mensagem },
        options: { delay: 1200, presence: "composing" },
      }),
      signal: AbortSignal.timeout(10000),
    })

    const json = await res.json()

    // Loga no banco
    await prisma.mensagemWhatsapp.create({
      data: {
        telefone: numero,
        tipoMensagem: "text",
        conteudo: mensagem,
        direcao: "saida",
        status: res.ok ? "enviado" : "falhou",
        ...(demandaId && { demandaId }),
      },
    })

    return json
  } catch (e) {
    console.error("[WhatsApp] Erro ao enviar:", e)
    return null
  }
}

// Templates de mensagens
export const templates = {
  novaDemandaUrgente: (codigo: string, titulo: string, solicitante: string) =>
    `🚨 *URGÊNCIA — NuFlow*\n\nNova demanda urgente recebida!\n\n📋 *${codigo}* — ${titulo}\n👤 Solicitante: ${solicitante}\n\nAcesse o sistema para aprovar ou recusar.`,

  demandaAprovada: (codigo: string, titulo: string) =>
    `✅ *NuFlow — Demanda Aprovada*\n\nSua demanda foi aprovada!\n\n📋 *${codigo}* — ${titulo}\n\nEm breve nossa equipe entrará em contato. 🎬`,

  videomakertNotificado: (codigo: string, titulo: string, data: string) =>
    `🎬 *NuFlow — Nova Captação*\n\nVocê foi escalado para uma captação!\n\n📋 *${codigo}* — ${titulo}\n📅 Data: ${data}\n\nResponda *SIM* para confirmar ou *NÃO* para recusar.`,

  edicaoFinalizada: (codigo: string, titulo: string) =>
    `✂️ *NuFlow — Edição Concluída*\n\nA edição da sua demanda foi finalizada!\n\n📋 *${codigo}* — ${titulo}\n\nAguardando sua aprovação. Acesse o link enviado. 👆`,

  linkAprovacaoVideo: (codigo: string, titulo: string, link: string) =>
    `🎥 *NuFlow — Aprovação de Vídeo*\n\nSeu vídeo está pronto para revisão!\n\n📋 *${codigo}* — ${titulo}\n\n🔗 Clique para assistir e aprovar:\n${link}\n\n_Você pode aprovar ou solicitar ajustes diretamente pelo link._`,

  captacaoLembrete: (codigo: string, titulo: string, data: string, local: string) =>
    `⏰ *NuFlow — Lembrete de Captação*\n\nAmanhã você tem uma captação agendada!\n\n📋 *${codigo}* — ${titulo}\n📅 ${data}\n📍 ${local}\n\nQualquer dúvida, entre em contato.`,
}
