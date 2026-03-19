import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/fabricantes/seed?key=nfseed2026 — one-time migration
export async function GET(req: NextRequest) {
  const key = new URL(req.url).searchParams.get("key")
  if (key !== "nfseed2026") return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const produtos = await prisma.produto.findMany({ select: { id: true, categoria: true } })
  const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))] as string[]

  const created: string[] = []
  for (const cat of categorias) {
    await prisma.fabricante.upsert({ where: { nome: cat }, update: {}, create: { nome: cat } })
    created.push(cat)
  }

  const fabricantes = await prisma.fabricante.findMany()
  const fabMap = Object.fromEntries(fabricantes.map(f => [f.nome, f.id]))

  let linked = 0
  for (const p of produtos) {
    if (p.categoria && fabMap[p.categoria]) {
      await prisma.produto.update({ where: { id: p.id }, data: { fabricanteId: fabMap[p.categoria] } })
      linked++
    }
  }

  return NextResponse.json({ created, linked, fabricantes: fabricantes.length })
}
