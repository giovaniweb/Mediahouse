import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { correlacaoAuditoria, registrarAuditoria, type AcaoAuditoria, type AtorAuditoria } from "@/lib/auditoria"
import { consumirLimitePublico } from "@/lib/limite-publico"
import { computeRelatorioExecutivo, mesesDisponiveis, orgPorRelatorioToken } from "@/lib/relatorio-executivo"
import {
  ArgumentoInvalido, FORMATOS, LIMITE_MAXIMO, LIMITE_PADRAO, criarDemandaPeloAssistente, lerDemanda, listarDemandas,
  opcoesParaCriar, type QuemPergunta,
} from "@/lib/mcp-demandas"
import { pessoaPorChaveMcp } from "@/lib/mcp-token"
import { RecorteInvalido } from "@/lib/metricas-recorte"

// Servidor MCP remoto (Streamable HTTP, stateless) do NuFlow.
// Conecte em qualquer cliente MCP (Claude, etc.) com a URL: https://nuflow.space/api/mcp
//
// AUTENTICAÇÃO: `Authorization: Bearer <chave>`. Dois tipos de chave:
//   • da PESSOA (nfmcp_…, gerada em Configurações → Assistentes): o assistente
//     age como ela — lê as demandas que ela vê e cria pelas regras dela. Tudo
//     vai para a Auditoria com o nome dela, e o que ela criar pode ser desfeito.
//   • da EMPRESA (organizacoes.relatorioToken, a do link público do Relatório
//     Executivo): só os números do relatório. Não abre demanda nenhuma — quem
//     tem o link não sabe quem é, e nada do que fizesse teria dono.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PROTOCOL = "2025-06-18"
const SERVER_INFO = { name: "nuflow", version: "1.2.0" }

const SO_LEITURA = { readOnlyHint: true, openWorldHint: false }

const FERRAMENTAS_EMPRESA = [
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
    annotations: SO_LEITURA,
  },
  {
    name: "listar_meses",
    description: "Lista os meses disponíveis para consulta do Relatório Executivo (de maio/2026 até o mês atual).",
    inputSchema: { type: "object", properties: {} },
    annotations: SO_LEITURA,
  },
]

const FERRAMENTAS_PESSOA = [
  {
    name: "listar_demandas",
    description:
      "Lista as demandas (pedidos de vídeo/design) que você vê no NuFlow. Cada uma traz id, código, título, equipamentos, status, prazo, quem abriu, editor e o briefing (cortado em 600 caracteres; use ler_demanda para o texto inteiro). Sem status, traz só as abertas, da que vence primeiro para a última. Não traz valores nem custos.",
    inputSchema: {
      type: "object",
      properties: {
        editor: {
          type: "string",
          description: "Nome do editor, inteiro ou em parte (ex: 'Cristiano Drummond' ou 'Cristiano'). Se nenhum casar, o erro lista os editores.",
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
    annotations: SO_LEITURA,
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
    annotations: SO_LEITURA,
  },
  {
    name: "opcoes_para_criar",
    description:
      "Lista os valores aceitos para criar demanda nesta empresa: departamentos, tipos de vídeo, equipamentos, formatos, prioridades e áreas. Consulte antes de criar_demanda.",
    inputSchema: { type: "object", properties: {} },
    annotations: SO_LEITURA,
  },
  {
    name: "criar_demanda",
    description:
      "Cria uma demanda no NuFlow em seu nome, com as mesmas regras de quando você cria pela tela: se o seu papel precisa de aprovação, ela espera em Aprovações. Fica marcada como criada pelo assistente e pode ser desfeita por um gestor enquanto ninguém mexer nela. Confirme os dados com a pessoa antes de criar. Limite: 30 por dia.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", minLength: 3, description: "Título curto do pedido." },
        briefing: { type: "string", minLength: 10, description: "O briefing/roteiro: o que precisa ser feito, para quem, com quais pontos." },
        departamento: { type: "string", description: "Valor de 'departamentos' em opcoes_para_criar (ex: growth)." },
        tipo: { type: "string", description: "Tipo de vídeo/peça: valor de 'tiposDeVideo' em opcoes_para_criar (ex: reels)." },
        prazo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Data de entrega no formato AAAA-MM-DD, hoje ou depois." },
        equipamentos: { type: "array", items: { type: "string" }, description: "Nomes exatos de 'equipamentos' em opcoes_para_criar." },
        prioridade: { type: "string", enum: ["normal", "alta", "urgente"], description: "Padrão: normal. 'urgente' exige motivoUrgencia." },
        motivoUrgencia: { type: "string", description: "Obrigatório quando a prioridade é urgente." },
        area: { type: "string", enum: ["audiovisual", "design"], description: "Padrão: audiovisual. 'design' para artes (Growth)." },
        formato: { type: "string", enum: [...FORMATOS], description: "Proporção da entrega." },
        cidade: { type: "string", description: "Cidade da gravação, se houver. Sem cidade, fica N/A." },
        objetivo: { type: "string" },
        mensagemPrincipal: { type: "string" },
        referencia: { type: "string", description: "Link ou descrição de referência." },
        plataforma: { type: "string", description: "Onde vai ser publicado (ex: Instagram)." },
        publico: { type: "string", description: "Público-alvo." },
      },
      required: ["titulo", "briefing", "departamento", "tipo"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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

// Token apenas via `Authorization: Bearer <token>` (padrão MCP). O fallback por
// `?token=` foi removido: token em URL vaza por histórico do navegador, log de
// proxy e cabeçalho Referer.
function lerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? ""
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return m ? m[1].trim() : null
}

// Freio para cliente em laço (uma IA repetindo a mesma chamada): por chave,
// contado no banco porque cada requisição pode cair numa instância da Vercel.
const CONSULTAS_POR_MINUTO = 60

// Impressão da chave para o limite e para a auditoria da chave da empresa:
// identifica qual chave foi usada sem guardar a chave.
function impressaoDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12)
}

type Credencial =
  | { tipo: "empresa"; organizacaoId: string; impressao: string }
  | { tipo: "pessoa"; organizacaoId: string; impressao: string; quem: QuemPergunta }

function ator(c: Credencial): AtorAuditoria {
  return c.tipo === "pessoa"
    ? { organizacaoId: c.organizacaoId, usuarioId: c.quem.sessao.user.id }
    : { organizacaoId: c.organizacaoId, tecnico: `mcp:${c.impressao}` }
}

// Toda chamada de ferramenta fica na Auditoria da empresa: quem (a pessoa da
// chave), qual ferramenta, qual demanda, quantas voltaram e se deu certo. Os
// filtros não entram — são texto livre de fora, e a auditoria não guarda texto livre.
async function auditar(c: Credencial, acao: AcaoAuditoria, recurso: string, resultado: "sucesso" | "falha", recursoId: string, processados?: number) {
  try {
    await comOrg(c.organizacaoId, () => registrarAuditoria(prisma, ator(c), {
      acao, recurso, recursoId, resultado, correlationId: correlacaoAuditoria(),
      ...(processados !== undefined ? { depois: { processados } } : {}),
    }))
  } catch (e) {
    // A chamada segue sem o registro: derrubá-la porque a auditoria falhou não
    // protegeria nada, e a criação já fica marcada na própria demanda.
    console.error("[mcp] auditoria", e)
  }
}

const texto = (v: unknown) => (typeof v === "string" ? v : null)

async function chamarFerramenta(c: Credencial, name: string, args: Record<string, unknown>): Promise<{ data: unknown; recursoId: string; processados?: number }> {
  if (c.tipo === "empresa") {
    if (name === "relatorio_executivo") {
      const data = await computeRelatorioExecutivo(c.organizacaoId, texto(args.mes), args.area === "design" ? "design" : "audiovisual")
      return { data, recursoId: data.mes }
    }
    return { data: mesesDisponiveis(), recursoId: name }
  }
  if (name === "listar_demandas") {
    const data = await listarDemandas(c.quem, {
      editor: texto(args.editor),
      status: texto(args.status),
      limite: typeof args.limite === "number" ? args.limite : null,
    })
    return { data, recursoId: name, processados: data.mostrando }
  }
  if (name === "ler_demanda") {
    const data = await lerDemanda(c.quem, texto(args.id) ?? "")
    return { data, recursoId: data.id, processados: 1 }
  }
  if (name === "opcoes_para_criar") return { data: await opcoesParaCriar(c.quem), recursoId: name }
  const data = await criarDemandaPeloAssistente(c.quem, {
    titulo: texto(args.titulo) ?? "",
    briefing: texto(args.briefing) ?? "",
    departamento: texto(args.departamento) ?? "",
    tipo: texto(args.tipo) ?? "",
    prazo: texto(args.prazo),
    prioridade: texto(args.prioridade),
    motivoUrgencia: texto(args.motivoUrgencia),
    area: texto(args.area),
    formato: texto(args.formato),
    cidade: texto(args.cidade),
    objetivo: texto(args.objetivo),
    mensagemPrincipal: texto(args.mensagemPrincipal),
    referencia: texto(args.referencia),
    plataforma: texto(args.plataforma),
    publico: texto(args.publico),
    equipamentos: Array.isArray(args.equipamentos) ? args.equipamentos.filter((v): v is string => typeof v === "string") : null,
  })
  return { data, recursoId: data.id, processados: 1 }
}

async function handle(msg: RpcMessage, c: Credencial): Promise<object | null> {
  const id = (msg.id ?? null) as JsonRpcId
  const method = msg.method
  const params = msg.params ?? {}
  const ferramentas = c.tipo === "pessoa" ? FERRAMENTAS_PESSOA : FERRAMENTAS_EMPRESA

  if (method === "initialize") {
    const proto = typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL
    return ok(id, { protocolVersion: proto, capabilities: { tools: {} }, serverInfo: SERVER_INFO })
  }
  if (method === "ping") return ok(id, {})
  if (method?.startsWith("notifications/")) return null // notificações não respondem
  if (method === "tools/list") return ok(id, { tools: ferramentas })

  if (method === "tools/call") {
    const name = params.name as string
    const args = (params.arguments ?? {}) as Record<string, unknown>
    if (!ferramentas.some((f) => f.name === name)) {
      const dica = c.tipo === "empresa" && FERRAMENTAS_PESSOA.some((f) => f.name === name)
        ? " Demandas só com a chave pessoal (Configurações → Assistentes (MCP))."
        : ""
      return ok(id, textResult(`Ferramenta desconhecida: ${name}.${dica}`, true))
    }
    const acao: AcaoAuditoria = name === "criar_demanda" ? "mcp.criar" : "mcp.leitura"
    const recurso = name === "criar_demanda" ? "demanda" : name
    try {
      if (!(await consumirLimitePublico(`mcp:${c.impressao}`, CONSULTAS_POR_MINUTO, 60))) {
        return ok(id, textResult(`Limite de ${CONSULTAS_POR_MINUTO} consultas por minuto atingido. Espere um minuto e tente de novo.`, true))
      }
      const r = await chamarFerramenta(c, name, args)
      await auditar(c, acao, recurso, "sucesso", r.recursoId, r.processados)
      return ok(id, textResult(r.data))
    } catch (e) {
      await auditar(c, acao, recurso, "falha", name)
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

async function credencial(token: string | null): Promise<Credencial | null> {
  if (!token) return null
  const impressao = impressaoDoToken(token)
  const pessoa = await pessoaPorChaveMcp(token)
  if (pessoa) return { tipo: "pessoa", organizacaoId: pessoa.organizacaoId, impressao, quem: pessoa }
  const organizacaoId = await orgPorRelatorioToken(token)
  return organizacaoId ? { tipo: "empresa", organizacaoId, impressao } : null
}

export async function POST(req: NextRequest) {
  // Autenticação antes de qualquer parsing: a chave define a empresa e a pessoa.
  const c = await credencial(lerToken(req))
  if (!c) {
    return NextResponse.json(
      err(null, -32001, "Não autorizado — informe Authorization: Bearer <chave>."),
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
    const responses = (await Promise.all(body.map((m) => handle(m as RpcMessage, c)))).filter(Boolean)
    return NextResponse.json(responses, { headers: CORS })
  }

  const res = await handle(body as RpcMessage, c)
  if (res === null) return new NextResponse(null, { status: 202, headers: CORS })
  return NextResponse.json(res, { headers: CORS })
}
