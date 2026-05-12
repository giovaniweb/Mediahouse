import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/auth/setup-drive/callback?code=...&state=setup-drive
 * Callback OAuth2 do Google Drive. Troca o authorization code por tokens,
 * busca o email da conta, e salva o refresh_token em ConfigEmpresa.
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

  if (!code || state !== "setup-drive") {
    return NextResponse.redirect(`${baseUrl}/configuracoes?tab=empresa&drive=erro`)
  }

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

  // Salvar no banco (upsert — cria ConfigEmpresa se não existir)
  await prisma.configEmpresa.upsert({
    where: { id: (await prisma.configEmpresa.findFirst({ select: { id: true } }))?.id ?? "singleton" },
    update: {
      googleRefreshToken: refresh_token,
      googleDriveEmail: email,
      googleDriveConnectedAt: new Date(),
    },
    create: {
      googleRefreshToken: refresh_token,
      googleDriveEmail: email,
      googleDriveConnectedAt: new Date(),
    },
  })

  return NextResponse.redirect(
    `${baseUrl}/configuracoes?tab=empresa&drive=conectado&email=${encodeURIComponent(email)}`
  )
}
