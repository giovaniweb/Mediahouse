import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

/** Número completo; LID nunca é telefone. Sem busca por sufixo ou nome. */
export function telefoneCompleto(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.endsWith("@lid")) return null
  const internacional = valor.trim().startsWith("+") || valor.endsWith("@s.whatsapp.net")
  const semJid = valor.replace(/@s\.whatsapp\.net$/, "").replace(/:\d+$/, "")
  if (!/^[+\d\s().-]+$/.test(semJid)) return null
  let digits = semJid.replace(/\D/g, "")
  if (!internacional && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null
}

export async function identidadeWhatsApp(organizacaoId: string, telefone: string, db: Pick<Prisma.TransactionClient, "usuario" | "editor" | "videomaker" | "contatoWhatsApp"> = prisma) {
  const alvo = telefoneCompleto(`${telefone}@s.whatsapp.net`)
  if (!alvo) throw new Error("Remetente não verificável")
  // Normalização em memória preserva números formatados legados, sempre dentro
  // da empresa. Índice canônico poderá substituir esta leitura na migração O02.
  const [usuarios, editores, videomakers, contatos] = await Promise.all([
    db.usuario.findMany({ where: { organizacoes: { some: { organizacaoId } }, telefone: { not: null } }, select: { id: true, nome: true, telefone: true, status: true, organizacoes: { where: { organizacaoId }, select: { papel: true } } } }),
    db.editor.findMany({ where: { vinculos: { some: { organizacaoId, status: "ativo" } } }, select: { id: true, nome: true, telefone: true, whatsapp: true, usuarioId: true, usuario: { select: { status: true } } } }),
    db.videomaker.findMany({ where: { vinculos: { some: { organizacaoId, status: { in: ["ativo", "preferencial"] }, emListaNegra: false } } }, select: { id: true, nome: true, telefone: true, cidade: true, usuarioId: true, usuario: { select: { status: true } } } }),
    db.contatoWhatsApp.findMany({ where: { organizacaoId }, select: { id: true, nome: true, telefone: true } }),
  ])
  const us = usuarios.filter(u => telefoneCompleto(u.telefone) === alvo)
  const ed = editores.filter(u => telefoneCompleto(u.telefone) === alvo || telefoneCompleto(u.whatsapp) === alvo)
  const vm = videomakers.filter(u => telefoneCompleto(u.telefone) === alvo)
  const co = contatos.filter(u => telefoneCompleto(u.telefone) === alvo)
  const identidades = new Set([...us.map(u => u.id), ...ed.flatMap(u => u.usuarioId ? [u.usuarioId] : []), ...vm.flatMap(u => u.usuarioId ? [u.usuarioId] : [])])
  const ambiguo = us.length > 1 || ed.length > 1 || vm.length > 1 || identidades.size > 1 || us.some(u => u.status !== "ativo") || [...ed, ...vm].some(u => u.usuario && u.usuario.status !== "ativo")
  return {
    usuario: !ambiguo && us.length === 1 ? { ...us[0], tipo: us[0].organizacoes[0].papel } : null,
    editor: !ambiguo && ed.length === 1 ? ed[0] : null,
    videomaker: !ambiguo && vm.length === 1 ? vm[0] : null,
    contatoExistente: co.length === 1 ? co[0] : null,
  }
}

/** Usar apenas após validar segredo/instância do webhook. Não aceita cache
 * legado, pushName, participant solto nem últimos dígitos como prova de LID. */
export function jidRecebidoVerificado(remoteJid: unknown, remoteJidAlt: unknown) {
  const real = (v: unknown) => typeof v === "string" && /^\d{10,15}(?::\d+)?@s\.whatsapp\.net$/.test(v) ? telefoneCompleto(v) : null
  const telefone = real(remoteJid) ?? (typeof remoteJid === "string" && /^\d+@lid$/.test(remoteJid) ? real(remoteJidAlt) : null)
  return telefone ? { telefone, replyJid: `${telefone}@s.whatsapp.net` } : null
}
