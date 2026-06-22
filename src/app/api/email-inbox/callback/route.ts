import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId } from "@/lib/org"
import { encryptSecret } from "@/lib/secret-crypto"
import {
  exchangeMicrosoftCode,
  getMicrosoftProfile,
  verifyMicrosoftOAuthState,
} from "@/lib/microsoft-mail"

function redirect(req: NextRequest, query: string) {
  const base = (process.env.NODE_ENV === "development"
    ? req.nextUrl.origin
    : process.env.NEXTAUTH_URL || req.nextUrl.origin).replace(/\/$/, "")
  return NextResponse.redirect(`${base}/configuracoes?tab=caixa_entrada&${query}`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return redirect(req, "erro=Sessao%20expirada")

  const code = req.nextUrl.searchParams.get("code")
  const state = req.nextUrl.searchParams.get("state")
  const oauthError = req.nextUrl.searchParams.get("error_description")
  if (oauthError) return redirect(req, `erro=${encodeURIComponent(oauthError)}`)
  if (!code || !state) return redirect(req, "erro=Callback%20OAuth%20incompleto")

  try {
    const payload = verifyMicrosoftOAuthState(state)
    if (payload.usuarioId !== session.user.id) throw new Error("Usuário OAuth diferente da sessão.")
    const organizacaoId = await getOrgId(session)
    if (payload.organizacaoId !== organizacaoId) {
      throw new Error("Organização OAuth diferente da sessão.")
    }

    const origin = (process.env.NODE_ENV === "development"
      ? req.nextUrl.origin
      : process.env.NEXTAUTH_URL || req.nextUrl.origin).replace(/\/$/, "")
    const token = await exchangeMicrosoftCode(code, origin)
    const profile = await getMicrosoftProfile(token.access_token)
    if (!token.refresh_token) {
      throw new Error("A Microsoft não retornou acesso offline. Revogue o consentimento e conecte novamente.")
    }

    await prisma.configEmailEntrada.upsert({
      where: { organizacaoId: payload.organizacaoId },
      create: {
        organizacaoId: payload.organizacaoId,
        provedor: "microsoft365",
        emailCaixa: profile.mail || profile.userPrincipalName || null,
        tenantId: process.env.MICROSOFT_TENANT_ID || "common",
        refreshTokenCriptografado: encryptSecret(token.refresh_token),
        assuntoFiltro: "NOVA SOLICITAÇÃO DE VIAGENS E OPERAÇÕES",
        solicitantePadraoId: session.user.id,
        ativo: true,
        conectadoEm: new Date(),
        ultimaSincronizacaoEm: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        ultimoErro: null,
      },
      update: {
        emailCaixa: profile.mail || profile.userPrincipalName || null,
        tenantId: process.env.MICROSOFT_TENANT_ID || "common",
        refreshTokenCriptografado: encryptSecret(token.refresh_token),
        solicitantePadraoId: session.user.id,
        ativo: true,
        conectadoEm: new Date(),
        ultimoErro: null,
      },
    })
    return redirect(req, "conectado=1")
  } catch (error) {
    return redirect(req, `erro=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`)
  }
}
