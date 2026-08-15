import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import bcrypt from "bcryptjs"
import crypto from "crypto"

// Alfabeto sem 0/O e 1/l/I: a senha vai ser lida em voz alta ou copiada de um
// print, e esses pares são a fonte de "digitei certo e não entra".
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

function senhaProvisoria(): string {
  const bytes = crypto.randomBytes(10)
  return Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join("")
}

// POST /api/usuarios/[id]/senha — gestor redefine a senha de alguém e recebe a
// nova senha UMA vez, para repassar. Não guardamos o texto: o que fica no banco
// é só o hash, igual a qualquer outra senha.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!ehGestor(session)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params

  // A pessoa precisa ser da MESMA organização de quem está redefinindo — sem
  // isso um gestor redefiniria a senha de alguém de outra empresa.
  const membership = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId: id, organizacaoId } },
    select: { usuario: { select: { id: true, nome: true } } },
  })
  if (!membership) return NextResponse.json({ error: "Pessoa não encontrada nesta empresa." }, { status: 404 })

  const nova = senhaProvisoria()
  await prisma.usuario.update({
    where: { id },
    data: { senhaHash: await bcrypt.hash(nova, 12) },
  })

  // Derruba tokens de "esqueci minha senha" pendentes: depois de uma redefinição
  // manual, um link antigo no e-mail não pode continuar valendo.
  const email = await prisma.usuario.findUnique({ where: { id }, select: { email: true } })
  if (email?.email) {
    await prisma.passwordResetToken.deleteMany({ where: { email: email.email } })
  }

  return NextResponse.json({ senha: nova, nome: membership.usuario.nome })
}
