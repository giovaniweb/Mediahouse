import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ehGestor } from "@/lib/papel"
import { escopoSocial } from "@/lib/social"

// Equipe da área Social Media: as social medias da empresa e as linhas de cada
// uma. Todo mundo da área vê; só gestor e admin mudam quem cuida de qual linha.

// GET /api/social/equipe
export async function GET() {
  const session = await auth()
  const escopo = await escopoSocial(session)
  if (escopo instanceof NextResponse) return escopo
  const { organizacaoId } = escopo

  const [membros, linhas] = await Promise.all([
    prisma.usuarioOrganizacao.findMany({
      where: { organizacaoId, usuario: { status: "ativo" }, categoria: { not: "sistema" } },
      select: {
        id: true, papel: true, usuarioId: true,
        usuario: { select: { nome: true, telefone: true } },
        linhasSocial: { select: { linhaProjetoId: true } },
      },
      orderBy: { usuario: { nome: "asc" } },
    }),
    prisma.linhaProjeto.findMany({
      where: { organizacaoId, ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ])

  const pessoa = (m: (typeof membros)[number]) => ({
    usuarioId: m.usuarioId, nome: m.usuario.nome, papel: m.papel, temWhatsapp: !!m.usuario.telefone?.trim(),
    linhas: m.linhasSocial.map((l) => l.linhaProjetoId),
  })
  const ehSocial = (m: (typeof membros)[number]) => m.papel === "social" || m.linhasSocial.length > 0
  return NextResponse.json({
    podeEditar: ehGestor(session),
    linhas,
    socials: membros.filter(ehSocial).map(pessoa),
    // Para o gestor pôr alguém de outro cargo como social de uma linha.
    outros: ehGestor(session) ? membros.filter((m) => !ehSocial(m)).map((m) => ({ usuarioId: m.usuarioId, nome: m.usuario.nome, papel: m.papel })) : [],
  })
}

// PUT /api/social/equipe — { usuarioId, linhaIds[] }: as linhas desta pessoa.
export async function PUT(req: NextRequest) {
  const session = await auth()
  const escopo = await escopoSocial(session)
  if (escopo instanceof NextResponse) return escopo
  if (!ehGestor(session)) return NextResponse.json({ error: "Só gestor ou admin muda as linhas da social." }, { status: 403 })
  const { organizacaoId } = escopo

  const body = await req.json().catch(() => ({}))
  const usuarioId = typeof body.usuarioId === "string" ? body.usuarioId : ""
  const pedidas: string[] = Array.isArray(body.linhaIds) ? body.linhaIds.filter((x: unknown): x is string => typeof x === "string") : []

  const vinculo = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
    select: { id: true },
  })
  if (!vinculo) return NextResponse.json({ error: "Pessoa não encontrada nesta empresa." }, { status: 404 })
  const validas = await prisma.linhaProjeto.findMany({
    where: { id: { in: pedidas }, organizacaoId },
    select: { id: true },
  })

  await prisma.$transaction([
    prisma.socialLinha.deleteMany({ where: { usuarioOrganizacaoId: vinculo.id, organizacaoId } }),
    prisma.socialLinha.createMany({
      data: validas.map((l) => ({ organizacaoId, usuarioOrganizacaoId: vinculo.id, linhaProjetoId: l.id })),
    }),
  ])
  return NextResponse.json({ ok: true, linhas: validas.map((l) => l.id) })
}
