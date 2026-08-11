/**
 * WhatsApp service via Evolution API
 */

import { prisma } from "@/lib/prisma"

// ─── Resolução de organização (SaaS multiempresa) ────────────────────────────
// Cache do id da org Contourline — usado APENAS como fallback legado/temporário
// quando não há contexto de organização (ver resolverOrgEnvio).
let _contourlineOrgId: string | null = null
export async function contourlineOrgId(): Promise<string | null> {
  if (_contourlineOrgId) return _contourlineOrgId
  const org = await prisma.organizacao.findUnique({ where: { slug: "contourline" }, select: { id: true } })
  _contourlineOrgId = org?.id ?? null
  return _contourlineOrgId
}

// Config de WhatsApp de uma organização. Sem org → fallback Contourline (legado).
// Nunca mais usa findFirst({ ativo: true }) global.
export async function getWhatsappConfig(organizacaoId?: string | null) {
  const orgId = organizacaoId ?? (await contourlineOrgId())
  if (!orgId) return null
  if (!organizacaoId) console.warn("[WhatsApp] getWhatsappConfig sem org — fallback Contourline (legado/temporário)")
  return prisma.configWhatsapp.findFirst({ where: { organizacaoId: orgId, ativo: true } })
}

// Resolve a org de um envio: organizacaoId explícito → demandaId → fallback Contourline.
async function resolverOrgEnvio(demandaId?: string, organizacaoId?: string | null): Promise<string | null> {
  if (organizacaoId) return organizacaoId
  if (demandaId) {
    const d = await prisma.demanda.findUnique({ where: { id: demandaId }, select: { organizacaoId: true } }).catch(() => null)
    if (d?.organizacaoId) return d.organizacaoId
  }
  return contourlineOrgId() // fallback legado/temporário
}

export async function sendWhatsappMessage(telefone: string, mensagem: string, demandaId?: string, organizacaoId?: string | null) {
  const orgId = await resolverOrgEnvio(demandaId, organizacaoId)
  const config = await getWhatsappConfig(orgId)
  if (!config) {
    // Org sem WhatsApp conectado — NÃO quebra o fluxo: registra a tentativa e segue.
    console.warn(`[WhatsApp] Org ${orgId ?? "?"} sem WhatsApp conectado — pulando envio`)
    await prisma.mensagemWhatsapp.create({
      data: {
        telefone: telefone.replace(/\D/g, ""),
        tipoMensagem: "text",
        conteudo: mensagem,
        direcao: "saida",
        status: "sem_config",
        ...(orgId && { organizacaoId: orgId }),
        ...(demandaId && { demandaId }),
      },
    }).catch(() => null)
    return null
  }

  // IMPORTANTE: SEMPRE enviar apenas o número puro (sem @s.whatsapp.net / @lid).
  // A Evolution API normaliza internamente — números brasileiros têm quirk do 9º dígito:
  // ex: 5531992271043 → JID real 553192271043@s.whatsapp.net (sem o 9 extra).
  // Se enviarmos o JID direto, a API retorna "exists: false".
  let numero = telefone
    .replace(/@s\.whatsapp\.net$/, "")
    .replace(/@lid$/, "")
    .replace(/:.*/g, "")        // remove sufixos tipo :123
    .replace(/\D/g, "")         // só dígitos

  if (!numero) return null

  // Garante DDI 55 para números brasileiros
  if (numero.length === 10 || numero.length === 11) {
    numero = "55" + numero
  }

  console.log(`[WhatsApp] Enviando para: ${numero} (original: ${telefone})`)

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
      signal: AbortSignal.timeout(15000),
    })

    const json = await res.json()

    if (!res.ok) {
      console.error(`[WhatsApp] Evolution API erro ${res.status}:`, JSON.stringify(json))
    } else {
      console.log(`[WhatsApp] Mensagem enviada para ${numero} — key: ${json?.key?.id ?? "?"}`)
    }

    // Loga no banco
    await prisma.mensagemWhatsapp.create({
      data: {
        telefone: numero,
        tipoMensagem: "text",
        conteudo: mensagem,
        direcao: "saida",
        status: res.ok ? "enviado" : "falhou",
        ...(orgId && { organizacaoId: orgId }),
        ...(demandaId && { demandaId }),
      },
    }).catch(e => console.error("[WhatsApp] Erro ao salvar msg:", e))

    return json
  } catch (e) {
    console.error("[WhatsApp] Erro ao enviar:", e)
    // Falha de rede/timeout é justamente o que acontece quando a instância cai.
    // Antes o erro era engolido e a mensagem sumia sem deixar rastro — quem
    // esperava o aviso simplesmente não recebia e ninguém ficava sabendo.
    // Registrar como "falhou" mantém o conteúdo para reenvio e torna a queda
    // visível em /mensagens.
    await prisma.mensagemWhatsapp.create({
      data: {
        telefone: numero,
        tipoMensagem: "text",
        conteudo: mensagem,
        direcao: "saida",
        status: "falhou",
        ...(orgId && { organizacaoId: orgId }),
        ...(demandaId && { demandaId }),
      },
    }).catch(err => console.error("[WhatsApp] Erro ao salvar msg falhada:", err))
    return null
  }
}

// Templates de mensagens.
//
// Regras que valem para todos, depois de reescrever os originais: a primeira
// linha diz o que aconteceu e o que a pessoa precisa fazer; no máximo um emoji;
// sem cabeçalho "NuFlow — Assunto" (quem recebe já conhece o número, e repetir a
// marca em toda mensagem empurrava o conteúdo para a terceira linha); o código
// da demanda entra junto do título, não como um bloco de campos rotulados.
// Só o link, quando existe, fica sozinho numa linha — é onde a pessoa clica.
export const templates = {
  novaDemandaUrgente: (codigo: string, titulo: string, solicitante: string) =>
    `🚨 Demanda urgente de ${solicitante}: ${titulo} (${codigo}).\n\nPrecisa da sua aprovação para começar.`,

  demandaAprovada: (codigo: string, titulo: string) =>
    `✅ Sua demanda foi aprovada: ${titulo} (${codigo}).\n\nJá entrou na fila de produção — avisamos quando estiver pronta.`,

  videomakertNotificado: (codigo: string, titulo: string, data: string, link?: string) =>
    `🎬 Você foi escalado para uma captação em ${data}: ${titulo} (${codigo}).\n\n${link ? `Confirme se pode:\n${link}` : "Entre em contato com a equipe para confirmar."}`,

  coberturaConfirmacao: (nome: string, codigo: string, titulo: string, data: string, local: string, cidade: string, descricao?: string | null, link?: string) =>
    `🎥 ${nome}, temos uma cobertura em ${data} e queremos saber se você pode.\n\n` +
    `${titulo} (${codigo})\n${local}${cidade ? `, ${cidade}` : ""}` +
    `${descricao ? `\n\n${descricao.slice(0, 300)}${descricao.length > 300 ? "…" : ""}` : ""}\n\n` +
    `Pagamento em até 15 dias após a nota fiscal, que você envia junto com os brutos.\n\n` +
    `${link ? `Confirme aqui:\n${link}` : "Responda esta mensagem para confirmar."}`,

  edicaoFinalizada: (codigo: string, titulo: string) =>
    `✂️ A edição de ${titulo} (${codigo}) ficou pronta e está esperando sua aprovação.`,

  linkAprovacaoVideo: (codigo: string, titulo: string, link: string) =>
    `🎥 Seu vídeo está pronto: ${titulo} (${codigo}).\n\nAssista e aprove — ou peça ajustes — por aqui:\n${link}`,

  captacaoLembrete: (codigo: string, titulo: string, data: string, local: string) =>
    `⏰ Amanhã você tem captação: ${titulo} (${codigo}), ${data}, em ${local}.`,

  // Notifica o solicitante que um profissional foi atribuído à demanda dele
  profissionalSelecionadoSolicitante: (nomeProfissional: string, codigo: string, titulo: string, telefoneProfissional?: string) =>
    `🎬 ${nomeProfissional} vai cuidar de ${titulo} (${codigo}).\n\n` +
    `${telefoneProfissional ? `Fale direto com ele se precisar: ${telefoneProfissional}` : "Qualquer dúvida, é só chamar a equipe."}`,

  // Notifica o editor interno quando é atribuído a uma demanda
  editorSelecionado: (codigo: string, titulo: string) =>
    `✂️ Você ficou com a edição de ${titulo} (${codigo}). Os brutos estão no sistema.`,

  // ── Lembretes ────────────────────────────────────────────────────────────

  lembreteEvento: (titulo: string, minutosRestantes: number, local?: string | null) =>
    `⏰ ${titulo} começa em ${minutosRestantes} minuto(s)${local ? `, em ${local}` : ""}.`,

  cobrancaAntecipada: (nomeVm: string, descricao: string, valor: string, dataVencimento: string) =>
    `💰 ${nomeVm}, seu pagamento de R$ ${valor} (${descricao}) cai em ${dataVencimento}.`,

  cobrancaVencida: (nomeVm: string, descricao: string, valor: string, diasAtraso: number) =>
    `⚠️ ${nomeVm}, o pagamento de R$ ${valor} (${descricao}) venceu há ${diasAtraso} dia(s).\n\nSe já resolveu, é só ignorar esta mensagem.`,

  cobrancaEscalada: (nomeVm: string, descricao: string, valor: string, diasAtraso: number) =>
    `🚨 ${nomeVm}, o pagamento de R$ ${valor} (${descricao}) está ${diasAtraso} dias em atraso.\n\nPode nos chamar para acertar?`,

  briefingDiario: (nome: string, dataFormatada: string, eventos: number, demandas: number, cobrancas: number) =>
    `☀️ Bom dia, ${nome}! Hoje, ${dataFormatada}:\n\n` +
    `${eventos} evento(s) na agenda\n${demandas} demanda(s) vencendo hoje ou amanhã\n${cobrancas} pagamento(s) em atraso\n\n` +
    `nuflow.space`,
}
