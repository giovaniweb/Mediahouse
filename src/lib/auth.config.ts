import type { NextAuthConfig } from "next-auth"
import { SignJWT, jwtVerify } from "jose"
import type { JWT } from "next-auth/jwt"
import { rotaCongelada } from "@/lib/modulos"

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
        "/api/aprovacao-video", // API da aprovação pública (GET token + POST aprovar/feedback)
        "/api/transcode",     // callback do worker de transcodificação (protegido por secret)
        "/api/auth",
        "/api/publico",
        "/api/whatsapp/webhook", // webhook da Evolution API — único /api/whatsapp/* sem sessão
        "/api/cron",          // cron jobs — acesso externo (Vercel)
        "/api/fabricantes",   // lista fabricantes (usado no form público)
        "/convite",           // convite público de videomaker
        "/nf-upload",         // upload público de nota fiscal
        "/api/convites",      // API de convites (aceitar/recusar)
        "/api/nf-upload",     // API de upload de NF
        "/api/me",            // dados do usuário logado
        "/api/permissoes",    // permissões do usuário
        "/galeria",           // galeria pública de vídeos finalizados
        "/e",                 // página pública de download de eventos
        "/api/publico/cobertura", // API pública de coberturas
        "/fornecedor",        // portal público do fornecedor (token)
        "/relatorio-executivo", // relatório executivo público (visualização externa)
        "/api/mcp",           // servidor MCP remoto (autenticado por Bearer token da org)
        "/d",                 // acompanhamento público de demanda (token opt-in, read-only)
        "/api/health",        // liveness p/ monitoramento — não devolve dado de negócio
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

      // Bloqueia não-logados em todas as outras rotas.
      if (!isLoggedIn) {
        // Rota de API precisa de 401 JSON, não do redirect para /login.
        // Devolvendo `false` o next-auth respondia 307: o fetch de GET seguia o
        // redirect e recebia o HTML da página de login (o `res.json()` estourava
        // e a tela esvaziava), e o POST virava `POST /login` → 405. A sessão caía
        // no meio do preenchimento e o usuário só via "erro ao salvar".
        if (pathname.startsWith("/api/")) {
          return new Response(
            JSON.stringify({ error: "Sua sessão expirou. Entre novamente para continuar.", sessaoExpirada: true }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          )
        }
        return false // página: next-auth redireciona para a tela de login
      }

      // Módulos congelados (Growth/Design e Eventos) — bloqueados para todos.
      // Ver src/lib/modulos.ts. Não apaga nada; só desativa o acesso.
      if (rotaCongelada(pathname)) {
        if (pathname.startsWith("/api/")) {
          return new Response(
            JSON.stringify({ error: "Módulo desativado" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          )
        }
        return Response.redirect(new URL("/dashboard", request.nextUrl))
      }

      // Redirecionar usuários mobile do /dashboard para /campo
      if (pathname === "/dashboard") {
        const ua = request.headers.get("user-agent") ?? ""
        const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua)
        if (isMobile) {
          return Response.redirect(new URL("/campo", request.nextUrl))
        }
      }

      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.tipo = (user as { tipo: string }).tipo
        token.id = user.id
        token.organizacaoId = (user as { organizacaoId?: string | null }).organizacaoId ?? null
        token.papel = (user as { papel?: string | null }).papel ?? null
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
        session.user.organizacaoId = (token.organizacaoId as string | null) ?? null
        session.user.papel = (token.papel as string | null) ?? null
      }
      return session
    },
  },
}
