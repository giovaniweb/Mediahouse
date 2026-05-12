import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

/**
 * GET /api/auth/setup-drive
 * Redireciona o admin para o fluxo OAuth2 do Google (autorização de acesso ao Drive).
 * Requer sessão autenticada de admin ou gestor.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user?.tipo ?? "")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID não configurado. Adicione a variável de ambiente." },
      { status: 500 }
    )
  }

  const baseUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").trim().replace(/\/$/, "")
  const redirectUri = `${baseUrl}/api/auth/setup-drive/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive",
    access_type: "offline",
    prompt: "consent", // forçar novo refresh_token
    state: "setup-drive", // proteção CSRF básica
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return NextResponse.redirect(authUrl)
}
