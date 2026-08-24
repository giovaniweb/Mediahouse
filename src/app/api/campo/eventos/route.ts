import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId } from "@/lib/org"
import { etiquetasDeOrganizacao } from "@/lib/campo-escopo"

// GET /api/campo/eventos
// Retorna eventos em que o usuário logado está escalado (via Videomaker.usuarioId)
// Fallback para admin/gestor sem Videomaker vinculado: todos os eventos ativos
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  // Buscar Videomaker vinculado ao usuário logado
  const vm = await prisma.videomaker.findFirst({
    where: { usuarioId: session.user.id },
    select: { id: true, nome: true },
  })

  // Admin/gestor sempre vê tudo (mesmo que tenha perfil de videomaker)

  let coberturas

    // Quem tem perfil de videomaker vê O PRÓPRIO trabalho aqui, mesmo sendo admin
  // ou gestor. `/campo` é o app de quem está executando; a visão macro da
  // empresa é o dashboard. Antes, `!isAdmin` excluía justamente quem acumula os
  // dois papéis — e essa pessoa nunca via as demandas dela.
if (vm) {
    // Usuário tem perfil de videomaker → mostra só os eventos em que está na equipe
    coberturas = await prisma.eventoCobertura.findMany({
      where: {
        equipe: { some: { videomakerId: vm.id } },
        status: { in: ["planejamento", "em_andamento"] },
      },
      include: {
        checklist: {
          select: { id: true, dia: true, texto: true, categoria: true, concluido: true },
          orderBy: [{ dia: "asc" }, { categoria: "asc" }, { createdAt: "asc" }],
        },
        uploads: {
          where: { tipo: "video" },
          select: { id: true, dia: true, titulo: true, url: true, thumbnailUrl: true, createdAt: true },
          orderBy: [{ dia: "asc" }, { createdAt: "desc" }],
        },
        equipe: {
          where: { videomakerId: vm.id },
          select: { id: true, funcao: true },
          take: 1,
        },
        _count: { select: { uploads: true, checklist: true } },
      },
      orderBy: { dataInicio: "asc" },
    })
  } else {
    // Admin/gestor (ou usuário sem videomaker) → eventos ativos DA EMPRESA
    // ATIVA. Antes varria todas as empresas da plataforma.
    const organizacaoId = await getOrgId(session)
    if (!organizacaoId) return NextResponse.json({ coberturas: [], multiempresa: false })
    coberturas = await prisma.eventoCobertura.findMany({
      where: {
        organizacaoId,
        status: { in: ["planejamento", "em_andamento"] },
      },
      include: {
        checklist: {
          select: { id: true, dia: true, texto: true, categoria: true, concluido: true },
          orderBy: [{ dia: "asc" }, { categoria: "asc" }, { createdAt: "asc" }],
        },
        uploads: {
          where: { tipo: "video" },
          select: { id: true, dia: true, titulo: true, url: true, thumbnailUrl: true, createdAt: true },
          orderBy: [{ dia: "asc" }, { createdAt: "desc" }],
        },
        equipe: {
          select: { id: true, nome: true, funcao: true },
        },
        _count: { select: { uploads: true, checklist: true } },
      },
      orderBy: { dataInicio: "asc" },
    })
  }

  // Etiqueta com a empresa dona: o videomaker recebe coberturas de mais de uma
  // e precisa saber para quem está gravando.
  const etiquetas = await etiquetasDeOrganizacao(
    coberturas.map((c) => c.organizacaoId).filter(Boolean) as string[]
  )
  return NextResponse.json({
    coberturas: coberturas.map((c) => ({
      ...c,
      empresa: c.organizacaoId ? etiquetas.get(c.organizacaoId) ?? null : null,
    })),
    videomakerId: vm?.id ?? null,
    multiempresa: new Set(coberturas.map((c) => c.organizacaoId).filter(Boolean)).size > 1,
  })
}
