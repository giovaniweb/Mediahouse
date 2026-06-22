import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { createDemandFromInboxEmail } from "@/lib/email-inbox"
import { parseInboundEmail } from "@/lib/email-inbox-parser"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const { id } = await params
  const { acao } = await req.json().catch(() => ({ acao: "" })) as { acao?: string }

  const email = await prisma.emailEntrada.findFirst({ where: { id, organizacaoId } })
  if (!email) return NextResponse.json({ error: "E-mail não encontrado" }, { status: 404 })

  if (acao === "criar_demanda") {
    try {
      // A ação manual representa a revisão humana. Campos ausentes permanecem
      // como "A confirmar" na demanda para serem ajustados no fluxo normal.
      return NextResponse.json({
        ok: true,
        ...(await createDemandFromInboxEmail(email.id, { force: true })),
      })
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      )
    }
  }

  if (acao === "reprocessar") {
    const parsed = parseInboundEmail(email.assunto, email.corpoTexto, email.recebidoEm)
    await prisma.emailEntrada.update({
      where: { id: email.id },
      data: {
        dadosExtraidos: parsed as unknown as Prisma.InputJsonValue,
        status: parsed.eligibleForDemand ? "pronto" : "revisao",
        erro: parsed.eligibleForDemand
          ? null
          : parsed.missing.length
            ? `Campos pendentes: ${parsed.missing.join(", ")}`
            : "E-mail não elegível para criação.",
      },
    })
    return NextResponse.json({ ok: true, parsed })
  }

  if (acao === "ignorar") {
    await prisma.emailEntrada.update({
      where: { id: email.id },
      data: { status: "ignorado", erro: null, processadoEm: new Date() },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
