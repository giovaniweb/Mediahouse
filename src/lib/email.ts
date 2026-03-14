/**
 * Serviço de e-mail — VideoOps
 * Usa Resend (resend.com) — simples, confiável, ideal para SaaS.
 */

import { Resend } from "resend"
import { prisma } from "@/lib/prisma"

async function getConfig() {
  return prisma.configEmail.findFirst({ orderBy: { createdAt: "desc" } })
}

async function createClient() {
  // Prioridade: variável de ambiente > configuração no banco
  const envKey = process.env.RESEND_API_KEY
  if (envKey) {
    const config = await getConfig().catch(() => null)
    return {
      resend: new Resend(envKey),
      from: config?.senderNome
        ? `"${config.senderNome}" <${config.senderEmail || "onboarding@resend.dev"}>`
        : `"VideoOps" <onboarding@resend.dev>`,
      emailsFinanceiro: config?.emailsFinanceiro ?? [],
    }
  }

  // Fallback: configuração salva no banco
  const config = await getConfig()
  if (!config || !config.ativo || !config.apiKey) return null
  return {
    resend: new Resend(config.apiKey),
    from: `"${config.senderNome || "VideoOps"}" <${config.senderEmail || "onboarding@resend.dev"}>`,
    emailsFinanceiro: config.emailsFinanceiro,
  }
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
  <div style="background:#18181b;padding:24px 32px"><div style="color:#fff;font-size:18px;font-weight:700">🎬 VideoOps</div></div>
  <div style="padding:32px">
    <h2 style="margin:0 0 4px;color:#18181b">Solicitação de Pagamento</h2>
    <p style="color:#71717a;font-size:14px">Uma nota fiscal foi recebida e aguarda pagamento.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr><td style="padding:10px 0;color:#71717a;font-size:13px;width:45%">Videomaker</td><td style="color:#18181b;font-weight:600">${dados.nomeVideomaker}</td></tr>
      ${dados.cpfCnpj ? `<tr><td style="padding:10px 0;color:#71717a;font-size:13px">CPF/CNPJ</td><td>${dados.cpfCnpj}</td></tr>` : ""}
      <tr><td style="padding:10px 0;color:#71717a;font-size:13px">Valor</td><td style="font-weight:600">R$ ${dados.valorDiaria.toFixed(2).replace(".", ",")}</td></tr>
      <tr><td style="padding:10px 0;color:#71717a;font-size:13px">Chave PIX</td><td style="font-family:monospace">${dados.chavePix}</td></tr>
      <tr><td style="padding:10px 0;color:#71717a;font-size:13px">Demanda</td><td>${dados.codigoDemanda} — ${dados.tituloDemanda}</td></tr>
      ${dados.notaFiscalUrl ? `<tr><td style="padding:10px 0;color:#71717a;font-size:13px">Nota Fiscal</td><td><a href="${dados.notaFiscalUrl}">Ver documento →</a></td></tr>` : ""}
    </table>
    <a href="${dados.linkConfirmacao}" style="background:#18181b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">Confirmar Pagamento →</a>
  </div>
</div></body></html>`
}

function templateNFRecebida(nomeVideomaker: string, diasPrazo = 15) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#18181b;padding:24px 32px"><div style="color:#fff;font-size:18px;font-weight:700">🎬 VideoOps</div></div>
  <div style="padding:32px">
    <h2 style="color:#18181b">Obrigado, ${nomeVideomaker}! 🙏</h2>
    <p style="color:#52525b;font-size:15px;line-height:1.6">Recebemos sua nota fiscal. Ela está em análise.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px">
      <strong style="color:#15803d">✅ Prazo:</strong>
      <span style="color:#166534"> até ${diasPrazo} dias úteis após aprovação, via PIX.</span>
    </div>
  </div>
</div></body></html>`
}

function templateResetSenha(nome: string, linkReset: string) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#18181b;padding:24px 32px"><div style="color:#fff;font-size:18px;font-weight:700">🎬 VideoOps</div></div>
  <div style="padding:32px">
    <h2 style="color:#18181b">Redefinição de Senha</h2>
    <p style="color:#52525b;font-size:15px;line-height:1.6">Olá, <strong>${nome}</strong>! Clique abaixo para criar uma nova senha. Válido por <strong>1 hora</strong>.</p>
    <a href="${linkReset}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:24px">Redefinir Minha Senha →</a>
    <p style="color:#71717a;font-size:12px;word-break:break-all">Link: ${linkReset}</p>
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

export async function sendEmailFinanceiro(dados: PagamentoEmailData): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await createClient()
    if (!client) return { ok: false, error: "E-mail não configurado ou inativo" }
    if (!client.emailsFinanceiro.length) return { ok: false, error: "Nenhum e-mail do financeiro configurado" }
    const linkConfirmacao = `${process.env.NEXTAUTH_URL}/custos?aprovar=${dados.custoId}`
    const { error } = await client.resend.emails.send({
      from: client.from,
      to: client.emailsFinanceiro,
      subject: `[VideoOps] Pagamento Pendente — ${dados.nomeVideomaker}`,
      html: templateFinanceiro({ ...dados, linkConfirmacao }),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) { return { ok: false, error: String(err) } }
}

export async function sendEmailVideomakerNFRecebida(
  email: string, nomeVideomaker: string, diasPrazo = 15
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await createClient()
    if (!client) return { ok: false, error: "E-mail não configurado" }
    const { error } = await client.resend.emails.send({
      from: client.from,
      to: [email],
      subject: "[VideoOps] Nota Fiscal Recebida — Obrigado!",
      html: templateNFRecebida(nomeVideomaker, diasPrazo),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) { return { ok: false, error: String(err) } }
}

export async function sendEmailResetSenha(
  destinatario: string, nome: string, token: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await createClient()
    if (!client) return { ok: false, error: "E-mail não configurado" }
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
    const linkReset = `${baseUrl}/redefinir-senha/${token}`
    const { error } = await client.resend.emails.send({
      from: client.from,
      to: [destinatario],
      subject: "[VideoOps] Redefinição de Senha",
      html: templateResetSenha(nome, linkReset),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) { return { ok: false, error: String(err) } }
}

export async function sendEmailTeste(destinatario: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await createClient()
    if (!client) return { ok: false, error: "Resend não configurado ou inativo" }
    const { error } = await client.resend.emails.send({
      from: client.from,
      to: [destinatario],
      subject: "[VideoOps] Teste de E-mail ✅",
      html: `<div style="font-family:sans-serif;padding:32px"><h2>🎉 E-mail funcionando!</h2><p>Resend configurado corretamente no VideoOps.</p></div>`,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) { return { ok: false, error: String(err) } }
}
