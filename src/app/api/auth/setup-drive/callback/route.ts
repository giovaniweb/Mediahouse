import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"
import { consumirEstadoDrive, origemDrive, DRIVE_STATE_COOKIE } from "@/lib/drive-oauth"
import { cifrarTokenDrive, lerTokenDrive, validarChaveIntegracao } from "@/lib/integration-secret"

const tokensSchema = z.object({ access_token: z.string().min(1).max(16384), refresh_token: z.string().min(1).max(16384).optional() })
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  let origem: string
  try { origem = origemDrive(); validarChaveIntegracao() }
  catch { return NextResponse.json({ error: "Proteção da conexão Google não configurada" }, { status: 503 }) }
  const finalizar = (estado: string) => {
    const resposta = NextResponse.redirect(`${origem}/configuracoes?tab=drive&drive=${estado}`)
    resposta.headers.set("Cache-Control", "no-store")
    resposta.cookies.set(DRIVE_STATE_COOKIE, "", { httpOnly: true, secure: origem.startsWith("https:"), sameSite: "lax", path: "/api/auth/setup-drive", maxAge: 0 })
    return resposta
  }
  const state = req.nextUrl.searchParams.get("state")
  if (!state || req.cookies.get(DRIVE_STATE_COOKIE)?.value !== state || !await consumirEstadoDrive(state, acesso)) return finalizar("autorizacao_invalida")
  if (req.nextUrl.searchParams.has("error")) return finalizar("recusado")
  const code = req.nextUrl.searchParams.get("code")
  const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!code || !clientId || !clientSecret) return finalizar("sem_credenciais")

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${origem}/api/auth/setup-drive/callback`, grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(20000),
    })
    if (!tokenRes.ok) return finalizar("erro_token")
    const tokens = tokensSchema.safeParse(await tokenRes.json())
    if (!tokens.success) return finalizar("erro_token")
    const contaRes = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {
      headers: { Authorization: `Bearer ${tokens.data.access_token}` }, signal: AbortSignal.timeout(20000),
    })
    if (!contaRes.ok) return finalizar("erro_conta")
    const conta = z.object({ user: z.object({ emailAddress: z.string().email() }) }).safeParse(await contaRes.json())
    if (!conta.success) return finalizar("erro_conta")
    const email = conta.data.user.emailAddress
    // A pessoa pode perder o acesso enquanto aguarda o Google.
    const atual = await requireAcesso("gerenciarConfig")
    if (atual instanceof NextResponse || atual.usuarioId !== acesso.usuarioId || atual.organizacaoId !== acesso.organizacaoId) return finalizar("autorizacao_invalida")
    const { organizacaoId } = acesso
    await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
      // Serializa callbacks distintos da mesma empresa sem rede dentro da transação.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizacaoId}, 0))`
      const existentes = await tx.configEmpresa.findMany({ where: { organizacaoId }, take: 2 })
      if (existentes.length > 1) throw new Error("Configuração duplicada requer conciliação")
      const existing = existentes[0]
      const token = tokens.data.refresh_token || (existing?.googleRefreshToken && existing.googleDriveEmail === email
        ? lerTokenDrive(existing.googleRefreshToken, organizacaoId) : null)
      if (!token) throw new Error("Reconexão necessária")
      const data = { googleRefreshToken: cifrarTokenDrive(token, organizacaoId), googleDriveEmail: email, googleDriveConnectedAt: new Date() }
      if (existing) await tx.configEmpresa.update({ where: { id: existing.id }, data })
      else await tx.configEmpresa.create({ data: { organizacaoId, ...data } })
    }))
    return finalizar("conectado")
  } catch {
    // Nunca registrar corpos de token, code, nonce, cabeçalhos ou credenciais.
    return finalizar("erro_conexao")
  }
}
