import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const link = z.union([z.literal(""), z.string().max(500).url().refine(value => ["http:", "https:"].includes(new URL(value).protocol), "Use um link http ou https")]).nullable().optional()
const profileSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  telefone: z.string().max(40).nullable().optional(),
  avatarUrl: z.string().max(3000000).nullable().optional(),
  instagramUrl: link, linkedinUrl: link, portfolioUrl: link,
  bio: z.string().max(500).nullable().optional(),
})

// GET /api/usuarios/me
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      tipo: true,
      status: true,
      avatarUrl: true,
      instagramUrl: true, linkedinUrl: true, portfolioUrl: true, bio: true,
      createdAt: true,
    },
  })

  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  return NextResponse.json({ usuario })
}

// PATCH /api/usuarios/me — atualiza nome, telefone, avatarUrl
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const parsed = profileSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Confira os campos: nome obrigatório, links http/https e bio de até 500 caracteres." }, { status: 400 })
  const usuario = await prisma.usuario.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      avatarUrl: true,
      instagramUrl: true, linkedinUrl: true, portfolioUrl: true, bio: true,
    },
  })

  return NextResponse.json({ usuario })
}
