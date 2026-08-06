import { NextRequest, NextResponse } from "next/server"
import { computeRelatorioExecutivo, mesesDisponiveis, orgPorRelatorioToken } from "@/lib/relatorio-executivo"

// Servidor MCP remoto (Streamable HTTP, stateless) do NuFlow.
// Conecte em qualquer cliente MCP (Claude, etc.) com a URL: https://nuflow.space/api/mcp
// Expõe ferramentas para puxar o Relatório Executivo de produção.
//
// AUTENTICAÇÃO: exige `Authorization: Bearer <relatorioToken>` da organização.
// O token é quem define de QUAL empresa são os números — sem ele a rota não responde.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PROTOCOL = "2025-06-18"
const SERVER_INFO = { name: "nuflow-relatorio-executivo", version: "1.0.0" }

const TOOLS = [
  {
    name: "relatorio_executivo",
    description:
      "Retorna o Relatório Executivo de produção do NuFlow para um mês: vídeos por categoria (ex: Linha Med, Linha Estética), demandas NuFlow, total geral, produção em R$ (R$200/vídeo) e frentes presenciais (eventos, congressos, treinamentos, webinars). Use para puxar os números de produção de um mês específico.",
    inputSchema: {
      type: "object",
      properties: {
        mes: {
          type: "string",
          description: "Mês no formato YYYY-MM (ex: 2026-05). A partir de maio/2026. Se omitido, usa o mês atual.",
          pattern: "^\\d{4}-\\d{2}$",
        },
        area: {
          type: "string",
          enum: ["audiovisual", "design"],
          description: "Área da produção: 'audiovisual' (vídeos) ou 'design' (Growth/artes). Padrão: audiovisual.",
        },
      },
    },
  },
  {
    name: "listar_meses",
    description: "Lista os meses disponíveis para consulta do Relatório Executivo (de maio/2026 até o mês atual).",
    inputSchema: { type: "object", properties: {} },
  },
]

type JsonRpcId = string | number | null
const ok = (id: JsonRpcId, result: unknown) => ({ jsonrpc: "2.0", id, result })
const err = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } })
const textResult = (data: unknown, isError = false) => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  ...(isError ? { isError: true } : {}),
})

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET() {
  return NextResponse.json(
    { error: "MCP Streamable HTTP endpoint — use POST com JSON-RPC 2.0." },
    { status: 405, headers: CORS }
  )
}

type RpcMessage = { id?: JsonRpcId; method?: string; params?: Record<string, unknown> }

// Token via `Authorization: Bearer <token>` (padrão MCP) ou `?token=` (fallback
// para clientes que não permitem header customizado).
function lerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? ""
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  if (m) return m[1].trim()
  return req.nextUrl.searchParams.get("token")
}

async function handle(msg: RpcMessage, organizacaoId: string): Promise<object | null> {
  const id = (msg.id ?? null) as JsonRpcId
  const method = msg.method
  const params = msg.params ?? {}

  if (method === "initialize") {
    const proto = typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL
    return ok(id, { protocolVersion: proto, capabilities: { tools: {} }, serverInfo: SERVER_INFO })
  }
  if (method === "ping") return ok(id, {})
  if (method?.startsWith("notifications/")) return null // notificações não respondem
  if (method === "tools/list") return ok(id, { tools: TOOLS })

  if (method === "tools/call") {
    const name = params.name as string
    const args = (params.arguments ?? {}) as Record<string, unknown>
    try {
      if (name === "relatorio_executivo") {
        const mes = typeof args.mes === "string" ? args.mes : null
        const area = args.area === "design" ? "design" : "audiovisual"
        const data = await computeRelatorioExecutivo(organizacaoId, mes, area)
        return ok(id, textResult(data))
      }
      if (name === "listar_meses") {
        return ok(id, textResult(mesesDisponiveis()))
      }
      return ok(id, textResult(`Ferramenta desconhecida: ${name}`, true))
    } catch (e) {
      return ok(id, textResult(`Erro: ${e instanceof Error ? e.message : String(e)}`, true))
    }
  }

  if (id === null) return null // notificação desconhecida
  return err(id, -32601, `Método não encontrado: ${method}`)
}

export async function POST(req: NextRequest) {
  // Autenticação antes de qualquer parsing: o token define a empresa dos números.
  const organizacaoId = await orgPorRelatorioToken(lerToken(req))
  if (!organizacaoId) {
    return NextResponse.json(
      err(null, -32001, "Não autorizado — informe Authorization: Bearer <token> da organização."),
      { status: 401, headers: { ...CORS, "WWW-Authenticate": "Bearer" } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(err(null, -32700, "Parse error"), { status: 400, headers: CORS })
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => handle(m as RpcMessage, organizacaoId)))).filter(Boolean)
    return NextResponse.json(responses, { headers: CORS })
  }

  const res = await handle(body as RpcMessage, organizacaoId)
  if (res === null) return new NextResponse(null, { status: 202, headers: CORS })
  return NextResponse.json(res, { headers: CORS })
}
