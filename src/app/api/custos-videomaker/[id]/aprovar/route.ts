import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendEmailFinanceiro } from "@/lib/email"
import { pertenceAOrg } from "@/lib/org"
import { fiscaisDaEmpresa } from "@/lib/videomaker-vinculo"

// POST /api/custos-videomaker/[id]/aprovar
// Aprova ou contesta um custo diretamente pelo custoId (sem precisar do demandaId)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acesso = await requireAcesso("verCustos")
  if (acesso instanceof NextResponse) return acesso
  if (!["admin", "gestor"].includes(acesso.papel)) return NextResponse.json({ error: "Sem permissão para alterar custos" }, { status: 403 })


  const { organizacaoId } = acesso

  const { id: custoId } = await params
  const body = await req.json()
  const { acao } = body // "aprovar_pagamento" | "contestar"

  // `videomaker: true` trazia a linha inteira do perfil global — inclusive dado
  // que é de outra empresa. Aqui só o que é da rede; CPF e PIX saem dos fiscais
  // desta organização, decifrados.
  const custo = await prisma.custoVideomaker.findUnique({
    where: { id: custoId },
    include: {
      videomaker: { select: { id: true, nome: true, email: true, telefone: true } },
      demanda: { select: { id: true, codigo: true, titulo: true } },
    },
  })

  if (!custo || !pertenceAOrg(custo, organizacaoId)) return NextResponse.json({ error: "Custo não encontrado" }, { status: 404 })

  if (custo.pago || custo.statusPagamento === "pago") return NextResponse.json({ error: "Pagamento já registrado ou em conflito. Confira o comprovante antes de alterar." }, { status: 409 })

  // ── Aprovar pagamento ──────────────────────────────────────────────────────
  if (acao === "aprovar_pagamento") {
    const fiscais = await fiscaisDaEmpresa(custo.videomakerId, organizacaoId)
    if (!fiscais?.chavePix) {
      // Antes ia e-mail com chavePix vazia e o financeiro descobria na hora de
      // pagar. Falhar aqui é mais barato que um pagamento travado lá na frente.
      return NextResponse.json(
        { error: `Sem chave PIX cadastrada para ${custo.videomaker.nome} nesta empresa. Cadastre antes de aprovar.` },
        { status: 422 }
      )
    }

    const mudou = await prisma.custoVideomaker.updateMany({
      where: { id: custoId, organizacaoId, pago: false, statusPagamento: "nf_enviada" },
      data: { statusPagamento: "aguardando_pagamento" },
    })
    if (!mudou.count) return NextResponse.json({ error: "Aprovação exige nota fiscal recebida e pagamento ainda não aprovado." }, { status: 409 })

    const emailResult = await sendEmailFinanceiro({
      nomeVideomaker: custo.videomaker.nome,
      cpfCnpj: fiscais.cpfCnpj ?? undefined,
      valorDiaria: custo.valor,
      chavePix: fiscais.chavePix,
      notaFiscalUrl: custo.notaFiscalUrl ?? undefined,
      codigoDemanda: custo.demanda?.codigo ?? "S/D",
      tituloDemanda: custo.demanda?.titulo ?? "Sem demanda",
      custoId: custo.id,
    }, organizacaoId)

    if (emailResult.ok) await prisma.custoVideomaker.updateMany({ where: { id: custoId, organizacaoId, statusPagamento: "aguardando_pagamento" }, data: { emailFinanceiroAt: new Date() } })
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
    const mudou = await prisma.custoVideomaker.updateMany({
      where: { id: custoId, organizacaoId, pago: false, statusPagamento: { not: "pago" } },
      data: { statusPagamento: "contestado" },
    })
    if (!mudou.count) return NextResponse.json({ error: "Pagamento mudou. Atualize antes de contestar." }, { status: 409 })
    return NextResponse.json({ ok: true, mensagem: "Custo contestado com sucesso." })
  }

  return NextResponse.json({ error: "Ação inválida. Use 'aprovar_pagamento' ou 'contestar'." }, { status: 400 })
}
