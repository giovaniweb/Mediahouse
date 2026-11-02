import { NextRequest, NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { correlacaoAuditoria, registrarAuditoria } from "@/lib/auditoria"
import { demandasDaChave, desfazerIntocadas } from "@/lib/assistente-mcp"

// O que a chave de um assistente criou, e o "desfazer" do que ninguém mexeu.
// A chave de outra empresa não acha nada: tudo filtra pela empresa ativa.

type Params = { params: Promise<{ id: string }> }
const semCache = { "Cache-Control": "no-store" }

export async function GET(_req: NextRequest, { params }: Params) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  const { id } = await params
  return NextResponse.json({ demandas: await demandasDaChave(acesso.organizacaoId, id) }, { headers: semCache })
}

export async function POST(_req: NextRequest, { params }: Params) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  // Desfazer é excluir demanda: a mesma regra da lixeira do quadro
  // (DELETE /api/demandas/[id]) — gestão ou quem tem `excluirDemanda`.
  if (!["admin", "gestor"].includes(acesso.papel) && !acesso.permissoes.excluirDemanda) {
    return NextResponse.json({ error: "Sem permissão para excluir demandas" }, { status: 403 })
  }
  const { id } = await params
  const { organizacaoId, usuarioId } = acesso
  const r = await desfazerIntocadas(organizacaoId, id)
  const correlationId = correlacaoAuditoria()
  for (const d of r.apagadas) {
    await comOrg(organizacaoId, () => registrarAuditoria(prisma, { organizacaoId, usuarioId }, {
      acao: "mcp.desfazer", recurso: "demanda", recursoId: d.id, correlationId,
      depois: { operacao: "excluir" },
    }))
  }
  return NextResponse.json({ apagadas: r.apagadas.map((d) => d.codigo), mantidas: r.mantidas }, { headers: semCache })
}
