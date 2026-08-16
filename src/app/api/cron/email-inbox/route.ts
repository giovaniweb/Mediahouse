import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { syncAllEmailInboxes } from "@/lib/email-inbox"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 })
  }
  const authorization = req.headers.get("authorization") ?? ""
  const bufA = Buffer.from(authorization)
  const bufB = Buffer.from(`Bearer ${secret}`)
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  // Deixa rastro mesmo quando não há e-mail novo — este cron não escrevia nada
  // ao rodar em vazio, e "ele chegou a ser registrado na Vercel?" só tinha
  // resposta no painel da Vercel. Ver o comentário em /api/cron/agentes.
  const execucao = await prisma.agenteExecucao.create({
    data: { agente: "email-inbox-cron", status: "executando" },
  })

  try {
    const results = await syncAllEmailInboxes()
    await prisma.agenteExecucao.update({
      where: { id: execucao.id },
      data: {
        status: "concluido",
        resultado: { caixas: results.length } as Prisma.InputJsonObject,
        finishedAt: new Date(),
      },
    })
    return NextResponse.json({ ok: true, caixas: results.length, results })
  } catch (e) {
    await prisma.agenteExecucao.update({
      where: { id: execucao.id },
      data: {
        status: "erro",
        erro: e instanceof Error ? e.message : String(e),
        finishedAt: new Date(),
      },
    }).catch((err) => console.error("[Cron] Falha ao registrar erro de email-inbox:", err))
    throw e
  }
}
