import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { registrarWebhookEntrada, origemPublica } from "@/lib/whatsapp-webhook"

// POST /api/configuracoes/whatsapp/webhook — (re)registra o webhook de entrada
// na Evolution. É o botão "Reativar recebimento de respostas".
//
// Continua existindo como reparo manual, mas deixou de ser a única defesa: o
// fluxo de QR agora reaplica o webhook sozinho ao conectar. A lógica em si mora
// em @/lib/whatsapp-webhook para os dois usarem exatamente a mesma.
//
// A chave nunca sai do servidor: é lida do banco aqui dentro.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!ehGestor(session)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const config = await prisma.configWhatsapp.findFirst({ where: { organizacaoId } })
  if (!config?.instanceUrl || !config.apiKey || !config.instanceId) {
    return NextResponse.json({ error: "WhatsApp não configurado nesta empresa." }, { status: 400 })
  }

  // `origem` no corpo permite registrar a URL de produção a partir de outro
  // ambiente (o caso de reparo, quando o webhook cai e ninguém está deployando).
  // Exige https, então não dá para apontar para um endereço local.
  const corpoReq = await req.json().catch(() => ({} as Record<string, unknown>))
  const informada = typeof corpoReq?.origem === "string" ? corpoReq.origem.replace(/\/$/, "") : ""
  const origem = /^https:\/\//.test(informada) ? informada : origemPublica() || req.nextUrl.origin

  const r = await registrarWebhookEntrada(config, origem)
  if (!r.ok) {
    return NextResponse.json({ error: r.erro }, { status: 502 })
  }
  return NextResponse.json({
    ok: true,
    confirmado: r.confirmado,
    urlRegistrada: r.urlRegistrada,
    eventos: r.eventos,
  })
}
