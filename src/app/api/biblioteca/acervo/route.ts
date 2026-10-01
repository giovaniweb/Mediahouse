import { comOrg } from "@/lib/org-contexto"
import { NextRequest, NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { ErroAcervo, simularAcervo, aplicarAcervo } from "@/lib/acervo-recuperacao"
export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  if (acesso.papel !== "admin" || !acesso.permissoes.editarDemanda || !acesso.permissoes.verTodasDemandas) return NextResponse.json({ error: "Manutenção restrita à administração com acesso às demandas." },{ status: 403 })
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" },{ status: 400 }) }
  if (!body || !["simular","aplicar"].includes(body.acao) || (body.cursor !== undefined && typeof body.cursor !== "string") || (body.acao === "aplicar" && typeof body.loteId !== "string")) return NextResponse.json({ error: "Ação inválida" },{ status: 400 })
  try { return NextResponse.json(body.acao === "simular" ? await simularAcervo(prisma,acesso,body.cursor) : await aplicarAcervo(prisma,acesso,body.loteId),{ headers: { "Cache-Control": "private, no-store" } }) }
  catch (e) { return NextResponse.json({ error: e instanceof ErroAcervo ? e.message : "Não foi possível concluir. Recarregue o lote antes de tentar novamente." }, { status: 409 }) }
}

export async function GET() {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  if (acesso.papel !== "admin" || !acesso.permissoes.editarDemanda || !acesso.permissoes.verTodasDemandas) return NextResponse.json({ error: "Acesso restrito à manutenção." },{ status: 403 })
  try {
    const lotes = await comOrg(acesso.organizacaoId,()=>prisma.loteAcervo.findMany({ where: { organizacaoId: acesso.organizacaoId, operadorId: acesso.usuarioId }, orderBy: [{ createdAt: "desc" },{ id: "desc" }], take: 10, select: { id:true, snapshot:true, resultado:true, estado:true, expiraEm:true, createdAt:true } }))
    return NextResponse.json({ lotes: lotes.map(l=>({ loteId:l.id,itens:l.snapshot,resultado:l.resultado,estado:l.estado,expiraEm:l.expiraEm,createdAt:l.createdAt,proximoCursor:null })) },{ headers: { "Cache-Control":"private, no-store" } })
  } catch { return NextResponse.json({ error:"Não foi possível consultar os lotes." },{ status:503 }) }
}
