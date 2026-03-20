import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "./auth.config"

const loginSchema = z.object({
  email: z.string().min(1), // Agora aceita email OU telefone
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Sem PrismaAdapter: usando JWT puro com credentials, não precisamos de tabelas NextAuth no banco
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email ou Telefone", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email: input, password } = parsed.data

        // Detectar se é telefone ou email
        const isPhone = /^\+?\d[\d\s()-]{7,}$/.test(input.trim())
        const cleanDigits = input.replace(/\D/g, "")

        let usuario

        if (isPhone && cleanDigits.length >= 8) {
          // Buscar por telefone — tentar com e sem DDI 55
          const possibleNumbers = [cleanDigits]
          if (cleanDigits.startsWith("55") && cleanDigits.length >= 12) {
            possibleNumbers.push(cleanDigits.slice(2)) // sem DDI
          } else if (cleanDigits.length <= 11) {
            possibleNumbers.push("55" + cleanDigits) // com DDI
          }

          // Buscar por qualquer variação do telefone
          usuario = await prisma.usuario.findFirst({
            where: {
              OR: possibleNumbers.map((num) => ({
                telefone: { contains: num },
              })),
            },
          })
        } else {
          // Buscar por email
          usuario = await prisma.usuario.findUnique({
            where: { email: input.toLowerCase().trim() },
          })
        }

        if (!usuario || usuario.status === "inativo") return null

        const senhaValida = await bcrypt.compare(password, usuario.senhaHash)
        if (!senhaValida) return null

        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          tipo: usuario.tipo,
          // Não incluir image/avatarUrl — base64 tornaria o JWT cookie enorme
        }
      },
    }),
  ],
})
