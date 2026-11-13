import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import {
  avaliacoesDoProfissional, contestarAvaliacao, convitesRedeDoProfissional, definirParticipacaoRede,
  profissionalDaSessao, responderConviteRede, scoreDaRede,
} from "@/lib/rede"

// A rede vista pelo próprio profissional (Termos do Profissional, seções 6, 7 e 11):
// as avaliações dele com comentário, a média que as empresas veem, contestar uma
// nota, sair da rede (ou voltar) e responder aos convites de empresas novas.
//
// O id do profissional sai SEMPRE da sessão (lib/rede, profissionalDaSessao),
// nunca do corpo: as funções do banco atravessam empresas e confiam nele.
//
// O rastro fica nas próprias linhas: a contestação guarda quando foi aberta, o
// convite guarda quando foi respondido e o perfil guarda quando saiu da rede.

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const p = await profissionalDaSessao(session.user.id)
  if (!p) return NextResponse.json({ error: "Esta área é do profissional da rede." }, { status: 404 })

  const [score, avaliacoes, convites] = await Promise.all([
    scoreDaRede(p.tipo, p.id),
    avaliacoesDoProfissional(p),
    p.tipo === "videomaker" ? convitesRedeDoProfissional(p.id) : Promise.resolve([]),
  ])
  return NextResponse.json({ profissional: { tipo: p.tipo, nome: p.nome, naRede: p.naRede }, score, avaliacoes, convites })
}

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("contestar"), avaliacaoId: z.string().min(1).max(64), motivo: z.string().trim().min(10, "Explique o motivo em pelo menos 10 caracteres.").max(2000) }),
  z.object({ acao: z.literal("participacao"), naRede: z.boolean() }),
  z.object({ acao: z.literal("responder"), conviteId: z.string().min(1).max(64), aceitar: z.boolean() }),
])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const p = await profissionalDaSessao(session.user.id)
  if (!p) return NextResponse.json({ error: "Esta área é do profissional da rede." }, { status: 404 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Pedido inválido." }, { status: 400 })
  const corpo = parsed.data

  if (corpo.acao === "contestar") {
    const erro = await contestarAvaliacao(p, corpo.avaliacaoId, corpo.motivo)
    if (erro) return NextResponse.json({ error: erro }, { status: 409 })
    return NextResponse.json({ ok: true, mensagem: "Contestação registrada. A nota saiu da média até a decisão, em regra em até 5 dias úteis." })
  }

  if (p.tipo !== "videomaker") return NextResponse.json({ error: "Disponível para videomakers da rede." }, { status: 400 })

  if (corpo.acao === "participacao") {
    const naRede = await definirParticipacaoRede(p.id, corpo.naRede)
    return NextResponse.json({ ok: true, naRede })
  }

  const status = await responderConviteRede(corpo.conviteId, p.id, corpo.aceitar)
  if (!status) return NextResponse.json({ error: "Este convite já foi respondido." }, { status: 409 })
  return NextResponse.json({ ok: true, status })
}
