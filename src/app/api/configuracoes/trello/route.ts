import { correlacaoAuditoria, registrarAuditoria } from "@/lib/auditoria"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { getBoardLists } from "@/lib/trello"
import { configTrelloDaOrg } from "@/lib/trello-config"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"

const schema = z.object({
  boardId: z.string().regex(/^[a-zA-Z0-9]{8,32}$/),
  apiKey: z.string().min(1).max(1024).optional(),
  token: z.string().min(1).max(4096).optional(),
}).strict()
const resposta = (boardId = "", ativo = false) => NextResponse.json({
  config: { boardId, ativo, apiKey: ativo ? "••••" : "", token: ativo ? "••••" : "" },
}, { headers: { "Cache-Control": "no-store" } })

export async function GET() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const conf = await comOrg(acesso.organizacaoId, () => configTrelloDaOrg(acesso.organizacaoId))
  return conf.ok ? resposta(conf.cfg.boardId, true) : resposta()
}

export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: "Configuração inválida" }, { status: 400 })
  const { organizacaoId } = acesso
  const correlationId = correlacaoAuditoria()
  try {
    const anterior = await comOrg(organizacaoId, () => configTrelloDaOrg(organizacaoId))
    const preservar = (valor: string | undefined, salvo: string | undefined) =>
      !valor || valor.startsWith("••••") ? salvo : valor
    const apiKey = preservar(body.data.apiKey, anterior.ok ? anterior.cfg.apiKey : undefined)
    const token = preservar(body.data.token, anterior.ok ? anterior.cfg.token : undefined)
    if (!apiKey || !token) return NextResponse.json({ error: "Informe as credenciais desta empresa" }, { status: 400 })
    const cfg = { apiKey, token, boardId: body.data.boardId }
    if (anterior.ok && anterior.cfg.boardId === cfg.boardId && anterior.cfg.apiKey === apiKey && anterior.cfg.token === token) return resposta(cfg.boardId, true)
    await comOrg(organizacaoId, () => registrarAuditoria(prisma, acesso, { acao: "trello.conexao", recurso: "integracao", recursoId: "trello", resultado: "intencao", correlationId }))
    await getBoardLists(cfg)
    const atual = await requireAcesso("gerenciarConfig")
    if (atual instanceof NextResponse) {
      await comOrg(organizacaoId, () => registrarAuditoria(prisma, acesso, { acao: "trello.conexao", recurso: "integracao", recursoId: "trello", resultado: "negado", correlationId }))
      return atual
    }
    if (atual.organizacaoId !== organizacaoId || atual.usuarioId !== acesso.usuarioId) {
      await comOrg(organizacaoId, () => registrarAuditoria(prisma, acesso, { acao: "trello.conexao", recurso: "integracao", recursoId: "trello", resultado: "negado", correlationId }))
      return NextResponse.json({ error: "Contexto alterado; tente novamente" }, { status: 403 })
    }
    await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`trello:${organizacaoId}`}, 0))`
      const existentes = await tx.configTrello.findMany({ where: { organizacaoId }, take: 2 })
      if (existentes.length > 1) throw new Error("Configuração duplicada")
      const existente = existentes[0]
      if (existente) await tx.configTrello.update({ where: { id: existente.id }, data: { ...cfg, ativo: true, ...(existente.boardId !== cfg.boardId ? { listMapping: Prisma.DbNull } : {}) } })
      else await tx.configTrello.create({ data: { organizacaoId, ...cfg, ativo: true } })
      await registrarAuditoria(tx, acesso, { acao: "trello.conexao", recurso: "integracao", recursoId: "trello", correlationId,
        antes: { conectado: !!existente?.ativo }, depois: { conectado: true, campos: ["boardId", "credenciais"] } })
    }))
    return resposta(cfg.boardId, true)
  } catch {
    await comOrg(organizacaoId, () => registrarAuditoria(prisma, acesso, { acao: "trello.conexao", recurso: "integracao", recursoId: "trello", resultado: "falha", correlationId }))
    return NextResponse.json({ error: "Não foi possível salvar a conexão Trello" }, { status: 400 })
  }
}
