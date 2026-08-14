import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/org"
import { sendWhatsappMessage } from "@/lib/whatsapp"

// POST /api/whatsapp/admin-action — ações administrativas de suporte.
// Exige sessão de super-admin (não mais segredo compartilhado por variável de
// ambiente) e escopo explícito por organização — antes era possível alterar
// qualquer campo de qualquer Demanda de qualquer empresa com um único secret.
const CAMPOS_PERMITIDOS = new Set([
  "statusVisivel",
  "statusInterno",
  "linkFinal",
  "linkPostagem",
  "motivoImpedimento",
])

function somenteCamposPermitidos(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const entradas = Object.entries(data as Record<string, unknown>).filter(([k]) => CAMPOS_PERMITIDOS.has(k))
  if (entradas.length === 0) return null
  return Object.fromEntries(entradas)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  try {
    const body = await req.json()
    const { action, organizacaoId, ...params } = body as { action?: string; organizacaoId?: string; [k: string]: unknown }

    if (!organizacaoId || typeof organizacaoId !== "string") {
      return NextResponse.json({ error: "organizacaoId obrigatório" }, { status: 400 })
    }

    if (action === "send_message") {
      const telefone = typeof params.telefone === "string" ? params.telefone.replace(/\D/g, "") : ""
      const mensagem = typeof params.mensagem === "string" ? params.mensagem : ""
      if (!telefone || !mensagem) return NextResponse.json({ error: "telefone e mensagem obrigatórios" }, { status: 400 })

      const resultado = await sendWhatsappMessage(telefone, mensagem, undefined, organizacaoId)
      return NextResponse.json({ ok: !!resultado, result: resultado })
    }

    if (action === "update_demanda") {
      const codigo = typeof params.codigo === "string" ? params.codigo : null
      const data = somenteCamposPermitidos(params.data)
      if (!codigo) return NextResponse.json({ error: "codigo obrigatório" }, { status: 400 })
      if (!data) {
        return NextResponse.json(
          { error: `data deve conter ao menos um campo permitido: ${[...CAMPOS_PERMITIDOS].join(", ")}` },
          { status: 400 }
        )
      }

      const demanda = await prisma.demanda.findFirst({
        where: { codigo, organizacaoId },
      })
      if (!demanda) return NextResponse.json({ error: "demanda not found" }, { status: 404 })

      const updated = await prisma.demanda.update({
        where: { id: demanda.id },
        data,
      })
      return NextResponse.json({ ok: true, id: updated.id, codigo: updated.codigo })
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  } catch (e) {
    console.error("[admin-action] Error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
