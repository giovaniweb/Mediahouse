import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { registrarWebhookEntrada, origemPublica } from "@/lib/whatsapp-webhook"

// GET /api/configuracoes/whatsapp/qr — QR da instância Evolution DA ORGANIZAÇÃO logada.
// Cada empresa tem sua própria instância (instanceName = nuflow_<slug>).
// Org sem config → auto-provisiona usando a Evolution gerenciada (EVOLUTION_API_URL/KEY).
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  let config = await prisma.configWhatsapp.findFirst({ where: { organizacaoId } })

  // Org sem config → provisiona via Evolution gerenciada (env) + instância nuflow_<slug>
  if (!config) {
    const org = await prisma.organizacao.findUnique({ where: { id: organizacaoId }, select: { slug: true } })
    const evoUrl = process.env.EVOLUTION_API_URL
    const evoKey = process.env.EVOLUTION_API_KEY
    if (!org || !evoUrl || !evoKey) {
      return NextResponse.json({ error: "Evolution gerenciada não configurada (defina EVOLUTION_API_URL e EVOLUTION_API_KEY)" }, { status: 400 })
    }
    const instanceName = `nuflow_${org.slug}`
    config = await prisma.configWhatsapp.create({
      data: { organizacaoId, instanceUrl: evoUrl, apiKey: evoKey, instanceId: instanceName, instanceName, ativo: false },
    })
  }

  if (!config.instanceUrl || !config.apiKey || !config.instanceId) {
    return NextResponse.json({ error: "WhatsApp não configurado" }, { status: 400 })
  }

  const base = config.instanceUrl.replace(/\/$/, "")
  const headers = { apikey: config.apiKey, "Content-Type": "application/json" }

  try {
    // ── Passo 1: verificar estado da conexão ──────────────────────────────
    const stateRes = await fetch(`${base}/instance/connectionState/${config.instanceId}`, { headers })

    if (stateRes.ok) {
      const stateData = await stateRes.json()
      const state = stateData?.instance?.state ?? stateData?.state ?? null

      // Já conectado
      if (state === "open") {
        // Guarda QUAL número está pareado. As colunas existiam e nunca eram
        // preenchidas — por isso a tela só sabia mostrar uma bolinha verde, que
        // continuava verde com a sessão morta. Sem o número, ninguém percebia.
        let fone: string | null = null
        let perfil: string | null = null
        try {
          const infoRes = await fetch(
            `${base}/instance/fetchInstances?instanceName=${encodeURIComponent(config.instanceId)}`,
            { headers, signal: AbortSignal.timeout(8000) }
          )
          if (infoRes.ok) {
            const info = await infoRes.json()
            const inst = Array.isArray(info) ? info[0] : info
            const dados = inst?.instance ?? inst
            const jid: string = dados?.owner ?? dados?.ownerJid ?? ""
            fone = jid ? jid.split("@")[0].split(":")[0] : null
            perfil = dados?.profileName ?? dados?.pushName ?? null
          }
        } catch { /* informativo: não impede reportar a conexão */ }

        await prisma.configWhatsapp.update({
          where: { id: config.id },
          data: {
            ativo: true,
            lastStatus: "open",
            connectedAt: new Date(),
            ...(fone && { telefoneConectado: fone }),
            ...(perfil && { pushName: perfil }),
          },
        }).catch(() => null)

        // Parear derruba o webhook em memória da Evolution. Reaplicar aqui é o
        // que impede a falha de sempre: envio de pé, recebimento desligado, e
        // ninguém sabendo — em 16/08/2026 um "sim" caiu justamente nos 18
        // minutos entre o pareamento e alguém lembrar de apertar o botão.
        const webhook = await registrarWebhookEntrada(
          { ...config, webhookSecret: config.webhookSecret },
          origemPublica()
        )
        if (!webhook.confirmado) {
          console.warn(`[QR] Webhook de entrada NÃO confirmado após conectar: ${webhook.erro ?? "sem MESSAGES_UPSERT"}`)
        }

        return NextResponse.json({
          conectado: true,
          estado: "open",
          telefone: fone,
          perfil,
          recebimentoAtivo: webhook.confirmado,
        })
      }

      // Instância existe mas desconectada → buscar QR code
      const connectRes = await fetch(`${base}/instance/connect/${config.instanceId}`, { headers })
      if (!connectRes.ok) {
        const body = await connectRes.text().catch(() => "")
        return NextResponse.json(
          { error: `Erro ao conectar (${connectRes.status}): ${body}` },
          { status: 502 }
        )
      }

      const data = await connectRes.json()
      if (data?.instance?.state === "open") {
        return NextResponse.json({ conectado: true, estado: "open" })
      }

      let qrcode = data?.qrcode?.base64 ?? data?.base64 ?? data?.qrcode ?? null
      if (qrcode && typeof qrcode === "string" && !qrcode.startsWith("data:")) {
        qrcode = `data:image/png;base64,${qrcode}`
      }

      return NextResponse.json({ conectado: false, qrcode, estado: state ?? "qr" })
    }

    // ── Passo 2: instância não existe (404) → tentar criar ────────────────
    if (stateRes.status === 404) {
      const createRes = await fetch(`${base}/instance/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          instanceName: config.instanceId,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      })

      if (!createRes.ok) {
        // Criação falhou → provavelmente plano hosted que exige painel
        return NextResponse.json(
          {
            error:
              `A instância "${config.instanceId}" não existe e não foi possível criá-la automaticamente. ` +
              `Acesse o painel da sua Evolution API, crie a instância com esse nome e tente novamente.`,
          },
          { status: 502 }
        )
      }

      // Criação OK → buscar QR code
      const connectRes = await fetch(`${base}/instance/connect/${config.instanceId}`, { headers })
      if (!connectRes.ok) {
        return NextResponse.json(
          { error: `Instância criada, mas erro ao obter QR (${connectRes.status})` },
          { status: 502 }
        )
      }

      const data = await connectRes.json()
      let qrcode = data?.qrcode?.base64 ?? data?.base64 ?? data?.qrcode ?? null
      if (qrcode && typeof qrcode === "string" && !qrcode.startsWith("data:")) {
        qrcode = `data:image/png;base64,${qrcode}`
      }

      return NextResponse.json({ conectado: false, qrcode, estado: "qr" })
    }

    // ── Outro erro na verificação de estado ───────────────────────────────
    const body = await stateRes.text().catch(() => "")
    return NextResponse.json(
      { error: `Evolution API retornou ${stateRes.status}: ${body}` },
      { status: 502 }
    )
  } catch (err) {
    return NextResponse.json({ error: `Erro ao conectar: ${err}` }, { status: 502 })
  }
}
