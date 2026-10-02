import { NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { criarEstadoDrive, origemDrive, DRIVE_STATE_COOKIE, DRIVE_STATE_TTL } from "@/lib/drive-oauth"
import { validarChaveIntegracao } from "@/lib/integration-secret"

export async function GET() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.json({ error: "Conexão Google não configurada" }, { status: 503 })
  let origem: string
  try { validarChaveIntegracao(); origem = origemDrive() }
  catch { return NextResponse.json({ error: "Proteção da conexão Google não configurada" }, { status: 503 }) }
  const state = await criarEstadoDrive({ usuarioId: acesso.usuarioId, organizacaoId: acesso.organizacaoId })
  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: `${origem}/api/auth/setup-drive/callback`,
    response_type: "code", scope: "https://www.googleapis.com/auth/drive",
    access_type: "offline", prompt: "consent", state,
  })
  const resposta = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  resposta.headers.set("Cache-Control", "no-store")
  resposta.cookies.set(DRIVE_STATE_COOKIE, state, { httpOnly: true, secure: origem.startsWith("https:"), sameSite: "lax", path: "/api/auth/setup-drive", maxAge: DRIVE_STATE_TTL })
  return resposta
}
