// "Enviar acesso" na ficha do videomaker (16/11/2026).
//
// Como o videomaker recebia o acesso até aqui: no cadastro pela gestão (POST
// /api/videomakers) e na aprovação do candidato (/aprovar), a conta nasce com a
// senha "nuflow" + 4 últimos dígitos do telefone, e essa senha ia em texto no
// WhatsApp, direto (sem fila), uma vez só. Quem não recebeu, ou perdeu a
// mensagem, ficava sem caminho: não havia reenvio. Os antigos da Contourline
// (35 em 16/11) foram criados por script em março, com e-mail interno
// "<nome>@nuflow.local" e a mesma senha.
//
// O reenvio NÃO repete a senha em texto: usa o link de criar senha da equipe
// (Onda 2A, src/lib/convite-equipe.ts), que vale 7 dias, funciona uma vez e
// anula o anterior. A senha que a pessoa já tinha continua valendo até ela criar
// a nova. O link é por e-mail de login (password_reset_tokens), por isso a
// conta criada aqui recebe um e-mail interno quando o perfil não tem um real,
// como as do script — e o login dela continua sendo o telefone.
import { SENHA_PENDENTE, VALIDADE_CONVITE_DIAS } from "@/lib/convite-equipe"

export const DOMINIO_INTERNO = "@nuflow.local"
/** Um envio por videomaker a cada 5 minutos. */
export const JANELA_REENVIO_SEG = 5 * 60
/** Teto por empresa: 30 envios por hora (protege contra clique em lote). */
export const TETO_EMPRESA_HORA = 30
export const PREFIXO_CHAVE = "acesso-vm:"

export function emailReal(email: string | null | undefined): string | null {
  const e = email?.trim()
  return e && !e.toLowerCase().endsWith(DOMINIO_INTERNO) ? e : null
}

/** E-mail interno de login para a conta criada aqui quando não há e-mail real. */
export function emailInterno(videomakerId: string): string {
  return `videomaker.${videomakerId.toLowerCase().replace(/[^a-z0-9]/g, "")}${DOMINIO_INTERNO}`
}

export type SituacaoConta = "sem_conta" | "aguardando_senha" | "com_senha"
export function situacaoDaConta(senhaHash: string | null | undefined, temConta: boolean): SituacaoConta {
  if (!temConta) return "sem_conta"
  return senhaHash === SENHA_PENDENTE ? "aguardando_senha" : "com_senha"
}

/** "(21) 9••••-5322": o suficiente para a gestão conferir, sem expor o número. */
export function mascararTelefone(telefone: string | null | undefined): string | null {
  const d = telefone?.replace(/\D/g, "") ?? ""
  if (d.length < 8) return null
  const local = d.length > 11 && d.startsWith("55") ? d.slice(2) : d
  const ddd = local.length >= 10 ? local.slice(0, 2) : null
  const resto = ddd ? local.slice(2) : local
  return `${ddd ? `(${ddd}) ` : ""}${resto[0]}••••-${resto.slice(-4)}`
}

export function mascararEmail(email: string | null | undefined): string | null {
  const e = emailReal(email)
  if (!e) return null
  const [nome, dominio] = e.split("@")
  return `${nome.slice(0, 2)}•••@${dominio}`
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] || nome
}

/**
 * Texto do WhatsApp. Segue o da conta criada no cadastro (notificarCredenciaisWhatsapp),
 * trocando a senha pelo link de criar a senha.
 */
export function textoAcessoWhatsapp(d: { nome: string; link: string; telefoneLogin: string | null; emailLogin: string | null; empresa: string }) {
  const login = d.telefoneLogin
    ? `📱 *Login:* seu número de telefone (${d.telefoneLogin})\n`
    : d.emailLogin ? `📧 *Login:* ${d.emailLogin}\n` : ""
  return (
    `Olá, ${primeiroNome(d.nome)}! 👋\n\n` +
    `Seu acesso ao *NuFlow* (${d.empresa}) está pronto:\n\n` +
    `🔗 *Crie sua senha:* ${d.link}\n` +
    login +
    `\nO link vale ${VALIDADE_CONVITE_DIAS} dias e funciona uma vez só. Depois de criar a senha, você já entra no painel. 🔒`
  )
}

function escapar(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

export function htmlAcessoEmail(d: { nome: string; link: string; empresa: string; telefoneLogin: string | null }) {
  const login = d.telefoneLogin
    ? `Para entrar, use seu número de telefone (${escapar(d.telefoneLogin)}) ou este e-mail, com a senha que você criar.`
    : "Para entrar, use este e-mail com a senha que você criar."
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f4f4f5;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#18181b;padding:24px 32px"><div style="color:#fff;font-size:18px;font-weight:700">NuFlow</div></div>
  <div style="padding:32px">
    <h2 style="color:#18181b;margin:0 0 12px">Seu acesso ao NuFlow</h2>
    <p style="color:#52525b;font-size:15px;line-height:1.6">Olá, <strong>${escapar(primeiroNome(d.nome))}</strong>! A <strong>${escapar(d.empresa)}</strong> mandou o seu acesso ao NuFlow, onde ficam as suas gravações.</p>
    <p style="color:#52525b;font-size:15px;line-height:1.6">Crie sua senha pelo botão abaixo. O link vale <strong>${VALIDADE_CONVITE_DIAS} dias</strong> e funciona uma vez só. ${login}</p>
    <a href="${escapar(d.link)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;margin:8px 0 24px">Criar minha senha →</a>
    <p style="color:#71717a;font-size:12px;word-break:break-all">Link: ${escapar(d.link)}</p>
    <p style="color:#a1a1aa;font-size:12px">Se você não esperava esta mensagem, ignore este e-mail.</p>
  </div>
</div></body></html>`
}
