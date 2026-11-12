// Convite por e-mail para a equipe e para o admin de empresa nova (Onda 2A).
//
// Antes, quem cadastrava digitava a senha da pessoa e mandava por fora. Agora a
// pessoa recebe um e-mail com um link que vale 7 dias e cria a própria senha.
//
// Sem tabela nova: o convite é a mesma peça da recuperação de senha.
// - A pessoa nasce com `senhaHash = SENHA_PENDENTE`. Não é um hash bcrypt (60
//   caracteres), então o login nunca confere com ela — o bcryptjs devolve false
//   para hash de outro tamanho. É também o que a tela usa para mostrar
//   "convite pendente".
// - O link é um token em `password_reset_tokens`, com validade de 7 dias em vez
//   de 1 hora, e a senha é trocada pela mesma função do banco da recuperação
//   (redefinir_senha_por_token). Criou a senha, deixou de ser pendente, por
//   qualquer caminho, até pelo "esqueci minha senha".
// - Depois de criar a senha, a pessoa entra direto no painel; é lá que a Onda 3
//   pede o aceite dos Termos no primeiro acesso.
import { randomBytes } from "node:crypto"
import { sendEmailNotificacao, type ResultadoEmail } from "@/lib/email"
import { NOME_PAPEL, type PapelConvite } from "@/lib/papeis-convite"

export const SENHA_PENDENTE = "convite-pendente"
export const VALIDADE_CONVITE_DIAS = 7

export function convitePendente(senhaHash: string | null | undefined): boolean {
  return senhaHash === SENHA_PENDENTE
}

export { PAPEIS_CONVITE, NOME_PAPEL, ehPapelConvite, type PapelConvite } from "@/lib/papeis-convite"

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function emailDoConvite(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  const email = valor.trim().toLowerCase()
  return EMAIL_VALIDO.test(email) && email.length <= 200 ? email : null
}

/** O pedaço de `password_reset_tokens` que o convite usa. Serve ao cliente de
 * dono (criação de empresa, numa transação só) e ao de autenticação (equipe). */
type ClienteToken = {
  passwordResetToken: {
    updateMany(a: { where: { email: string; usedAt: null }; data: { usedAt: Date } }): PromiseLike<unknown>
    create(a: { data: { email: string; token: string; expiresAt: Date } }): PromiseLike<unknown>
  }
}

/** Novo link de primeiro acesso; o anterior deixa de valer. */
export async function gerarTokenConvite(db: ClienteToken, email: string, agora = new Date()): Promise<string> {
  // Marcar como usado, nunca apagar: o papel de autenticação não tem DELETE
  // nesta tabela (ver /api/auth/esqueci-senha).
  await db.passwordResetToken.updateMany({ where: { email, usedAt: null }, data: { usedAt: agora } })
  const token = randomBytes(32).toString("hex")
  await db.passwordResetToken.create({
    data: { email, token, expiresAt: new Date(agora.getTime() + VALIDADE_CONVITE_DIAS * 86400_000) },
  })
  return token
}

function baseUrl() {
  return (process.env.NEXTAUTH_URL?.trim() || "https://nuflow.space").replace(/\/$/, "")
}

export function linkConvite(token: string) {
  return `${baseUrl()}/redefinir-senha/${encodeURIComponent(token)}`
}

function escapar(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Texto do e-mail. `link` nulo = a pessoa já tem senha e só foi adicionada. */
export function htmlConvite(d: { nome: string; empresa: string; papel: PapelConvite; link: string | null; convidadoPor?: string | null }) {
  const destino = d.link ?? `${baseUrl()}/login`
  const quem = d.convidadoPor ? ` por <strong>${escapar(d.convidadoPor)}</strong>` : ""
  const corpo = d.link
    ? `Crie sua senha para entrar. O link vale <strong>${VALIDADE_CONVITE_DIAS} dias</strong>.`
    : "Entre com o e-mail e a senha que você já usa no NuFlow. Se você trabalha em mais de uma empresa, troque pelo seletor no topo da tela."
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f4f4f5;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#18181b;padding:24px 32px"><div style="color:#fff;font-size:18px;font-weight:700">NuFlow</div></div>
  <div style="padding:32px">
    <h2 style="color:#18181b;margin:0 0 12px">Você foi convidado para a ${escapar(d.empresa)}</h2>
    <p style="color:#52525b;font-size:15px;line-height:1.6">Olá, <strong>${escapar(d.nome)}</strong>! Você entrou na equipe da <strong>${escapar(d.empresa)}</strong> no NuFlow como <strong>${escapar(NOME_PAPEL[d.papel])}</strong>${quem}.</p>
    <p style="color:#52525b;font-size:15px;line-height:1.6">${corpo}</p>
    <a href="${escapar(destino)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;margin:8px 0 24px">${d.link ? "Criar minha senha" : "Entrar no NuFlow"} →</a>
    <p style="color:#71717a;font-size:12px;word-break:break-all">Link: ${escapar(destino)}</p>
    <p style="color:#a1a1aa;font-size:12px">Se você não esperava este convite, ignore este e-mail.</p>
  </div>
</div></body></html>`
}

export function enviarEmailConvite(d: Parameters<typeof htmlConvite>[0] & { para: string }): Promise<ResultadoEmail> {
  return sendEmailNotificacao({
    destinatario: d.para,
    assunto: `Convite para a equipe da ${d.empresa.replace(/[\r\n]+/g, " ").slice(0, 120)} no NuFlow`,
    html: htmlConvite(d),
    evento: "convite-equipe",
  })
}
