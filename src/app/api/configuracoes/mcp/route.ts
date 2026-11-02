import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { correlacaoAuditoria, registrarAuditoria } from "@/lib/auditoria"
import { erroDeZod } from "@/lib/erros-api"
import { gerarChave, listarChaves, revogarChave } from "@/lib/assistente-mcp"

// Configurações → Assistentes (MCP). Gerar e revogar a chave de uma pessoa é da
// gestão da empresa (gerenciarConfig), como as outras integrações. Fica na
// Auditoria quem gerou e quem revogou.

const semCache = { "Cache-Control": "no-store" }

export async function GET() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  return NextResponse.json(await listarChaves(acesso.organizacaoId), { headers: semCache })
}

const gerarSchema = z.object({
  usuarioId: z.string().min(1).max(128),
  rotulo: z.string().trim().min(2, "Dê um nome para a chave (ex.: Alfred do Cris).").max(60, "Nome de até 60 caracteres."),
}).strict()

export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const body = gerarSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) return erroDeZod(body.error)
  const { organizacaoId, usuarioId } = acesso
  const r = await gerarChave(organizacaoId, body.data.usuarioId, body.data.rotulo)
  if (!r) return NextResponse.json({ error: "Pessoa não encontrada ou inativa nesta empresa." }, { status: 404 })
  await comOrg(organizacaoId, () => registrarAuditoria(prisma, { organizacaoId, usuarioId }, {
    acao: "mcp.chave", recurso: "token_mcp", recursoId: r.id, correlationId: correlacaoAuditoria(),
    depois: { operacao: "criar", ativo: true },
  }))
  // A chave sai daqui uma vez só: o banco guarda o hash.
  return NextResponse.json({ id: r.id, chave: r.chave }, { status: 201, headers: semCache })
}

const revogarSchema = z.object({ id: z.string().min(1).max(128) }).strict()

export async function PATCH(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const body = revogarSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) return erroDeZod(body.error)
  const { organizacaoId, usuarioId } = acesso
  if (!(await revogarChave(organizacaoId, body.data.id))) {
    return NextResponse.json({ error: "Chave não encontrada ou já revogada." }, { status: 404 })
  }
  await comOrg(organizacaoId, () => registrarAuditoria(prisma, { organizacaoId, usuarioId }, {
    acao: "mcp.chave", recurso: "token_mcp", recursoId: body.data.id, correlationId: correlacaoAuditoria(),
    antes: { ativo: true }, depois: { ativo: false },
  }))
  return NextResponse.json({ ok: true }, { headers: semCache })
}
