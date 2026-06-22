import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrgId, semOrg } from "@/lib/org"
import { microsoftAuthorizationUrl } from "@/lib/microsoft-mail"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Apenas admin ou gestor pode conectar a caixa." }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  try {
    const origin = (process.env.NODE_ENV === "development"
      ? req.nextUrl.origin
      : process.env.NEXTAUTH_URL || req.nextUrl.origin).replace(/\/$/, "")
    const url = microsoftAuthorizationUrl({
      origin,
      organizacaoId,
      usuarioId: session.user.id,
    })
    if (req.nextUrl.searchParams.get("format") === "json") {
      return NextResponse.json({ url })
    }
    return NextResponse.redirect(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (req.nextUrl.searchParams.get("format") === "json") {
      return NextResponse.json({ error: message }, { status: 503 })
    }
    return NextResponse.redirect(
      new URL(`/configuracoes?tab=caixa_entrada&erro=${encodeURIComponent(message)}`, req.nextUrl.origin)
    )
  }
}
