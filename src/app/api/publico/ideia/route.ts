import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgPublica } from "@/lib/org"
import { declararOrg } from "@/lib/org-contexto"
import { barrarExcesso } from "@/lib/limite-formulario"
import { lerSugestao, TAG_SOLICITACAO } from "@/lib/social-quadro"

// Ideia ou solicitação para a social, SEM login, pela área da empresa
// (/c/<slug>/ideia). Grava no banco de ideias com origem "publico", o nome e o
// WhatsApp de quem mandou. Não cria usuário nem demanda e não avisa ninguém:
// cai em Ideias do quadro da social daquela linha, e ela decide.

// GET /api/publico/ideia?org=<slug> — as linhas ativas, para o select.
export async function GET(req: NextRequest) {
  const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))
  if (!organizacaoId) return NextResponse.json({ linhas: [] })
  declararOrg(organizacaoId)
  const linhas = await prisma.linhaProjeto.findMany({
    where: { organizacaoId, ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  })
  return NextResponse.json({ linhas })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Envio inválido." }, { status: 400 })
  const nome = typeof body.nome === "string" ? body.nome.trim().slice(0, 120) : ""
  const telefone = typeof body.telefone === "string" ? body.telefone.trim().slice(0, 40) : ""
  if (nome.length < 2) return NextResponse.json({ error: "Diga o seu nome." }, { status: 400 })
  if (telefone.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "Confira o WhatsApp: com DDD, pelo menos 10 números." }, { status: 400 })
  const lido = lerSugestao(body)
  if (!lido.ok) return NextResponse.json({ error: lido.motivo }, { status: 400 })

  const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))
  if (!organizacaoId) return NextResponse.json({ error: "Empresa não encontrada. Confira o link." }, { status: 404 })

  // Mesmo limite por hora, por empresa e IP, dos outros formulários públicos.
  const barrado = await barrarExcesso(req.headers, "ideia", organizacaoId)
  if (barrado) return barrado

  declararOrg(organizacaoId)
  const { solicitacao, ...d } = lido.dados
  const linha = await prisma.linhaProjeto.findFirst({ where: { id: d.linhaProjetoId, organizacaoId, ativo: true }, select: { id: true } })
  if (!linha) return NextResponse.json({ error: "Linha de produto não encontrada." }, { status: 404 })

  await prisma.ideiaVideo.create({
    data: {
      organizacaoId,
      ...d,
      origem: "publico",
      status: "nova",
      enviadoPor: nome,
      telefoneOrigem: telefone,
      tags: solicitacao ? [TAG_SOLICITACAO] : [],
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true }, { status: 201 })
}
