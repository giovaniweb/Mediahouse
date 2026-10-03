import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { biblioteca } from "@/lib/biblioteca"
/** Compatibilidade: a pendência agora é um filtro da biblioteca. */
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso("verRelatorios")
  if (acesso instanceof NextResponse) return acesso
  if (!["admin","gestor"].includes(acesso.papel)) return NextResponse.json({ error: "Acesso restrito" },{ status: 403 })
  const url = new URL(req.url); url.searchParams.set("qualidade","sem_final")
  return biblioteca(new NextRequest(url),"audiovisual")
}
