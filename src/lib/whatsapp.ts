import { createHash } from "node:crypto"
import { after } from "next/server"
import { comOrg } from "@/lib/org-contexto"
import { criarSaida, processarSaidas } from "@/lib/whatsapp-outbox"
/**
 * WhatsApp service via Evolution API
 */

import { prisma } from "@/lib/prisma"

// ─── Resolução de organização (SaaS multiempresa) ────────────────────────────
// Organização que recebe tráfego PÚBLICO sem `?org=` — formulários e links que
// já circulam sem identificar a empresa. Deixou de ser "contourline" cravado no
// código: agora é `ORG_PUBLICA_PADRAO`, para que a segunda empresa não herde os
// links da primeira nem o contrário.
//
// Este helper NÃO serve mais de fallback para envio de notificação. Mandar
// WhatsApp pelo número de outra empresa é pior que não mandar — ver
// getWhatsappConfig e resolverOrgEnvio, que agora falham fechado.
let _orgPadraoId: string | null = null
export async function orgPadraoPublica(): Promise<string | null> {
  if (_orgPadraoId) return _orgPadraoId
  const slug = process.env.ORG_PUBLICA_PADRAO || "contourline"
  const org = await prisma.organizacao.findUnique({ where: { slug }, select: { id: true } })
  if (!org) console.error(`[org] ORG_PUBLICA_PADRAO="${slug}" não existe no banco.`)
  _orgPadraoId = org?.id ?? null
  return _orgPadraoId
}

// Config de WhatsApp de uma organização. Sem org, não envia.
export async function getWhatsappConfig(organizacaoId?: string | null) {
  // Sem organização não há resposta certa: usar a config de outra empresa manda
  // a mensagem pelo número dela, com o nome dela, para o contato dela. Falha
  // fechado — não enviar é recuperável, enviar pelo remetente errado não é.
  if (!organizacaoId) {
    console.error("[WhatsApp] getWhatsappConfig sem organização — envio cancelado. Passe organizacaoId.")
    return null
  }
  return prisma.configWhatsapp.findFirst({ where: { organizacaoId, ativo: true } })
}

// Resolve a org de um envio: organizacaoId explícito → organização da demanda.
// Não há mais terceiro degrau: sem nenhum dos dois, o envio é cancelado.
async function resolverOrgEnvio(demandaId?: string, organizacaoId?: string | null): Promise<string | null> {
  if (organizacaoId) return organizacaoId
  if (demandaId) {
    const d = await prisma.demanda.findUnique({ where: { id: demandaId }, select: { organizacaoId: true } }).catch(() => null)
    if (d?.organizacaoId) return d.organizacaoId
  }
  // Sem demanda e sem org explícita, não dá para saber por qual empresa enviar.
  console.error("[WhatsApp] resolverOrgEnvio sem organização — envio cancelado.")
  return null
}

/**
 * Alterna o 9º dígito de um celular brasileiro: "55DD9XXXXXXXX" (13) vira
 * "55DDXXXXXXXX" (12) e vice-versa. Devolve null quando não é celular BR.
 *
 * Contas antigas de WhatsApp têm o JID sem o 9 mesmo com o número comercial
 * tendo — é a origem da maior parte das falhas de entrega.
 */
export function alternar9oDigito(numero: string): string | null {
  if (!numero.startsWith("55")) return null
  const ddd = numero.slice(2, 4)
  const resto = numero.slice(4)
  if (!/^\d{2}$/.test(ddd)) return null

  if (resto.length === 9 && resto.startsWith("9")) return `55${ddd}${resto.slice(1)}`
  if (resto.length === 8) return `55${ddd}9${resto}`
  return null
}

/** Adaptador legado: persiste intenção. "aguardando" NÃO significa entrega.
 * Regras O04 devem fornecer chave própria na mesma transação do fato.
 */
export async function sendWhatsappMessage(telefone: string, mensagem: string, demandaId?: string, organizacaoId?: string | null) {
  const orgId=await resolverOrgEnvio(demandaId,organizacaoId)
  if(!orgId) return null
  try {
    const chave=createHash("sha256").update(JSON.stringify([telefone,mensagem,demandaId??null,new Date().toISOString().slice(0,10)])).digest("hex")
    const saida=await comOrg(orgId,()=>prisma.$transaction(tx=>criarSaida(tx,{
      organizacaoId:orgId,chave,origem:"legado",referencia:demandaId??"aviso",telefone,texto:mensagem,expiraEm:new Date(Date.now()+86400_000),
    })))
    try {after(async()=>{await processarSaidas(orgId).catch(()=>undefined)})} catch { /* consumidor técnico retoma */ }
    if(["falhou","cancelado","expirado","desconhecido"].includes(saida.estado)) return null
    return {id:saida.id,status:saida.estado}
  } catch { console.error("[WhatsApp] Intenção não persistida"); return null }
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

  // Notifica o executor interno (Growth) quando vira responsável pela demanda.
  // Videomaker e editor sempre foram avisados ao serem atribuídos; o responsável
  // do Growth não era, e descobria o trabalho só ao abrir o sistema.
  responsavelAtribuido: (codigo: string, titulo: string, prazo?: string | null) =>
    `📌 ${titulo} (${codigo}) é sua agora.` +
    `${prazo ? `\n\nPrazo: ${prazo}` : ""}` +
    `\n\nOs detalhes estão no sistema.`,

  // ── Lembretes ────────────────────────────────────────────────────────────

  lembreteEvento: (titulo: string, minutosRestantes: number, local?: string | null) =>
    `⏰ ${titulo} começa em ${minutosRestantes} minuto(s)${local ? `, em ${local}` : ""}.`,

  cobrancaAntecipada: (nomeVm: string, descricao: string, valor: string, dataVencimento: string) =>
    `💰 ${nomeVm}, seu pagamento de R$ ${valor} (${descricao}) cai em ${dataVencimento}.`,

  cobrancaVencida: (nomeVm: string, descricao: string, valor: string, diasAtraso: number) =>
    `⚠️ ${nomeVm}, o pagamento de R$ ${valor} (${descricao}) venceu há ${diasAtraso} dia(s).\n\nSe já resolveu, é só ignorar esta mensagem.`,

  cobrancaEscalada: (nomeVm: string, descricao: string, valor: string, diasAtraso: number) =>
    `🚨 ${nomeVm}, o pagamento de R$ ${valor} (${descricao}) está ${diasAtraso} dias em atraso.\n\nPode nos chamar para acertar?`,

  // O bom-dia é a ÚNICA mensagem com dica de bem-estar, e de propósito: chega
  // uma vez por dia, num momento em que a pessoa ainda não está no meio de uma
  // tarefa. Espalhar conselho pelos avisos operacionais faria a equipe parar de
  // ler todos eles — inclusive os que importam.
  // A "dica do dia" saiu daqui. A mensagem passou a carregar cobrança real sobre
  // demanda parada, e num texto que se lê todo dia o enfeite é a parte que se
  // aprende a pular — junto com o que vinha ao lado dele.
  briefingDiario: (nome: string, dataFormatada: string, eventos: number, demandas: number, cobrancas: number, blocoParados?: string) =>
    `☀️ Bom dia, ${nome}! Hoje, ${dataFormatada}:\n\n` +
    `${eventos} evento(s) na agenda\n${demandas} demanda(s) vencendo hoje ou amanhã\n${cobrancas} pagamento(s) em atraso\n` +
    `${blocoParados ? `\n${blocoParados}\n` : ""}` +
    `\nnuflow.space`,
}
