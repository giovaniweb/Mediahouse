import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { comOrg } from "@/lib/org-contexto"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function apresentacao(config: {
  id: string; instanceUrl: string; instanceId: string; instanceName: string | null;
  ativo: boolean; apiKey: string; telefoneConectado: string | null;
  pushName: string | null; connectedAt: Date | null; lastStatus: string | null;
}) {
  return {
    id: config.id, instanceUrl: config.instanceUrl, instanceId: config.instanceId,
    instanceName: config.instanceName, ativo: config.ativo,
    apiKey: config.apiKey ? "••••••" : "",
    telefoneConectado: config.telefoneConectado, pushName: config.pushName,
    connectedAt: config.connectedAt, lastStatus: config.lastStatus,
  }
}

export async function GET() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const { organizacaoId } = acesso

  const config = await prisma.configWhatsapp.findFirst({ where: { organizacaoId } })
  // `gerenciada`: o servidor de WhatsApp do NuFlow está ligado, e a empresa sem
  // configuração pode gerar o QR direto — a rota do QR cria a instância dela.
  // Sem isto a tela travava o botão pedindo URL e chave que o cliente não tem.
  const gerenciada = !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY)
  return NextResponse.json({ config: config ? apresentacao(config) : null, gerenciada })
}

export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso

  const { organizacaoId } = acesso

  const body = await req.json()
  const { instanceUrl, apiKey, instanceId } = body

  if (!instanceUrl || !instanceId) {
    return NextResponse.json({ error: "instanceUrl e instanceId são obrigatórios" }, { status: 400 })
  }

  return comOrg(organizacaoId, () => prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`whatsapp:${organizacaoId}`}, 0))`
    const existing = await tx.configWhatsapp.findFirst({ where: { organizacaoId } })
    const chaveNova = typeof apiKey === "string" && apiKey && !apiKey.startsWith("••••") ? apiKey : null
    // A chave guardada vale só para o servidor e a instância com que foi salva.
    // Até 30/10/2026 trocar o endereço mantinha a chave antiga, e o "Testar" a
    // mandava para o endereço novo: o admin de uma empresa levava a chave para
    // um servidor dele, ou apontava para a instância de outra empresa no mesmo
    // servidor. Com a Evolution gerenciada essa chave é a mestra, que abre o
    // WhatsApp de todas as empresas.
    const mesmoDestino = !!existing && existing.instanceUrl === instanceUrl && existing.instanceId === instanceId
    if (!chaveNova && !mesmoDestino) {
      return NextResponse.json(
        { error: existing ? "Ao trocar o endereço ou a instância, informe a apiKey de novo." : "apiKey obrigatória" },
        { status: 400 }
      )
    }
    const data = { instanceUrl, instanceId, ativo: true, ...(chaveNova && { apiKey: chaveNova }) }
    if (existing && existing.instanceUrl === instanceUrl && existing.instanceId === instanceId && existing.ativo && (!data.apiKey || data.apiKey === existing.apiKey)) return NextResponse.json({ config: apresentacao(existing) })
    const atual = existing
      ? await tx.configWhatsapp.update({ where: { id: existing.id }, data })
      : await tx.configWhatsapp.create({ data: { organizacaoId, instanceUrl, apiKey: chaveNova!, instanceId, ativo: true } })
    await registrarAuditoria(tx, acesso, { acao: "configuracao.alterada", recurso: "config_whatsapp", recursoId: atual.id, correlationId: correlacaoAuditoria(), antes: { ativo: !!existing?.ativo }, depois: { ativo: true, campos: ["credenciais"] } })
    return NextResponse.json({ config: apresentacao(atual) })
  }))
}
