import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { ids, action, produtoId, classificacao } = await req.json()

  if (!ids?.length || !action) {
    return NextResponse.json({ error: "ids e action são obrigatórios" }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {}

  switch (action) {
    case "aprovar":
      data.status = "aprovada"
      break
    case "descartar":
      data.status = "descartada"
      break
    case "em_analise":
      data.status = "em_analise"
      break
    case "atribuir_produto":
      if (!produtoId) return NextResponse.json({ error: "produtoId é obrigatório para atribuir_produto" }, { status: 400 })
      data.produtoId = produtoId
      break
    case "classificar":
      if (!classificacao) return NextResponse.json({ error: "classificacao é obrigatória" }, { status: 400 })
      data.classificacao = classificacao
      break
    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  }

  const result = await prisma.ideiaVideo.updateMany({
    where: { id: { in: ids } },
    data,
  })

  return NextResponse.json({ updated: result.count })
}
