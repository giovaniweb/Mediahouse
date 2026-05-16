import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

  let coberturas

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
    // Admin/gestor sem videomaker vinculado → mostra todos os eventos ativos
    coberturas = await prisma.eventoCobertura.findMany({
      where: {
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

  return NextResponse.json({ coberturas, videomakerId: vm?.id ?? null })
}
