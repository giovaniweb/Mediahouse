// Validade dos links públicos por credencial (Onda 1, 07/10/2026).
//
// Portal do fornecedor, página da cobertura e relatório executivo valiam para
// sempre. Agora cada link tem data de validade (migration
// 20261102120000_validade_links_publicos) e a tela interna gera outro quando
// precisa. Gerar outro TROCA a credencial: o link antigo para de abrir na hora,
// que é o que se quer quando ele foi parar onde não devia.
//
// Link vencido responde igual a link que não existe (404): a página pública já
// diz "peça um novo link à empresa", e não há por que contar a quem tem um link
// velho que ele já valeu.
import { randomBytes } from "node:crypto"

export const VALIDADE_LINK_DIAS = { fornecedor: 90, cobertura: 180, relatorio: 180 } as const

export function novaValidade(tipo: keyof typeof VALIDADE_LINK_DIAS, agora = Date.now()): Date {
  return new Date(agora + VALIDADE_LINK_DIAS[tipo] * 86400000)
}

/** Filtro Prisma "ainda vale". */
export function vigente(agora = new Date()) {
  return { gt: agora }
}

/** Credencial nova, longa e aleatória (base64url, 32 bytes). */
export function novaCredencial(): string {
  return randomBytes(32).toString("base64url")
}
