import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { autenticarCutflow } from "@/lib/cutflow"

// GET /api/cutflow/eu — quem está logado no plugin e em que empresa. O painel
// usa para destravar (sessão + módulo + permissão já conferidos aqui).
export async function GET(req: NextRequest) {
  const ctx = await autenticarCutflow(req)
  if (ctx instanceof NextResponse) return ctx
  const [usuario, organizacao] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: ctx.usuarioId }, select: { nome: true, email: true } }),
    prisma.organizacao.findUnique({ where: { id: ctx.organizacaoId }, select: { nome: true, slug: true } }),
  ])
  return NextResponse.json({ usuario, empresa: organizacao, computador: ctx.nomeComputador, organizacaoId: ctx.organizacaoId })
}
