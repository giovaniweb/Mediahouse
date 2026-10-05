import NextAuth from "next-auth"
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import { authConfig } from "@/lib/auth.config"
import { desvioDoSubdominio } from "@/lib/subdominio"

// Edge-safe: usa apenas authConfig sem bcrypt/prisma
const { auth } = NextAuth(authConfig)
const middleware = auth as unknown as (req: NextRequest, ev: NextFetchEvent) => Promise<Response | undefined>

// Antes do login: <slug>.nuflow.space/x vira /c/<slug>/x (ver lib/subdominio.ts).
// Tem de vir antes porque o `authorized` olharia o caminho de fora — /pedido
// não é público — e mandaria o cliente para o login. Tudo o que é reescrito
// cai em /c/<slug>/..., que já é público; a API do subdomínio segue pelo login.
export default async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const url = req.nextUrl
  const desvio = desvioDoSubdominio({
    host: req.headers.get("host"),
    caminho: url.pathname,
    busca: url.search,
    protocolo: url.protocol,
  })
  if (desvio?.tipo === "reescrever") {
    const destino = url.clone()
    destino.pathname = desvio.caminho
    return NextResponse.rewrite(destino)
  }
  if (desvio?.tipo === "redirecionar") return NextResponse.redirect(desvio.url, desvio.status)
  return middleware(req, ev)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
}
