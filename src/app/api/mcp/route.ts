import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { correlacaoAuditoria, registrarAuditoria } from "@/lib/auditoria"
import { consumirLimitePublico } from "@/lib/limite-publico"
import { computeRelatorioExecutivo, mesesDisponiveis, orgPorRelatorioToken } from "@/lib/relatorio-executivo"
import { ArgumentoInvalido, LIMITE_MAXIMO, LIMITE_PADRAO, lerDemanda, listarDemandas } from "@/lib/mcp-demandas"
import { RecorteInvalido } from "@/lib/metricas-recorte"

// Servidor MCP remoto (Streamable HTTP, stateless) do NuFlow.
// Conecte em qualquer cliente MCP (Claude, etc.) com a URL: https://nuflow.space/api/mcp
// Expõe ferramentas para puxar o Relatório Executivo de produção e para ler as
// demandas (pedido e briefing, sem valores — ver src/lib/mcp-demandas.ts).
//
// AUTENTICAÇÃO: exige `Authorization: Bearer <relatorioToken>` da organização.
// O token é quem define de QUAL empresa são os dados — sem ele a rota não responde.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PROTOCOL = "2025-06-18"
const SERVER_INFO = { name: "nuflow", version: "1.1.0" }

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
  {
    name: "listar_demandas",
    description:
      "Lista as demandas (pedidos de vídeo/design) da empresa. Cada uma traz id, código, título, equipamentos, status, prazo, quem abriu, editor e o briefing (cortado em 600 caracteres; use ler_demanda para o texto inteiro). Sem status, traz só as abertas, da que vence primeiro para a última. Não traz valores nem custos.",
    inputSchema: {
      type: "object",
      properties: {
        editor: {
          type: "string",
          description: "Nome do editor, inteiro ou em parte (ex: 'Cristiano Drummond' ou 'Cristiano'). Se nenhum casar, o erro lista os editores da empresa.",
        },
        status: {
          type: "string",
          description:
            "'abertas' (padrão: tudo fora de Finalizado), 'todas', uma coluna do quadro (entrada, producao, edicao, aprovacao, para_postar, finalizado) ou um status interno (ex: fila_edicao, editando, revisao_pendente).",
        },
        limite: {
          type: "integer",
          minimum: 1,
          maximum: LIMITE_MAXIMO,
          description: `Quantas demandas devolver (padrão ${LIMITE_PADRAO}, máximo ${LIMITE_MAXIMO}). O campo 'total' diz quantas existem.`,
        },
      },
    },
  },
  {
    name: "ler_demanda",
    description:
      "Lê uma demanda pelo id ou pelo código, com o briefing/roteiro completo e os detalhes do pedido (objetivo, mensagem principal, referência, formato, linha, videomaker, datas). Não traz valores nem custos.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "O id ou o código da demanda (os dois vêm em listar_demandas)." },
      },
      required: ["id"],
    },
  },
  // Nenhuma ferramenta escreve. A marca avisa o cliente MCP; a garantia é não
  // haver ferramenta de escrita aqui.
].map((t) => ({ ...t, annotations: { readOnlyHint: true, openWorldHint: false } }))

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

// Token apenas via `Authorization: Bearer <token>` (padrão MCP). O fallback por
// `?token=` foi removido: token em URL vaza por histórico do navegador, log de
// proxy e cabeçalho Referer.
function lerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? ""
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return m ? m[1].trim() : null
}

// Freio para cliente em laço (uma IA repetindo a mesma chamada): por token,
// contado no banco porque cada requisição pode cair numa instância da Vercel.
const CONSULTAS_POR_MINUTO = 60

// Impressão do token para a auditoria e para o limite: identifica qual chave
// foi usada sem guardar a chave. Rotacionar o token muda a impressão.
function impressaoDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12)
}

// Toda chamada de ferramenta fica na Auditoria da empresa: qual ferramenta,
// qual demanda, quantas voltaram e se deu certo. Os filtros não entram — são
// texto livre de fora, e a auditoria não guarda texto livre.
async function auditar(organizacaoId: string, impressao: string, ferramenta: string, resultado: "sucesso" | "falha", recursoId: string, processados?: number) {
  try {
    await comOrg(organizacaoId, () => registrarAuditoria(prisma, { organizacaoId, tecnico: `mcp:${impressao}` }, {
      acao: "mcp.leitura", recurso: ferramenta, recursoId, resultado, correlationId: correlacaoAuditoria(),
      ...(processados !== undefined ? { depois: { processados } } : {}),
    }))
  } catch (e) {
    // A consulta segue sem o registro: as ferramentas só leem, e derrubar a
    // leitura porque a auditoria falhou não protegeria nada.
    console.error("[mcp] auditoria", e)
  }
}

const FERRAMENTAS = new Set(TOOLS.map((t) => t.name))

async function handle(msg: RpcMessage, organizacaoId: string, impressao: string): Promise<object | null> {
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
    if (!FERRAMENTAS.has(name)) return ok(id, textResult(`Ferramenta desconhecida: ${name}`, true))
    try {
      if (!(await consumirLimitePublico(`mcp:${impressao}`, CONSULTAS_POR_MINUTO, 60))) {
        return ok(id, textResult(`Limite de ${CONSULTAS_POR_MINUTO} consultas por minuto atingido. Espere um minuto e tente de novo.`, true))
      }
      if (name === "relatorio_executivo") {
        const mes = typeof args.mes === "string" ? args.mes : null
        const area = args.area === "design" ? "design" : "audiovisual"
        const data = await computeRelatorioExecutivo(organizacaoId, mes, area)
        await auditar(organizacaoId, impressao, name, "sucesso", data.mes)
        return ok(id, textResult(data))
      }
      if (name === "listar_meses") {
        await auditar(organizacaoId, impressao, name, "sucesso", name)
        return ok(id, textResult(mesesDisponiveis()))
      }
      if (name === "listar_demandas") {
        const data = await listarDemandas(organizacaoId, {
          editor: typeof args.editor === "string" ? args.editor : null,
          status: typeof args.status === "string" ? args.status : null,
          limite: typeof args.limite === "number" ? args.limite : null,
        })
        await auditar(organizacaoId, impressao, name, "sucesso", name, data.mostrando)
        return ok(id, textResult(data))
      }
      const data = await lerDemanda(organizacaoId, typeof args.id === "string" ? args.id : "")
      await auditar(organizacaoId, impressao, name, "sucesso", data.id, 1)
      return ok(id, textResult(data))
    } catch (e) {
      await auditar(organizacaoId, impressao, name, "falha", name)
      if (e instanceof ArgumentoInvalido || e instanceof RecorteInvalido) return ok(id, textResult(e.message, true))
      // Erro de banco não volta para fora: a mensagem do Prisma carrega nome de
      // tabela, de coluna e trechos da consulta.
      console.error("[mcp]", name, e)
      return ok(id, textResult("Erro interno ao consultar o NuFlow.", true))
    }
  }

  if (id === null) return null // notificação desconhecida
  return err(id, -32601, `Método não encontrado: ${method}`)
}

export async function POST(req: NextRequest) {
  // Autenticação antes de qualquer parsing: o token define a empresa dos números.
  const token = lerToken(req)
  const organizacaoId = await orgPorRelatorioToken(token)
  if (!organizacaoId || !token) {
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

  const impressao = impressaoDoToken(token)
  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => handle(m as RpcMessage, organizacaoId, impressao)))).filter(Boolean)
    return NextResponse.json(responses, { headers: CORS })
  }

  const res = await handle(body as RpcMessage, organizacaoId, impressao)
  if (res === null) return new NextResponse(null, { status: 202, headers: CORS })
  return NextResponse.json(res, { headers: CORS })
}
