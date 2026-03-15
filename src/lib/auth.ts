import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "./auth.config"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Sem PrismaAdapter: usando JWT puro com credentials, não precisamos de tabelas NextAuth no banco
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        const usuario = await prisma.usuario.findUnique({
          where: { email },
        })

        if (!usuario || usuario.status === "inativo") return null

        const senhaValida = await bcrypt.compare(password, usuario.senhaHash)
        if (!senhaValida) return null

        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          tipo: usuario.tipo,
          image: usuario.avatarUrl ?? null,
        }
      },
    }),
  ],
})
