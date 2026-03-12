import type { NextAuthConfig } from "next-auth"

// Edge-safe config: sem bcrypt, sem Prisma, sem Node.js APIs
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [], // providers com bcrypt/prisma ficam em auth.ts (Node.js only)
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = request.nextUrl

      // Permite chamadas de auth
      if (pathname.startsWith("/api/auth")) return true

      // Redireciona usuário logado que acessa /login
      if (isLoggedIn && pathname === "/login") {
        return Response.redirect(new URL("/dashboard", request.nextUrl))
      }

      // Bloqueia não-logados em rotas protegidas
      if (!isLoggedIn && pathname !== "/login") {
        return false // próximo.js redireciona para signIn page
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
