import type { NextAuthConfig } from "next-auth"

// Edge-safe config: sem bcrypt, sem Prisma, sem Node.js APIs
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  trustHost: true, // necessário para Vercel e proxies (evita "Failed to fetch" no signIn)
  providers: [], // providers com bcrypt/prisma ficam em auth.ts (Node.js only)
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = request.nextUrl

      // Rotas públicas — não precisam de autenticação
      const publicPaths = [
        "/login",
        "/esqueci-senha",
        "/redefinir-senha",
        "/avaliar",       // avaliação pública de videomaker via QR
        "/api/auth",
        "/api/publico",
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
