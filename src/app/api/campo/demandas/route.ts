import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/campo/demandas
// Retorna demandas ativas do videomaker logado
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const vm = await prisma.videomaker.findFirst({
    where: { usuarioId: session.user.id },
    select: { id: true },
  })

  let demandas

  if (vm) {
    demandas = await prisma.demanda.findMany({
      where: {
        videomakerId: vm.id,
        statusVisivel: { notIn: ["finalizado"] },
      },
      select: {
        id: true,
        codigo: true,
        titulo: true,
        descricao: true,
        statusVisivel: true,
        statusInterno: true,
        tipoVideo: true,
        prioridade: true,
        dataLimite: true,
        cidade: true,
        localGravacao: true,
        linkFolderBrutos: true,
        linkFolderFinal: true,
        createdAt: true,
        produtos: {
          select: { produto: { select: { nome: true } } },
          take: 1,
        },
      },
      orderBy: [{ prioridade: "desc" }, { dataLimite: "asc" }],
    })
  } else {
    // Admin/gestor sem videomaker — mostra demandas ativas recentes
    demandas = await prisma.demanda.findMany({
      where: {
        statusVisivel: { notIn: ["finalizado"] },
      },
      select: {
        id: true,
        codigo: true,
        titulo: true,
        descricao: true,
        statusVisivel: true,
        statusInterno: true,
        tipoVideo: true,
        prioridade: true,
        dataLimite: true,
        cidade: true,
        localGravacao: true,
        linkFolderBrutos: true,
        linkFolderFinal: true,
        createdAt: true,
        produtos: {
          select: { produto: { select: { nome: true } } },
          take: 1,
        },
      },
      orderBy: [{ prioridade: "desc" }, { dataLimite: "asc" }],
      take: 20,
    })
  }

  return NextResponse.json({ demandas, videomakerId: vm?.id ?? null })
}
