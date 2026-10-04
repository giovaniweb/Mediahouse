// Utilidades da lista de interessados (/admin/leads), fora do componente para
// poderem ser testadas.

type Linha = { nome: string; email: string; telefone: string; empresa: string; mensagem: string | null; origem: string | null; campanha: string | null; createdAt: string }

/**
 * wa.me com o número que a pessoa digitou. Telefone brasileiro com DDD (10 ou
 * 11 dígitos) ganha o 55; com 12 a 15 dígitos já veio com país. O resto não
 * vira link — melhor nenhum link do que um que abre conversa com outra pessoa.
 */
export function linkWhatsapp(telefone: string): string | null {
  const d = telefone.replace(/\D/g, "")
  if (d.length === 10 || d.length === 11) return `https://wa.me/55${d}`
  if (d.length >= 12 && d.length <= 15) return `https://wa.me/${d}`
  return null
}

// Célula que começa com = + - @ (ou tab/CR) vira fórmula ao abrir no Excel ou
// no Sheets. O formulário é público: o nome pode ser "=HYPERLINK(...)".
function celula(v: string | null): string {
  let s = v ?? ""
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function csvDeInteressados(linhas: Linha[]): string {
  const cab = ["Recebido em", "Nome", "E-mail", "Telefone", "Empresa", "Mensagem", "Origem", "Campanha"]
  const corpo = linhas.map(l => [l.createdAt, l.nome, l.email, l.telefone, l.empresa, l.mensagem, l.origem, l.campanha].map(celula).join(","))
  // BOM: sem ele o Excel abre o UTF-8 como Latin-1 e estraga os acentos.
  return "﻿" + [cab.map(celula).join(","), ...corpo].join("\r\n")
}
