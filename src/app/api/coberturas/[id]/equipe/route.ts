import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireCoberturaOrg } from "@/lib/org"
import { FORA_DA_REDE, podeEscalarVideomaker } from "@/lib/videomakers-da-rede"
import { semCapacidade } from "@/lib/acesso"

type Params = { params: Promise<{ id: string }> }

async function requireAuth() {
  const session = await auth()
  if (!session?.user) return null
  return session
}

// GET /api/coberturas/[id]/equipe
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const negado = await semCapacidade("verCoberturas")
  if (negado) return negado

  const { id } = await params

  // Sem este guard, trocar o id na URL alcançava cobertura de outra empresa.

  const guard = await requireCoberturaOrg(session, id)

  if (guard instanceof NextResponse) return guard
  const equipe = await prisma.eventoCoberturaEquipe.findMany({
    where: { coberturaId: id },
    include: {
      videomaker: { select: { id: true, nome: true, cidade: true, telefone: true } },
      editor: { select: { id: true, nome: true } },
      usuario: { select: { id: true, nome: true } },
      _count: { select: { uploads: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({ equipe })
}

// POST /api/coberturas/[id]/equipe — adicionar membro
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const negado = await semCapacidade("verCoberturas")
  if (negado) return negado

  const { id } = await params

  // Sem este guard, trocar o id na URL alcançava cobertura de outra empresa.

  const guard = await requireCoberturaOrg(session, id)

  if (guard instanceof NextResponse) return guard

  try {
    const body = await req.json()
    const { token, videomakerId, nome, funcao, diariasTotal, valorDiaria } = body

    // Resolver token unificado (vm:/ed:/user:) → FK direta (sem espelho em eventos)
    let vmId: string | null = videomakerId || null
    let edId: string | null = null
    let usId: string | null = null
    let membroNome: string = nome ?? ""

    if (typeof token === "string" && token.includes(":")) {
      const idx = token.indexOf(":")
      const prefix = token.slice(0, idx)
      const refId = token.slice(idx + 1)
      // Editor e pessoa precisam ser DESTA empresa (auditoria de 18/11/2026):
      // antes qualquer id da plataforma entrava na equipe, e o nome dele vinha
      // junto na resposta.
      if (prefix === "ed") {
        const vinculo = await prisma.editorOrganizacao.findFirst({
          where: { editorId: refId, organizacaoId: guard.organizacaoId, status: "ativo" },
          select: { editor: { select: { nome: true } } },
        })
        if (!vinculo) return NextResponse.json({ error: "Editor não encontrado nesta empresa" }, { status: 404 })
        edId = refId
        if (!membroNome) membroNome = vinculo.editor.nome ?? "Editor"
      } else if (prefix === "user") {
        const vinculo = await prisma.usuarioOrganizacao.findUnique({
          where: { usuarioId_organizacaoId: { usuarioId: refId, organizacaoId: guard.organizacaoId } },
          select: { usuario: { select: { nome: true } } },
        })
        if (!vinculo) return NextResponse.json({ error: "Pessoa não encontrada nesta empresa" }, { status: 404 })
        usId = refId
        if (!membroNome) membroNome = vinculo.usuario.nome ?? "Membro"
      } else {
        vmId = refId
      }
    }

    // Sem a rede (módulo "rede"), a equipe da cobertura leva só videomaker da empresa.
    if (vmId && !(await podeEscalarVideomaker(guard.organizacaoId, vmId))) {
      return NextResponse.json({ error: FORA_DA_REDE }, { status: 403 })
    }

    if (!membroNome && !vmId) {
      return NextResponse.json({ error: "nome, token ou videomakerId é obrigatório" }, { status: 400 })
    }

    // Buscar nome do videomaker se fornecido sem nome
    if (vmId && !membroNome) {
      const vm = await prisma.videomaker.findUnique({
        where: { id: vmId },
        select: { nome: true },
      })
      membroNome = vm?.nome ?? "Videomaker"
    }

    const membro = await prisma.eventoCoberturaEquipe.create({
      data: {
        coberturaId: id,
        videomakerId: vmId,
        editorId: edId,
        usuarioId: usId,
        nome: membroNome.trim(),
        funcao: funcao ?? "captacao",
        diariasTotal: diariasTotal ?? 0,
        valorDiaria: valorDiaria ?? null,
      },
      include: {
        videomaker: { select: { id: true, nome: true } },
        editor: { select: { id: true, nome: true } },
        usuario: { select: { id: true, nome: true } },
      },
    })

    return NextResponse.json({ membro }, { status: 201 })
  } catch (e) {
    console.error("[Equipe] Erro ao adicionar:", e)
    return NextResponse.json({ error: "Erro ao adicionar membro" }, { status: 500 })
  }
}

// DELETE /api/coberturas/[id]/equipe?membroId=X
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const negado = await semCapacidade("verCoberturas")
  if (negado) return negado

  const { id } = await params

  // Sem este guard, trocar o id na URL alcançava cobertura de outra empresa.

  const guard = await requireCoberturaOrg(session, id)

  if (guard instanceof NextResponse) return guard
  const membroId = req.nextUrl.searchParams.get("membroId")

  if (!membroId) return NextResponse.json({ error: "membroId obrigatório" }, { status: 400 })

  try {
    const count = await prisma.eventoCoberturaUpload.count({
      where: { coberturaId: id, membroId },
    })
    if (count > 0) {
      return NextResponse.json(
        { error: `Membro tem ${count} uploads. Remova os uploads antes.` },
        { status: 409 }
      )
    }
    await prisma.eventoCoberturaEquipe.delete({ where: { id: membroId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[Equipe] Erro ao remover:", e)
    return NextResponse.json({ error: "Erro ao remover membro" }, { status: 500 })
  }
}
