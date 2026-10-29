import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { acessoAoKit, urlDoKitValida } from "@/lib/kit-videomaker-server"

const SELECAO = { id: true, titulo: true, tipo: true, url: true, texto: true, tipoGravacao: true, ordem: true } as const

// GET /api/gravacoes/kit — o kit do videomaker da empresa.
export async function GET() {
  const acesso = await acessoAoKit(false)
  if (acesso instanceof NextResponse) return acesso
  const editor = await acessoAoKit(true)
  const materiais = await comOrg(acesso.organizacaoId, () => prisma.materialVideomaker.findMany({
    where: { organizacaoId: acesso.organizacaoId }, select: SELECAO, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
  }))
  return NextResponse.json({ materiais, podeEditar: !(editor instanceof NextResponse) })
}

const corpo = z.object({
  titulo: z.string().trim().min(2).max(120),
  tipo: z.enum(["guia", "referencia", "colinha"]),
  url: z.string().trim().max(2000).optional(),
  texto: z.string().trim().max(4000).optional(),
  tipoGravacao: z.enum(["entrega_equipamento", "demonstracao", "conteudo", "evento"]).nullable().optional(),
}).strict()

// POST /api/gravacoes/kit — guia ou referência (arquivo ou link), ou a colinha (texto).
export async function POST(req: NextRequest) {
  const acesso = await acessoAoKit(true)
  if (acesso instanceof NextResponse) return acesso
  const e = corpo.safeParse(await req.json().catch(() => null))
  if (!e.success) return NextResponse.json({ error: "Confira o título e o tipo do material." }, { status: 400 })
  const d = e.data
  if (d.tipo === "colinha" ? !d.texto : !d.url || !urlDoKitValida(d.url, acesso.organizacaoId)) {
    return NextResponse.json({ error: d.tipo === "colinha" ? "Escreva a colinha." : "Mande o arquivo ou um link https." }, { status: 400 })
  }
  const criado = await comOrg(acesso.organizacaoId, () => prisma.materialVideomaker.create({
    data: {
      organizacaoId: acesso.organizacaoId, titulo: d.titulo, tipo: d.tipo, tipoGravacao: d.tipoGravacao ?? null,
      ...(d.tipo === "colinha" ? { texto: d.texto } : { url: d.url }),
    },
    select: SELECAO,
  }))
  return NextResponse.json(criado, { status: 201 })
}
