import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
// O login lê `usuarios` ANTES de existir empresa — é a ordem do problema, não
// um atalho. Sob RLS o cliente normal filtraria por uma empresa que ainda não foi
// descoberta e devolveria vazio: "senha inválida" para quem digitou a certa, para
// todo mundo, de uma vez. Ver src/lib/prisma-auth.ts.
import { prismaAuth } from "@/lib/prisma-auth"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "./auth.config"
import { checarRateLimit, limparRateLimit } from "@/lib/rate-limit"

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

        // Trava de força bruta por identificador: 10 tentativas a cada 15 min.
        const chaveLimite = `login:${input.toLowerCase().trim()}`
        if (!checarRateLimit(chaveLimite, 10, 15 * 60 * 1000).ok) return null

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
          usuario = await prismaAuth.usuario.findFirst({
            where: {
              OR: possibleNumbers.map((num) => ({
                telefone: { contains: num },
              })),
            },
          })
        } else {
          // Buscar por email (email pode ser null no banco, findUnique ignora null)
          const emailInput = input.toLowerCase().trim()
          usuario = await prismaAuth.usuario.findUnique({
            where: { email: emailInput },
          })
        }

        if (!usuario || usuario.status === "inativo") return null

        const senhaValida = await bcrypt.compare(password, usuario.senhaHash)
        if (!senhaValida) return null

        limparRateLimit(chaveLimite)

        // Organização ativa (Fase 1: a primeira/única membership do usuário)
        const membership = await prismaAuth.usuarioOrganizacao.findFirst({
          where: { usuarioId: usuario.id },
          orderBy: { createdAt: "asc" },
          select: { organizacaoId: true, papel: true },
        })

        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          tipo: usuario.tipo,
          organizacaoId: membership?.organizacaoId ?? null,
          papel: membership?.papel ?? usuario.tipo,
          // Não incluir image/avatarUrl — base64 tornaria o JWT cookie enorme
        }
      },
    }),
  ],
})
