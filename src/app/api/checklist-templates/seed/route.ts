import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// POST — seed dos templates padrão (idempotente, protegido por token simples)
export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const token = searchParams.get("token")
  if (token !== "nfseed2026") {
    return NextResponse.json({ error: "Token inválido" }, { status: 403 })
  }

  const templates = [
    {
      nome: "Geral",
      tipoVideo: null,
      papel: "geral",
      itens: ["Captar", "Baixar", "Decupar", "Editar", "Subir para pasta temporária Drive", "Enviar para o cliente", "Postar"],
    },
    {
      nome: "Entrega Equipamento — Videomaker Externo",
      tipoVideo: "entrega_equipamento",
      papel: "videomaker_externo",
      itens: ["Captar", "Coletar feedback", "Subir brutos para o Drive", "Anexar nota fiscal"],
    },
    {
      nome: "Entrega Equipamento — Editor",
      tipoVideo: "entrega_equipamento",
      papel: "editor",
      itens: ["Baixar", "Decupar", "Editar", "Subir para aprovação (Drive finalizado)"],
    },
    {
      nome: "Social Media",
      tipoVideo: null,
      papel: "social",
      itens: ["Baixar vídeo aprovado", "Postar (collab com cliente)"],
    },
    {
      nome: "Reels / Stories",
      tipoVideo: "reels",
      papel: "geral",
      itens: ["Captar", "Baixar", "Editar", "Subir para aprovação", "Postar"],
    },
    {
      nome: "VSL (Video Sales Letter)",
      tipoVideo: "vsl",
      papel: "geral",
      itens: ["Roteiro", "Captar", "Baixar", "Decupar", "Editar", "Revisão interna", "Subir para aprovação cliente", "Postar"],
    },
  ]

  const criados: string[] = []

  for (const t of templates) {
    const existente = await prisma.checklistTemplate.findFirst({ where: { nome: t.nome } })
    if (existente) continue

    await prisma.checklistTemplate.create({
      data: {
        nome: t.nome,
        tipoVideo: t.tipoVideo,
        papel: t.papel,
        itens: {
          create: t.itens.map((texto, idx) => ({ texto, ordem: idx })),
        },
      },
    })
    criados.push(t.nome)
  }

  return NextResponse.json({ ok: true, criados, total: criados.length })
}
