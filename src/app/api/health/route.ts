import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/health — vivo e com banco respondendo.
// Existe para monitoramento externo saber que a aplicação está de pé sem depender
// de alguém abrir a tela. Não exige sessão e, de propósito, NÃO devolve dado de
// negócio, contagem de registros nem nome de empresa: é um sinal, não um relatório.
export async function GET() {
  const inicio = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      ok: true,
      banco: "ok",
      latenciaMs: Date.now() - inicio,
      versao: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      em: new Date().toISOString(),
    })
  } catch {
    // Sem detalhe do erro na resposta — mensagem de driver vaza host e usuário.
    return NextResponse.json(
      { ok: false, banco: "indisponivel", latenciaMs: Date.now() - inicio },
      { status: 503 }
    )
  }
}
