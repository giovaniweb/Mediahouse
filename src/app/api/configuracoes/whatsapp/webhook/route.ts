import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import crypto from "crypto"

// POST /api/configuracoes/whatsapp/webhook — (re)registra o webhook de entrada
// na Evolution.
//
// Por que isto existe: reiniciar a instância na Evolution derruba o webhook em
// memória, e não havia como reaplicá-lo pelo sistema — só por `curl` com a API
// key na mão. Resultado prático: o NuFlow continuava mandando mensagem e parava
// de receber, sem nada na tela dizendo isso. Foi assim que as respostas dos
// videomakers ficaram mudas.
//
// A chave nunca sai do servidor: ela é lida do banco aqui dentro e usada no
// cabeçalho da chamada à Evolution.
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

  // Sem segredo, o endpoint aceitaria qualquer origem — e ele cria demanda e
  // evento pelas ferramentas da IA. Gera um na primeira vez.
  let segredo = config.webhookSecret
  if (!segredo) {
    segredo = crypto.randomBytes(24).toString("base64url")
    await prisma.configWhatsapp.update({ where: { id: config.id }, data: { webhookSecret: segredo } })
  }

  const base = config.instanceUrl.replace(/\/$/, "")

  // A origem TEM que ser a URL pública, não a da requisição: rodando local,
  // `req.nextUrl.origin` é localhost e registraríamos um webhook que a Evolution
  // nunca alcança — trocando um silêncio por outro, pior de achar.
  // `origem` no corpo permite registrar a URL de produção a partir de outro
  // ambiente (o caso de reparo, quando o webhook cai e ninguém está deployando).
  // Continua exigindo https, então não dá para apontar para um endereço local.
  const corpoReq = await req.json().catch(() => ({} as Record<string, unknown>))
  const informada = typeof corpoReq?.origem === "string" ? corpoReq.origem.replace(/\/$/, "") : ""
  const publica = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "")
  const origem = /^https:\/\//.test(informada)
    ? informada
    : /^https:\/\//.test(publica)
      ? publica
      : req.nextUrl.origin.replace(/\/$/, "")
  if (!/^https:\/\//.test(origem)) {
    return NextResponse.json(
      { error: "URL pública indisponível (NEXTAUTH_URL). A Evolution não alcançaria este endereço." },
      { status: 400 }
    )
  }
  const url = `${origem}/api/whatsapp/webhook?s=${segredo}`

  try {
    const res = await fetch(`${base}/webhook/set/${config.instanceId}`, {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      // A Evolution v1.8 espera os campos na raiz e em snake_case; a v2 aceita o
      // objeto `webhook` aninhado em camelCase. Mandamos os dois formatos: o
      // servidor usa o que reconhece e ignora o resto.
      body: JSON.stringify({
        enabled: true,
        url,
        webhook_by_events: false,
        webhook_base64: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        webhook: {
          enabled: true,
          url,
          webhookByEvents: false,
          webhookBase64: true,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        },
      }),
      signal: AbortSignal.timeout(10000),
    })
    const corpo = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: `Evolution recusou (${res.status})`, detalhes: corpo },
        { status: 502 }
      )
    }
    // Confere lendo de volta: registrar e confiar foi o que deixou isso quebrado
    // por cinco meses sem ninguém perceber.
    const check = await fetch(`${base}/webhook/find/${config.instanceId}`, {
      headers: { apikey: config.apiKey },
      signal: AbortSignal.timeout(10000),
    })
    const atual = await check.json().catch(() => ({}))
    const ativo = atual?.enabled ?? atual?.webhook?.enabled ?? false
    const eventos = atual?.events ?? atual?.webhook?.events ?? []

    return NextResponse.json({
      ok: true,
      confirmado: !!ativo && eventos.includes("MESSAGES_UPSERT"),
      // A URL leva o segredo na query — devolvemos sem ele.
      urlRegistrada: url.split("?")[0],
      eventos,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro de rede ao falar com a Evolution" },
      { status: 502 }
    )
  }
}
