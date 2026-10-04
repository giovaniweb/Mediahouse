import { NextRequest, NextResponse } from "next/server"
import { assinarPedido, codigoDeConfirmacao, ehHashValido, limparNomeComputador, VALIDADE_PEDIDO_MS } from "@/lib/cutflow"
import { checarRateLimit, ipDaRequisicao } from "@/lib/rate-limit"

// POST /api/cutflow/conectar — passo 1 do login do plugin (ver lib/cutflow.ts).
//
// Sem sessão por natureza: é o plugin pedindo para começar. Não toca no banco —
// o pedido é assinado e carrega o hash do segredo do computador. A linha só
// nasce quando alguém LOGADO autoriza, então esta rota não serve para encher
// tabela. Mesmo assim tem limite por IP.
export async function POST(req: NextRequest) {
  const limite = checarRateLimit("cutflow-conectar:" + ipDaRequisicao(req.headers), 20, 10 * 60 * 1000)
  if (!limite.ok) {
    return NextResponse.json({ error: "Muitas tentativas. Espere alguns minutos." }, { status: 429 })
  }
  const body = await req.json().catch(() => null)
  const dispositivoHash = body?.dispositivoHash
  if (!ehHashValido(dispositivoHash)) {
    return NextResponse.json({ error: "Pedido de conexão inválido." }, { status: 400 })
  }
  const nomeComputador = limparNomeComputador(body?.nomeComputador)
  const pedido = assinarPedido(dispositivoHash, nomeComputador)
  const origem = process.env.NEXTAUTH_URL?.replace(/\/+$/, "") || req.nextUrl.origin
  return NextResponse.json({
    url: `${origem}/cutflow/conectar?pedido=${encodeURIComponent(pedido)}`,
    confirmacao: codigoDeConfirmacao(dispositivoHash),
    expiraEm: new Date(Date.now() + VALIDADE_PEDIDO_MS).toISOString(),
  })
}
