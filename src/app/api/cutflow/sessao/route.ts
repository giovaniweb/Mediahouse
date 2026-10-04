import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgPorCredencial } from "@/lib/org-por-credencial"
import { declararOrg } from "@/lib/org-contexto"
import { autenticarCutflow, hashCutflow, novaSessao, VALIDADE_SESSAO_MS } from "@/lib/cutflow"
import { checarRateLimit, ipDaRequisicao } from "@/lib/rate-limit"

// POST /api/cutflow/sessao — passo 3: o plugin, com o segredo do computador,
// pergunta se já foi autorizado. Enquanto não, 202. Autorizado, recebe a sessão
// UMA vez; depois disso o segredo não casa mais (org_por_credencial só olha
// linhas sem sessão entregue).
export async function POST(req: NextRequest) {
  const limite = checarRateLimit("cutflow-sessao:" + ipDaRequisicao(req.headers), 240, 10 * 60 * 1000)
  if (!limite.ok) return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 })

  const body = await req.json().catch(() => null)
  const dispositivo = body?.dispositivo
  if (typeof dispositivo !== "string" || dispositivo.length < 32 || dispositivo.length > 200) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 })
  }
  const dispositivoHash = hashCutflow(dispositivo)
  const organizacaoId = await orgPorCredencial("cutflow_dispositivo", dispositivoHash)
  // Não autorizado ainda, vencido ou já entregue respondem igual.
  if (!organizacaoId) return NextResponse.json({ pendente: true }, { status: 202 })
  declararOrg(organizacaoId)

  const token = novaSessao()
  const agora = new Date()
  // Entrega atômica: duas perguntas ao mesmo tempo não levam duas sessões.
  const entregue = await prisma.cutflowSessao.updateMany({
    where: { organizacaoId, dispositivoHash, tokenHash: null, revogadaEm: null, expiraEm: { gt: agora } },
    data: { tokenHash: hashCutflow(token), entregueEm: agora, ultimoUsoEm: agora, expiraEm: new Date(agora.getTime() + VALIDADE_SESSAO_MS) },
  })
  if (entregue.count !== 1) return NextResponse.json({ pendente: true }, { status: 202 })

  const linha = await prisma.cutflowSessao.findUnique({ where: { dispositivoHash }, select: { usuarioId: true } })
  const [usuario, organizacao] = await Promise.all([
    linha ? prisma.usuario.findUnique({ where: { id: linha.usuarioId }, select: { nome: true, email: true } }) : null,
    prisma.organizacao.findUnique({ where: { id: organizacaoId }, select: { nome: true } }),
  ])
  return NextResponse.json({ token, usuario, empresa: organizacao?.nome ?? null })
}

// DELETE /api/cutflow/sessao — "Sair" no plugin: revoga a sessão deste computador.
export async function DELETE(req: NextRequest) {
  const ctx = await autenticarCutflow(req)
  if (ctx instanceof NextResponse) return ctx
  await prisma.cutflowSessao.update({
    where: { id: ctx.sessaoId, organizacaoId: ctx.organizacaoId },
    data: { revogadaEm: new Date() },
  })
  return NextResponse.json({ saiu: true })
}
