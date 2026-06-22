import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

const configSchema = z.object({
  remetenteFiltro: z.string().max(500).nullable().optional(),
  assuntoFiltro: z.string().max(500).nullable().optional(),
  criarDemandaAutomaticamente: z.boolean().optional(),
  solicitantePadraoId: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
})

function canConfigure(tipo?: string | null) {
  return tipo === "admin" || tipo === "gestor"
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const origin = process.env.NODE_ENV === "development"
    ? req.nextUrl.origin
    : (process.env.NEXTAUTH_URL || "https://nuflow.space").replace(/\/$/, "")
  const camposAusentes = [
    !process.env.MICROSOFT_CLIENT_ID ? "MICROSOFT_CLIENT_ID" : null,
    !process.env.MICROSOFT_CLIENT_SECRET ? "MICROSOFT_CLIENT_SECRET" : null,
  ].filter((value): value is string => !!value)

  const [config, membros] = await Promise.all([
    prisma.configEmailEntrada.findUnique({
      where: { organizacaoId },
      select: {
        id: true,
        provedor: true,
        emailCaixa: true,
        remetenteFiltro: true,
        assuntoFiltro: true,
        criarDemandaAutomaticamente: true,
        solicitantePadraoId: true,
        ativo: true,
        conectadoEm: true,
        ultimaSincronizacaoEm: true,
        ultimoErro: true,
        refreshTokenCriptografado: true,
      },
    }),
    prisma.usuarioOrganizacao.findMany({
      where: {
        organizacaoId,
        papel: { in: ["admin", "gestor", "operacao", "solicitante"] },
        usuario: { status: "ativo" },
      },
      include: { usuario: { select: { id: true, nome: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ])

  return NextResponse.json({
    config: config ? {
      ...config,
      conectado: !!config.refreshTokenCriptografado,
      refreshTokenCriptografado: undefined,
    } : null,
    podeConfigurar: canConfigure(session.user.tipo),
    integracaoMicrosoft: {
      pronta: camposAusentes.length === 0,
      camposAusentes,
      redirectUri: `${origin}/api/email-inbox/callback`,
    },
    solicitantes: membros.map((membership) => ({
      id: membership.usuario.id,
      nome: membership.usuario.nome,
      email: membership.usuario.email,
      papel: membership.papel,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!canConfigure(session.user.tipo)) {
    return NextResponse.json({ error: "Apenas admin ou gestor pode configurar a caixa." }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const parsed = configSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const input = parsed.data

  if (input.solicitantePadraoId) {
    const membership = await prisma.usuarioOrganizacao.findFirst({
      where: {
        organizacaoId,
        usuarioId: input.solicitantePadraoId,
        usuario: { status: "ativo" },
      },
      select: { id: true },
    })
    if (!membership) {
      return NextResponse.json({ error: "Solicitante padrão não pertence à organização." }, { status: 400 })
    }
  }

  const config = await prisma.configEmailEntrada.upsert({
    where: { organizacaoId },
    create: {
      organizacaoId,
      remetenteFiltro: input.remetenteFiltro?.trim() || null,
      assuntoFiltro: input.assuntoFiltro?.trim() || null,
      criarDemandaAutomaticamente: input.criarDemandaAutomaticamente ?? false,
      solicitantePadraoId: input.solicitantePadraoId || session.user.id,
      ativo: false,
    },
    update: {
      ...(input.remetenteFiltro !== undefined && {
        remetenteFiltro: input.remetenteFiltro?.trim() || null,
      }),
      ...(input.assuntoFiltro !== undefined && {
        assuntoFiltro: input.assuntoFiltro?.trim() || null,
      }),
      ...(input.criarDemandaAutomaticamente !== undefined && {
        criarDemandaAutomaticamente: input.criarDemandaAutomaticamente,
      }),
      ...(input.solicitantePadraoId !== undefined && {
        solicitantePadraoId: input.solicitantePadraoId,
      }),
      ...(input.ativo !== undefined && { ativo: input.ativo }),
    },
  })

  return NextResponse.json({ ok: true, id: config.id })
}

export async function DELETE() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!canConfigure(session.user.tipo)) {
    return NextResponse.json({ error: "Apenas admin ou gestor pode desconectar a caixa." }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  await prisma.configEmailEntrada.updateMany({
    where: { organizacaoId },
    data: {
      ativo: false,
      refreshTokenCriptografado: null,
      conectadoEm: null,
      ultimoErro: null,
    },
  })
  return NextResponse.json({ ok: true })
}
