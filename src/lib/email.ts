/**
 * Serviço de e-mail — NuFlow
 *
 * A credencial e o remetente são globais, definidos exclusivamente nas variáveis
 * de ambiente da implantação. Configurações por organização armazenam apenas os
 * destinatários financeiros; nunca uma API key ou um remetente alternativo.
 */

import { Resend } from "resend"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { filtrarEmails, type Aviso as AvisoPorPessoa } from "@/lib/preferencias-aviso"

export type ResultadoEmail = { ok: boolean; error?: string; emailId?: string }

type ClienteEmail = { resend: Resend; from: string }

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function emailNormalizado(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  const email = valor.trim().toLowerCase()
  return EMAIL_VALIDO.test(email) ? email : null
}

function configuracaoGlobal() {
  const apiKey = process.env.RESEND_API_KEY?.trim() || null
  const senderEmail = emailNormalizado(process.env.RESEND_FROM_EMAIL)
  // Não permite que uma variável mal configurada quebre o cabeçalho do e-mail.
  const senderNome = (process.env.RESEND_FROM_NAME || "NuFlow")
    .replace(/[\r\n"]/g, "")
    .trim() || "NuFlow"

  return { apiKey, senderEmail, senderNome }
}

/** Informações seguras para exibir no painel; a API key jamais sai do servidor. */
export function statusEmailGlobal() {
  const { apiKey, senderEmail, senderNome } = configuracaoGlobal()
  return {
    ativo: Boolean(apiKey && senderEmail),
    senderEmail: senderEmail ?? "",
    senderNome,
  }
}

function createClient(): ClienteEmail | null {
  const { apiKey, senderEmail, senderNome } = configuracaoGlobal()
  if (!apiKey || !senderEmail) {
    console.error("[Email] envio cancelado: defina RESEND_API_KEY e RESEND_FROM_EMAIL na implantação.")
    return null
  }

  return {
    resend: new Resend(apiKey),
    from: `"${senderNome}" <${senderEmail}>`,
  }
}

async function destinatariosFinanceiro(organizacaoId?: string | null): Promise<string[]> {
  if (!organizacaoId) return []
  const config = await prisma.configEmail.findFirst({
    where: { organizacaoId },
    orderBy: { createdAt: "desc" },
    select: { emailsFinanceiro: true },
  })
  return (config?.emailsFinanceiro ?? [])
    .map(emailNormalizado)
    .filter((email): email is string => Boolean(email))
}

async function enviarEmail({
  destinatarios: lista,
  assunto,
  html,
  evento,
  aviso,
}: {
  destinatarios: string[]
  assunto: string
  html: string
  evento: string
  /** Categoria e card do aviso: tira quem desligou (lib/preferencias-aviso.ts). Sem ele, vai para todos. */
  aviso?: AvisoPorPessoa
}): Promise<ResultadoEmail> {
  const client = createClient()
  if (!client) return { ok: false, error: "E-mail global não configurado" }
  if (!lista.length) return { ok: false, error: "Nenhum destinatário válido" }
  const destinatarios = aviso ? await comOrg(aviso.organizacaoId, () => filtrarEmails(prisma, aviso, lista)) : lista
  if (!destinatarios.length) {
    console.info("[Email] ninguém recebe: as pessoas desligaram este aviso", { evento })
    return { ok: true }
  }

  try {
    const { data, error } = await client.resend.emails.send({
      from: client.from,
      to: destinatarios,
      subject: assuntoSeguro(assunto),
      html,
    })
    if (error) {
      console.error("[Email] Resend recusou o envio", { evento, erro: error.message, destinatarios: destinatarios.length })
      return { ok: false, error: error.message }
    }

    console.info("[Email] enviado", { evento, emailId: data?.id, destinatarios: destinatarios.length })
    return { ok: true, emailId: data?.id }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error("[Email] falha inesperada no envio", { evento, erro: error, destinatarios: destinatarios.length })
    return { ok: false, error }
  }
}

// ─── Escape ──────────────────────────────────────────────────────────────────
//
// Nome, chave PIX, título da demanda e motivo vêm de quem preencheu um
// formulário. Sem escape, um nome como `<a href="...">Clique aqui</a>` saía
// formatado no e-mail do financeiro, com link para onde a pessoa quisesse.
// Todo dado de usuário que entra num template passa por aqui.

/** Texto de usuário para dentro de HTML (conteúdo e atributo entre aspas). */
export function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Link para `href`: só http(s); o resto vira vazio. Escapado para o atributo. */
export function linkSeguro(url: string | null | undefined): string {
  if (!url) return ""
  try {
    const u = new URL(url)
    return u.protocol === "https:" || u.protocol === "http:" ? escaparHtml(u.toString()) : ""
  } catch {
    return ""
  }
}

/** Assunto numa linha só e sem tamanho absurdo. */
export function assuntoSeguro(assunto: string): string {
  return assunto.replace(/[\r\n]+/g, " ").trim().slice(0, 200)
}

// ─── Templates ───────────────────────────────────────────────────────────────

function templateFinanceiro(dados: {
  nomeVideomaker: string; cpfCnpj?: string | null; valorDiaria: number
  chavePix: string; notaFiscalUrl?: string | null; codigoDemanda: string
  tituloDemanda: string; linkConfirmacao: string
}) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#18181b;padding:24px 32px"><div style="color:#fff;font-size:18px;font-weight:700">🎬 NuFlow</div></div>
  <div style="padding:32px">
    <h2 style="margin:0 0 4px;color:#18181b">Solicitação de Pagamento</h2>
    <p style="color:#71717a;font-size:14px">Uma nota fiscal foi recebida e aguarda pagamento.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr><td style="padding:10px 0;color:#71717a;font-size:13px;width:45%">Videomaker</td><td style="color:#18181b;font-weight:600">${escaparHtml(dados.nomeVideomaker)}</td></tr>
      ${dados.cpfCnpj ? `<tr><td style="padding:10px 0;color:#71717a;font-size:13px">CPF/CNPJ</td><td>${escaparHtml(dados.cpfCnpj)}</td></tr>` : ""}
      <tr><td style="padding:10px 0;color:#71717a;font-size:13px">Valor</td><td style="font-weight:600">R$ ${dados.valorDiaria.toFixed(2).replace(".", ",")}</td></tr>
      <tr><td style="padding:10px 0;color:#71717a;font-size:13px">Chave PIX</td><td style="font-family:monospace">${escaparHtml(dados.chavePix)}</td></tr>
      <tr><td style="padding:10px 0;color:#71717a;font-size:13px">Demanda</td><td>${escaparHtml(dados.codigoDemanda)} — ${escaparHtml(dados.tituloDemanda)}</td></tr>
      ${linkSeguro(dados.notaFiscalUrl) ? `<tr><td style="padding:10px 0;color:#71717a;font-size:13px">Nota Fiscal</td><td><a href="${linkSeguro(dados.notaFiscalUrl)}">Ver documento →</a></td></tr>` : ""}
    </table>
    <a href="${linkSeguro(dados.linkConfirmacao)}" style="background:#18181b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">Confirmar Pagamento →</a>
  </div>
</div></body></html>`
}

function templateNFRecebida(nomeVideomaker: string, diasPrazo = 15) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#18181b;padding:24px 32px"><div style="color:#fff;font-size:18px;font-weight:700">🎬 NuFlow</div></div>
  <div style="padding:32px">
    <h2 style="color:#18181b">Obrigado, ${escaparHtml(nomeVideomaker)}! 🙏</h2>
    <p style="color:#52525b;font-size:15px;line-height:1.6">Recebemos sua nota fiscal. Ela está em análise.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px">
      <strong style="color:#15803d">✅ Prazo:</strong>
      <span style="color:#166534"> até ${Math.trunc(Number(diasPrazo)) || 15} dias úteis após aprovação, via PIX.</span>
    </div>
  </div>
</div></body></html>`
}

function templateResetSenha(nome: string, linkReset: string) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#18181b;padding:24px 32px"><div style="color:#fff;font-size:18px;font-weight:700">🎬 NuFlow</div></div>
  <div style="padding:32px">
    <h2 style="color:#18181b">Redefinição de Senha</h2>
    <p style="color:#52525b;font-size:15px;line-height:1.6">Olá, <strong>${escaparHtml(nome)}</strong>! Clique abaixo para criar uma nova senha. Válido por <strong>1 hora</strong>.</p>
    <a href="${linkSeguro(linkReset)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:24px">Redefinir Minha Senha →</a>
    <p style="color:#71717a;font-size:12px;word-break:break-all">Link: ${escaparHtml(linkReset)}</p>
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:14px;margin-top:16px">
      <p style="margin:0;color:#92400e;font-size:13px">⚠️ Se você não solicitou isso, ignore este e-mail.</p>
    </div>
  </div>
</div></body></html>`
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export interface PagamentoEmailData {
  nomeVideomaker: string; cpfCnpj?: string | null; valorDiaria: number
  chavePix: string; notaFiscalUrl?: string | null; codigoDemanda: string
  tituloDemanda: string; custoId: string
}

export async function sendEmailFinanceiro(dados: PagamentoEmailData, organizacaoId?: string | null): Promise<ResultadoEmail> {
  const destinatarios = await destinatariosFinanceiro(organizacaoId)
  if (!destinatarios.length) return { ok: false, error: "Nenhum e-mail do financeiro configurado" }

  const baseUrl = process.env.NEXTAUTH_URL?.trim()
  if (!baseUrl) return { ok: false, error: "NEXTAUTH_URL não configurada" }

  const linkConfirmacao = `${baseUrl.replace(/\/$/, "")}/custos?aprovar=${encodeURIComponent(dados.custoId)}`
  return enviarEmail({
    destinatarios,
    assunto: assuntoSeguro(`[NuFlow] Pagamento Pendente — ${dados.nomeVideomaker}`),
    html: templateFinanceiro({ ...dados, linkConfirmacao }),
    evento: "financeiro-pagamento-pendente",
  })
}

// Aviso para a operação das Gravações Externas (Giovani, 11/11/2026): "toda
// vez que o videomaker anexar o link ou anexar a nota fiscal o sistema manda
// para o email". Quem recebe e o que vai dentro são de
// lib/avisos-entrega-videomaker.ts; aqui só a forma. Tudo o que é de usuário passa por escaparHtml / linkSeguro.
export type AvisoDaOperacaoEmail = {
  titulo: string
  intro: string
  linhas: [rotulo: string, valor: string][]
  /** O primeiro vira o botão; os outros, links abaixo dele. */
  links: { rotulo: string; url: string }[]
  /** Quadros com título abaixo das linhas (ex.: "Dados de pagamento", 12/11/2026). */
  blocos?: { titulo: string; linhas: [rotulo: string, valor: string][] }[]
}

export function templateAvisoDaOperacao(d: AvisoDaOperacaoEmail) {
  const linha = ([rotulo, valor]: [string, string]) =>
    `<tr><td style="padding:10px 0;color:#71717a;font-size:13px;width:40%;vertical-align:top">${escaparHtml(rotulo)}</td><td style="color:#18181b;font-weight:600">${escaparHtml(valor)}</td></tr>`
  const links = d.links.filter((l) => linkSeguro(l.url))
  const [principal, ...outros] = links
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#18181b;padding:24px 32px"><div style="color:#fff;font-size:18px;font-weight:700">🎬 NuFlow</div></div>
  <div style="padding:32px">
    <h2 style="margin:0 0 4px;color:#18181b">${escaparHtml(d.titulo)}</h2>
    <p style="color:#71717a;font-size:14px">${escaparHtml(d.intro)}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      ${d.linhas.map(linha).join("\n      ")}
    </table>
    ${(d.blocos ?? []).filter((b) => b.linhas.length).map((b) => `<div style="background:#f4f4f5;border-radius:8px;padding:12px 16px;margin-bottom:24px">
      <div style="color:#18181b;font-size:13px;font-weight:700;margin-bottom:4px">${escaparHtml(b.titulo)}</div>
      <table style="width:100%;border-collapse:collapse">${b.linhas.map(linha).join("")}</table>
    </div>`).join("\n    ")}
    ${principal ? `<a href="${linkSeguro(principal.url)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">${escaparHtml(principal.rotulo)} →</a>` : ""}
    ${outros.map((l) => `<p style="margin:16px 0 0;font-size:13px"><a href="${linkSeguro(l.url)}" style="color:#2563eb">${escaparHtml(l.rotulo)} →</a></p>`).join("\n    ")}
  </div>
</div></body></html>`
}

export async function sendEmailAvisoDaOperacao(
  destinatarios: (string | null | undefined)[], assunto: string, dados: AvisoDaOperacaoEmail, evento: string,
  aviso?: AvisoPorPessoa,
): Promise<ResultadoEmail> {
  const para = [...new Set(destinatarios.map(emailNormalizado).filter((e): e is string => Boolean(e)))]
  if (!para.length) return { ok: false, error: "Nenhum destinatário válido" }
  return enviarEmail({ destinatarios: para, assunto: `[NuFlow] ${assunto}`, html: templateAvisoDaOperacao(dados), evento, aviso })
}

/**
 * Quem recebe por e-mail cada nota fiscal de videomaker, com os dados de
 * pagamento e a descrição do trabalho (Configurações → E-mail, "E-mail para as
 * notas fiscais"; na Contourline, a Débora — Giovani, 12/11/2026).
 */
export async function destinatariosNotasFiscais(organizacaoId: string): Promise<string[]> {
  const config = await prisma.configEmail.findFirst({
    where: { organizacaoId }, orderBy: { createdAt: "desc" }, select: { emailsNotasFiscais: true },
  })
  return [...new Set((config?.emailsNotasFiscais ?? []).map(emailNormalizado).filter((e): e is string => Boolean(e)))]
}

export async function sendEmailVideomakerNFRecebida(
  email: string, nomeVideomaker: string, diasPrazo = 15
): Promise<ResultadoEmail> {
  const destinatario = emailNormalizado(email)
  if (!destinatario) return { ok: false, error: "Destinatário inválido" }

  return enviarEmail({
    destinatarios: [destinatario],
    assunto: "[NuFlow] Nota Fiscal Recebida — Obrigado!",
    html: templateNFRecebida(nomeVideomaker, diasPrazo),
    evento: "nota-fiscal-recebida",
  })
}

export async function sendEmailResetSenha(destinatario: string, nome: string, token: string): Promise<ResultadoEmail> {
  const email = emailNormalizado(destinatario)
  if (!email) return { ok: false, error: "Destinatário inválido" }

  const baseUrl = process.env.NEXTAUTH_URL?.trim()
  if (!baseUrl) return { ok: false, error: "NEXTAUTH_URL não configurada" }

  const linkReset = `${baseUrl.replace(/\/$/, "")}/redefinir-senha/${token}`
  return enviarEmail({
    destinatarios: [email],
    assunto: "[NuFlow] Redefinição de Senha",
    html: templateResetSenha(nome, linkReset),
    evento: "redefinicao-senha",
  })
}

/** Notificações transacionais que não dependem da configuração de uma organização. */
export async function sendEmailNotificacao({
  destinatario,
  assunto,
  html,
  evento = "notificacao",
  aviso,
}: {
  destinatario: string
  assunto: string
  html: string
  evento?: string
  aviso?: AvisoPorPessoa
}): Promise<ResultadoEmail> {
  const email = emailNormalizado(destinatario)
  if (!email) return { ok: false, error: "Destinatário inválido" }
  return enviarEmail({ destinatarios: [email], assunto, html, evento, aviso })
}

export async function sendEmailTeste(destinatario: string): Promise<ResultadoEmail> {
  return sendEmailNotificacao({
    destinatario,
    assunto: "[NuFlow] Teste de E-mail ✅",
    html: `<div style="font-family:sans-serif;padding:32px"><h2>🎉 E-mail funcionando!</h2><p>O envio global do NuFlow está configurado corretamente.</p></div>`,
    evento: "teste-configuracao",
  })
}
