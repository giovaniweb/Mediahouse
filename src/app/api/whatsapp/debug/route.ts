import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { getWhatsappConfig } from "@/lib/whatsapp"

// GET /api/whatsapp/debug — mensagens recentes + config do webhook na Evolution API.
// Exige sessão autenticada e devolve apenas dados da organização do usuário —
// antes era um segredo em query string protegendo mensagens de todas as empresas.
export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const [mensagens, config] = await Promise.all([
    prisma.mensagemWhatsapp.findMany({
      where: { organizacaoId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        telefone: true,
        tipoMensagem: true,
        conteudo: true,
        direcao: true,
        status: true,
        createdAt: true,
      },
    }),
    getWhatsappConfig(organizacaoId),
  ])

  // Verifica webhook na Evolution API
  let webhookConfig = null
  if (config) {
    try {
      const res = await fetch(
        `${config.instanceUrl}/webhook/find/${config.instanceId}`,
        { headers: { apikey: config.apiKey }, signal: AbortSignal.timeout(5000) }
      )
      webhookConfig = await res.json()
    } catch (e) {
      webhookConfig = { error: String(e) }
    }
  }

  return NextResponse.json({
    totalMensagens: mensagens.length,
    mensagens,
    webhookConfig,
    configAtiva: !!config,
    instanceId: config?.instanceId,
  })
}
