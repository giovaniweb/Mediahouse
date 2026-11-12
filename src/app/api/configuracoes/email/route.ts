import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { comOrg } from "@/lib/org-contexto"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendEmailTeste, statusEmailGlobal } from "@/lib/email"

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function emailsValidos(valores: unknown): string[] | null {
  if (!Array.isArray(valores) || valores.length > 20) return null
  const emails = valores.map((valor) => typeof valor === "string" ? valor.trim().toLowerCase() : "")
  if (emails.some((email) => !EMAIL_VALIDO.test(email))) return null
  return [...new Set(emails)]
}

// GET /api/configuracoes/email
export async function GET() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const { organizacaoId } = acesso

  const config = await prisma.configEmail.findFirst({
    where: { organizacaoId },
    orderBy: { createdAt: "desc" },
    select: { emailsFinanceiro: true, emailsNotasFiscais: true },
  })
  const global = statusEmailGlobal()

  // API key e remetente não pertencem mais a uma organização e nunca são lidos
  // do banco. A tela recebe apenas o estado global e os destinatários locais.
  return NextResponse.json({
    config: {
      senderEmail: global.senderEmail,
      senderNome: global.senderNome,
      emailsFinanceiro: config?.emailsFinanceiro ?? [],
      emailsNotasFiscais: config?.emailsNotasFiscais ?? [],
      ativo: global.ativo,
    },
  })
}

// POST /api/configuracoes/email
export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso

  const papel = acesso.papel
  if (!["admin", "gestor"].includes(papel ?? "")) {
    return NextResponse.json({ error: "Apenas admin ou gestor pode alterar configurações" }, { status: 403 })
  }
  const { organizacaoId } = acesso

  const body: unknown = await req.json()
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })

  // Testar e-mail
  if ("acao" in body && body.acao === "testar") {
    const destinatario = "destinatario" in body ? body.destinatario : null
    if (typeof destinatario !== "string" || !EMAIL_VALIDO.test(destinatario.trim())) {
      return NextResponse.json({ ok: false, error: "Informe um e-mail válido para teste" }, { status: 400 })
    }
    const resultado = await sendEmailTeste(destinatario)
    return NextResponse.json(resultado)
  }

  // As preferências por organização são só destinatários: quem recebe os avisos
  // financeiros (compras) e quem recebe cada nota fiscal de videomaker com os
  // dados de pagamento (12/11/2026). Credencial e remetente vêm das variáveis
  // globais da Vercel. Campo ausente no corpo = não muda.
  const temFinanceiro = "emailsFinanceiro" in body, temNotas = "emailsNotasFiscais" in body
  const emails = temFinanceiro ? emailsValidos(body.emailsFinanceiro) : null
  const notas = temNotas ? emailsValidos(body.emailsNotasFiscais) : null
  if ((!temFinanceiro && !temNotas) || (temFinanceiro && !emails) || (temNotas && !notas)) {
    return NextResponse.json({ error: "Informe até 20 e-mails válidos, separados por vírgula" }, { status: 400 })
  }

  const igual = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`email:${organizacaoId}`}, 0))`
    const existing = await tx.configEmail.findFirst({ where: { organizacaoId } })
    const data = { ...(emails ? { emailsFinanceiro: emails } : {}), ...(notas ? { emailsNotasFiscais: notas } : {}) }
    const campos = [
      ...(emails && !igual(existing?.emailsFinanceiro ?? [], emails) ? ["emailsFinanceiro"] : []),
      ...(notas && !igual(existing?.emailsNotasFiscais ?? [], notas) ? ["emailsNotasFiscais"] : []),
    ]
    if (existing && !campos.length) return
    const atual = existing
      ? await tx.configEmail.update({ where: { id: existing.id }, data })
      : await tx.configEmail.create({ data: { organizacaoId, emailsFinanceiro: emails ?? [], emailsNotasFiscais: notas ?? [] } })
    await registrarAuditoria(tx, acesso, { acao: "configuracao.alterada", recurso: "config_email", recursoId: atual.id, correlationId: correlacaoAuditoria(), depois: { campos: campos.length ? campos : Object.keys(data) } })
  }))

  return NextResponse.json({ ok: true, ...statusEmailGlobal() })
}
