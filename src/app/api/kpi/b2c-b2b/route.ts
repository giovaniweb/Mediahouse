import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })

  const demandas = await prisma.demanda.findMany({
    select: {
      classificacao: true,
      produtos: {
        select: { produto: { select: { id: true, nome: true } } },
      },
    },
  })

  const total = demandas.length
  const b2cCount = demandas.filter((d) => d.classificacao === "b2c").length
  const b2bCount = demandas.filter((d) => d.classificacao === "b2b").length
  const semCount = demandas.filter((d) => !d.classificacao).length

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  // Per-product breakdown
  const produtoMap = new Map<string, { nome: string; b2c: number; b2b: number; total: number }>()

  for (const d of demandas) {
    for (const dp of d.produtos) {
      const pid = dp.produto.id
      if (!produtoMap.has(pid)) {
        produtoMap.set(pid, { nome: dp.produto.nome, b2c: 0, b2b: 0, total: 0 })
      }
      const entry = produtoMap.get(pid)!
      entry.total++
      if (d.classificacao === "b2c") entry.b2c++
      else if (d.classificacao === "b2b") entry.b2b++
    }
  }

  const porProduto = Array.from(produtoMap.entries()).map(([, v]) => ({
    produto: v.nome,
    b2c: v.b2c,
    b2b: v.b2b,
    total: v.total,
  }))

  const B2C_TARGET = 70
  const B2B_TARGET = 30

  return NextResponse.json({
    total,
    b2c: { count: b2cCount, percent: pct(b2cCount) },
    b2b: { count: b2bCount, percent: pct(b2bCount) },
    sem_classificacao: { count: semCount, percent: pct(semCount) },
    meta: { b2c_target: B2C_TARGET, b2b_target: B2B_TARGET },
    alerta: total > 0 && pct(b2cCount) < B2C_TARGET,
    por_produto: porProduto,
  })
}
