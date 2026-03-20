import type { NextAuthConfig } from "next-auth"
import { SignJWT, jwtVerify } from "jose"
import type { JWT } from "next-auth/jwt"

// Gera uma chave de 32 bytes a partir do secret (compatível com HS256)
function getSecretKey(secret: string | Uint8Array) {
  if (typeof secret === "string") {
    return new TextEncoder().encode(secret.slice(0, 32).padEnd(32, "0"))
  }
  return secret
}

// Edge-safe config: sem bcrypt, sem Prisma, sem Node.js APIs
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  trustHost: true,
  // JWT compacto (HS256) — muito menor que o JWE padrão do NextAuth v5
  jwt: {
    async encode({ token, secret }) {
      const key = getSecretKey(Array.isArray(secret) ? secret[0] : secret)
      return new SignJWT(token as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(key)
    },
    async decode({ token, secret }) {
      if (!token) return null
      try {
        const key = getSecretKey(Array.isArray(secret) ? secret[0] : secret)
        const { payload } = await jwtVerify(token, key)
        return payload as unknown as JWT
      } catch {
        return null
      }
    },
  },
  providers: [], // providers com bcrypt/prisma ficam em auth.ts (Node.js only)
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = request.nextUrl

      // Rotas públicas — não precisam de autenticação
      const publicPaths = [
        "/",              // root → redireciona para /sobre (landing page)
        "/login",
        "/esqueci-senha",
        "/redefinir-senha",
        "/avaliar",           // avaliação pública de videomaker via QR
        "/avaliar-editor",    // avaliação pública de editor
        "/cadastrar-demanda", // formulário público de demanda
        "/cadastrar-videomaker", // cadastro público de videomaker
        "/sobre",             // página pública sobre
        "/aprovar",           // aprovação de vídeo pelo cliente
        "/api/auth",
        "/api/publico",
        "/api/whatsapp",      // webhook e envios — acesso externo (Evolution API)
        "/api/cron",          // cron jobs — acesso externo (Vercel)
        "/api/fabricantes",   // lista fabricantes (usado no form público)
        "/convite",           // convite público de videomaker
        "/nf-upload",         // upload público de nota fiscal
        "/api/convites",      // API de convites (aceitar/recusar)
        "/api/nf-upload",     // API de upload de NF
        "/api/me",            // dados do usuário logado
        "/api/permissoes",    // permissões do usuário
      ]
      const isPublic = publicPaths.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
      )

      if (isPublic) {
        // Usuário já logado tentando acessar /login → manda pro dashboard
        if (isLoggedIn && pathname === "/login") {
          return Response.redirect(new URL("/dashboard", request.nextUrl))
        }
        return true
      }

      // Bloqueia não-logados em todas as outras rotas
      if (!isLoggedIn) {
        return false // next-auth redireciona para signIn page
      }

      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.tipo = (user as { tipo: string }).tipo
        token.id = user.id
      }
      // Remove image/picture do token — avatares base64 tornam o JWT enorme (>200KB)
      delete token.picture
      token.image = undefined
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.tipo = token.tipo as string
      }
      return session
    },
  },
}
