import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireSuperAdmin } from "@/lib/org"
import { prismaAdmin } from "@/lib/prisma-admin"
import { recifrarTudo } from "@/lib/recifrar"

// POST /api/admin/recifrar — passa os dados sensíveis para a chave própria
// (lib/recifrar). Só super-admin. Corpo { aplicar: true } grava; sem ele, só
// conta o que falta. Roda aqui, no servidor da Vercel, porque é só lá que as
// chaves existem: elas nunca saem de lá nem passam por ninguém.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin(await auth())
  if (admin instanceof NextResponse) return admin
  const corpo = await req.json().catch(() => ({}))
  try {
    const resultado = await recifrarTudo(prismaAdmin, { aplicar: corpo?.aplicar === true })
    console.info("[recifrar]", { aplicado: resultado.aplicado, pendentes: resultado.pendentes, recifrados: resultado.recifrados, ilegiveis: resultado.ilegiveis })
    return NextResponse.json(resultado, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 })
  }
}
