import { z } from "zod"
import { conferirPagamentoAberto, PagamentoInvalido, valorConhecido } from "@/lib/pagamentos"
import { Prisma } from "@prisma/client"
import { randomUUID } from "node:crypto"
import { registrarAuditoria } from "@/lib/auditoria"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pertenceAOrg } from "@/lib/org"
import { lerValorMonetario } from "@/lib/numeros"
import { erroDeCampo } from "@/lib/erros-api"

// PATCH /api/custos-videomaker/[id] — atualizar custo (ex: marcar como pago)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireAcesso("verCustos")
  if (acesso instanceof NextResponse) return acesso
  if (!["admin", "gestor"].includes(acesso.papel)) return NextResponse.json({ error: "Sem permissão para alterar custos" }, { status: 403 })
  const { organizacaoId } = acesso

  const { id } = await params
  const entrada = z.object({
    pago:z.boolean().optional(), valor:z.union([z.number().finite(),z.string().max(40)]).nullable().optional(),
    dataPagamento:z.union([z.iso.date(),z.iso.datetime({offset:true})]).optional(),
    comprovante:z.string().max(2048).nullable().optional(), descricao:z.string().max(2000).nullable().optional(),
    tipo:z.enum(["diaria","mensalidade","projeto","bonus","despesa","equipamento"]).optional(),
  }).strict().safeParse(await req.json().catch(()=>null))
  if(!entrada.success)return NextResponse.json({error:"Confira os campos do pagamento."},{status:400})
  const body=entrada.data

  const custo = await prisma.custoVideomaker.findUnique({ where: { id } })
  if (!custo || !pertenceAOrg(custo, organizacaoId)) return NextResponse.json({ error: "Custo não encontrado" }, { status: 404 })

  if(custo.pago || custo.statusPagamento==="pago") {
    if(custo.pago && custo.statusPagamento==="pago" && body.pago===true && Object.keys(body).every(k=>["pago","dataPagamento"].includes(k))) return NextResponse.json({custo})
    return NextResponse.json({error:"Pagamento registrado ou em conflito. Correções exigem conciliação, sem reescrever o histórico."},{status:409})
  }
  if(body.pago===false && custo.statusPagamento==="aguardando_pagamento") return NextResponse.json({error:"Use Contestar para revisar uma aprovação."},{status:409})
  if(body.pago===true && Object.keys(body).some(k=>!["pago","dataPagamento","comprovante"].includes(k))) return NextResponse.json({error:"Salve e confira as alterações antes de registrar o pagamento."},{status:409})
  if(body.pago===true && (!valorConhecido(custo) || (custo.demandaId && custo.statusPagamento!=="aguardando_pagamento"))) return NextResponse.json({error:"Confirme o valor e aprove o pagamento do job antes de marcar como pago."},{status:409})
  if(body.dataPagamento && !Number.isFinite(new Date(body.dataPagamento).getTime())) return erroDeCampo("dataPagamento","Data inválida.")

  // Antes: `body.valor ? parseFloat(body.valor) : custo.valor` — um zero é falsy
  // e mantinha o valor anterior sem avisar; texto não numérico virava NaN gravado.
  const valorLido = lerValorMonetario(body.valor)
  if (!valorLido.ok) {
    return erroDeCampo("valor", "Informe um valor numérico maior ou igual a zero.")
  }

  if (body.pago !== undefined && typeof body.pago !== "boolean") return erroDeCampo("pago", "Informe um estado de pagamento válido.")
  const updated = await prisma.$transaction(async tx => {
  const alterado = await tx.custoVideomaker.update({
    where: { id, organizacaoId, updatedAt: custo.updatedAt },
    data: {
      pago: body.pago ?? custo.pago,
      ...(body.pago===true ? { statusPagamento: "pago" as const } : {}),
      // Alterar valor/tipo/documento de um aprovado exige nova decisão.
      ...((body.valor!==undefined || body.tipo!==undefined) && custo.statusPagamento==="aguardando_pagamento" ? {statusPagamento:"nf_enviada" as const,emailFinanceiroAt:null} : {}),
      ...(valorLido.presente && valorLido.valor !== null ? { valorConfirmadoEm: new Date() } : {}),
      dataPagamento: body.dataPagamento ? new Date(body.dataPagamento) : body.pago===true ? new Date() : custo.dataPagamento,
      comprovante: body.comprovante ?? custo.comprovante,
      valor: valorLido.presente && valorLido.valor !== null ? valorLido.valor : custo.valor,
      descricao: body.descricao ?? custo.descricao,
      tipo: body.tipo ?? custo.tipo,
    },
    include: {
      videomaker: { select: { id: true, nome: true } },
      demanda: { select: { id: true, codigo: true, titulo: true } },
    },
  })

    await registrarAuditoria(tx, acesso, { acao: "manutencao.custos", recurso: "custo", recursoId: id, correlationId: randomUUID(), depois: { operacao: "editar", alterados: 1 } })
    return alterado
  }).catch(e => { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return null; throw e })
  if (!updated) return NextResponse.json({ error: "O custo mudou durante a edição. Atualize antes de tentar novamente." }, { status: 409 })
  return NextResponse.json({ custo: updated })
}

// DELETE /api/custos-videomaker/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireAcesso("verCustos")
  if (acesso instanceof NextResponse) return acesso
  if (!["admin", "gestor"].includes(acesso.papel)) return NextResponse.json({ error: "Sem permissão para alterar custos" }, { status: 403 })
  const { organizacaoId } = acesso

  const { id } = await params
  try {
    const apagado=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM custos_videomaker WHERE id=${id} AND "organizacaoId"=${organizacaoId} FOR UPDATE`
      const custo=await tx.custoVideomaker.findFirst({where:{id,organizacaoId}})
      if(!custo)return false
      conferirPagamentoAberto(custo)
      if(custo.notaFiscalUrl || custo.fatoOrigem || custo.statusPagamento!=="pendente_nf") throw new PagamentoInvalido("Lançamento com origem ou documento deve ser conciliado; exclusão bloqueada.")
      await tx.custoVideomaker.delete({where:{id,organizacaoId}})
      await registrarAuditoria(tx,acesso,{acao:"manutencao.custos",recurso:"custo",recursoId:id,correlationId:randomUUID(),depois:{operacao:"excluir",alterados:1}})
      return true
    })
    if(!apagado)return NextResponse.json({error:"Custo não encontrado"},{status:404})
    return NextResponse.json({ok:true})
  }catch(e){if(e instanceof PagamentoInvalido)return NextResponse.json({error:e.message},{status:e.status});throw e}
}
