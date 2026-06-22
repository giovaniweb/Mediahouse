import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { getOrgId } from "@/lib/org"

/**
 * GET /api/auth/setup-drive/callback?code=...&state=setup-drive:<organizacaoId>
 * Callback OAuth2 do Google Drive. Troca o authorization code por tokens,
 * busca o email da conta, e salva o refresh_token na ConfigEmpresa da org
 * que iniciou o fluxo (org vem do state; revalidada pela sessão quando possível).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  const baseUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").trim().replace(/\/$/, "")

  // Usuário recusou a autorização
  if (error) {
    return NextResponse.redirect(`${baseUrl}/configuracoes?tab=empresa&drive=recusado`)
  }

  // Aceita "setup-drive" (legado) e "setup-drive:<org>" (atual)
  if (!code || !state || !state.startsWith("setup-drive")) {
    return NextResponse.redirect(`${baseUrl}/configuracoes?tab=empresa&drive=erro`)
  }
  const orgFromState = state.includes(":") ? state.split(":")[1] : null

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/configuracoes?tab=empresa&drive=sem_credenciais`)
  }

  const redirectUri = `${baseUrl}/api/auth/setup-drive/callback`

  // Trocar code por tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  if (!tokenRes.ok) {
    console.error("[setup-drive/callback] Falha ao trocar code:", await tokenRes.text())
    return NextResponse.redirect(`${baseUrl}/configuracoes?tab=empresa&drive=erro_token`)
  }

  const { access_token, refresh_token } = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
  }

  if (!refresh_token || !access_token) {
    console.error("[setup-drive/callback] refresh_token ausente na resposta do Google")
    return NextResponse.redirect(`${baseUrl}/configuracoes?tab=empresa&drive=sem_refresh_token`)
  }

  // Buscar email da conta Google
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  })

  let email = "conta Google"
  if (userRes.ok) {
    const userInfo = (await userRes.json()) as { email?: string }
    email = userInfo.email ?? email
  }

  // Resolve a org dona deste token: prioridade para a sessão atual (mais segura),
  // com fallback para a org embutida no state. Nunca usa findFirst global.
  const session = await auth().catch(() => null)
  const orgFromSession = await getOrgId(session)
  const organizacaoId = orgFromSession ?? orgFromState
  if (!organizacaoId) {
    return NextResponse.redirect(`${baseUrl}/configuracoes?tab=empresa&drive=erro_org`)
  }

  // Salvar na ConfigEmpresa da organização correta (sem findFirst global)
  const existing = await prisma.configEmpresa.findFirst({ where: { organizacaoId }, select: { id: true } })
  if (existing) {
    await prisma.configEmpresa.update({
      where: { id: existing.id },
      data: { googleRefreshToken: refresh_token, googleDriveEmail: email, googleDriveConnectedAt: new Date() },
    })
  } else {
    await prisma.configEmpresa.create({
      data: { organizacaoId, googleRefreshToken: refresh_token, googleDriveEmail: email, googleDriveConnectedAt: new Date() },
    })
  }

  return NextResponse.redirect(
    `${baseUrl}/configuracoes?tab=drive&drive=conectado&email=${encodeURIComponent(email)}`
  )
}
