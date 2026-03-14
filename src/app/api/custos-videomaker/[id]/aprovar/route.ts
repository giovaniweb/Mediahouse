import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmailFinanceiro } from "@/lib/email"

// POST /api/custos-videomaker/[id]/aprovar
// Aprova ou contesta um custo diretamente pelo custoId (sem precisar do demandaId)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const papel = (session.user as { tipo?: string }).tipo
  if (!["admin", "gestor"].includes(papel ?? "")) {
    return NextResponse.json({ error: "Apenas admin ou gestor pode aprovar pagamentos" }, { status: 403 })
  }

  const { id: custoId } = await params
  const body = await req.json()
  const { acao } = body // "aprovar_pagamento" | "contestar"

  const custo = await prisma.custoVideomaker.findUnique({
    where: { id: custoId },
    include: {
      videomaker: true,
      demanda: { select: { id: true, codigo: true, titulo: true } },
    },
  })

  if (!custo) return NextResponse.json({ error: "Custo não encontrado" }, { status: 404 })

  // ── Aprovar pagamento ──────────────────────────────────────────────────────
  if (acao === "aprovar_pagamento") {
    await prisma.custoVideomaker.update({
      where: { id: custoId },
      data: { statusPagamento: "aguardando_pagamento", emailFinanceiroAt: new Date() },
    })

    const emailResult = await sendEmailFinanceiro({
      nomeVideomaker: custo.videomaker.nome,
      cpfCnpj: custo.videomaker.cpfCnpj ?? undefined,
      valorDiaria: custo.valor,
      chavePix: custo.videomaker.chavePix ?? "",
      notaFiscalUrl: custo.notaFiscalUrl ?? undefined,
      codigoDemanda: custo.demanda?.codigo ?? "S/D",
      tituloDemanda: custo.demanda?.titulo ?? "Sem demanda",
      custoId: custo.id,
    })

    return NextResponse.json({
      ok: true,
      emailEnviado: emailResult.ok,
      mensagem: emailResult.ok
        ? "Pagamento aprovado! E-mail enviado ao financeiro."
        : `Pagamento aprovado, mas houve erro no e-mail: ${emailResult.error}`,
    })
  }

  // ── Contestar pagamento ────────────────────────────────────────────────────
  if (acao === "contestar") {
    await prisma.custoVideomaker.update({
      where: { id: custoId },
      data: { statusPagamento: "contestado" },
    })
    return NextResponse.json({ ok: true, mensagem: "Custo contestado com sucesso." })
  }

  return NextResponse.json({ error: "Ação inválida. Use 'aprovar_pagamento' ou 'contestar'." }, { status: 400 })
}
