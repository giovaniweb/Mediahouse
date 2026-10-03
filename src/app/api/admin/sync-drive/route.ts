import { NextRequest, NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { driveCopiaAtiva, enfileirarCopiasDrive, statusCopiasDrive } from "@/lib/drive-copias"
import { ErroCopiaDrive } from "@/lib/drive-copia-provedor"

export async function GET() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  try { return NextResponse.json(await statusCopiasDrive(prisma,acesso.organizacaoId), { headers: { "Cache-Control": "private, no-store" } }) }
  catch { return NextResponse.json({ error: "Não foi possível consultar as cópias." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }) }
}
/** Só enfileira. A cópia verificada aparece no GET após o consumidor concluir. */
export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  if (!driveCopiaAtiva(acesso.organizacaoId)) return NextResponse.json({ error: "Sincronização em homologação; piloto ainda não ativado para esta empresa." }, { status: 409 })
  let body: { cursor?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Informe um objeto JSON." }, { status: 400 }) }
  if (!body || typeof body !== "object" || (body.cursor !== undefined && typeof body.cursor !== "string")) return NextResponse.json({ error: "Cursor inválido." }, { status: 400 })
  try { return NextResponse.json({ ok: true, ...await enfileirarCopiasDrive(prisma,acesso.organizacaoId,body.cursor) }, { status: 202 }) }
  catch (e) { return NextResponse.json({ error: e instanceof ErroCopiaDrive ? e.codigo : "Não foi possível enfileirar o lote." }, { status: e instanceof ErroCopiaDrive ? 409 : 500 }) }
}
