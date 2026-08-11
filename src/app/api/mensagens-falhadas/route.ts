import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { ehGestor } from "@/lib/papel"
import { sendWhatsappMessage } from "@/lib/whatsapp"

// Avisos que o sistema tentou mandar e não chegaram. Enquanto a instância do
// WhatsApp cai e volta, quem esperava a mensagem simplesmente não recebe — e
// até agora essas falhas ficavam gravadas sem nenhuma tela para lê-las.
export const dynamic = "force-dynamic"

const STATUS_FALHA = ["falhou", "sem_config"]

// GET /api/whatsapp/falhas — lista as não entregues da empresa ativa
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!ehGestor(session)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const limite = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200)

  const [mensagens, total] = await Promise.all([
    prisma.mensagemWhatsapp.findMany({
      where: { organizacaoId, direcao: "saida", status: { in: STATUS_FALHA } },
      orderBy: { createdAt: "desc" },
      take: limite,
      select: {
        id: true, telefone: true, conteudo: true, status: true, createdAt: true,
        demanda: { select: { id: true, codigo: true, titulo: true } },
      },
    }),
    prisma.mensagemWhatsapp.count({
      where: { organizacaoId, direcao: "saida", status: { in: STATUS_FALHA } },
    }),
  ])

  return NextResponse.json({ mensagens, total })
}

// POST /api/whatsapp/falhas — reenvia. { id } reenvia uma; { ids: [] } reenvia várias.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!ehGestor(session)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : []
  if (ids.length === 0) return NextResponse.json({ error: "Informe id ou ids" }, { status: 400 })

  // O where por organização é o que impede reenviar mensagem de outra empresa
  // a partir de um id adivinhado.
  const alvo = await prisma.mensagemWhatsapp.findMany({
    where: { id: { in: ids }, organizacaoId, direcao: "saida", status: { in: STATUS_FALHA } },
    select: { id: true, telefone: true, conteudo: true, demandaId: true },
  })

  let enviadas = 0
  const falharam: string[] = []

  for (const m of alvo) {
    const r = await sendWhatsappMessage(m.telefone, m.conteudo, m.demandaId ?? undefined, organizacaoId)
    if (r) {
      // O envio bem-sucedido já gravou uma linha nova; a antiga sai da fila para
      // não ser reenviada de novo.
      await prisma.mensagemWhatsapp.update({ where: { id: m.id }, data: { status: "reenviado" } })
      enviadas++
    } else {
      falharam.push(m.id)
    }
  }

  return NextResponse.json({ enviadas, falharam: falharam.length, total: alvo.length })
}
