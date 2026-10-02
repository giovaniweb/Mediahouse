import { correlacaoAuditoria, registrarAuditoria } from "@/lib/auditoria"
import { NextRequest, NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { SEM_CACHE_MIDIA, urlPublicavel } from "@/lib/publicacao-midia"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireAcesso("editarDemanda")
  if (acesso instanceof NextResponse) return acesso
  if (!["admin", "gestor"].includes(acesso.papel)) return NextResponse.json({ error: "Somente a gestão pode publicar no portfólio" }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body || Object.keys(body).length !== 1 || typeof body.publicar !== "boolean") return NextResponse.json({ error: "Informe publicar: true ou false" }, { status: 400 })
  const { id } = await params
  const correlationId = correlacaoAuditoria()
  return comOrg(acesso.organizacaoId, async () => {
    // Serializa publicação/revogação com a leitura do conteúdo: o snapshot é a versão consentida.
    return prisma.$transaction(async tx => {
      const a = await tx.arquivo.findFirst({ where: { id, tipoArquivo: "final", demanda: { organizacaoId: acesso.organizacaoId } }, include: { demanda: { select: { organizacaoId: true } } } })
      if (!a) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 })
      if (body.publicar && (!urlPublicavel(a.url, acesso.organizacaoId, a.demandaId) || (a.thumbnailUrl && !urlPublicavel(a.thumbnailUrl, acesso.organizacaoId, a.demandaId, true)))) {
        return NextResponse.json({ error: "Mídia inválida para publicação. Revise o arquivo e sua miniatura." }, { status: 422 })
      }
      // Uma segunda publicação não substitui silenciosamente o snapshot já público.
      if (body.publicar && a.publicadoEm && !a.revogadoEm) return NextResponse.json({ ok: true }, { headers: SEM_CACHE_MIDIA })
      if (!body.publicar && (!a.publicadoEm || a.revogadoEm)) return NextResponse.json({ ok: true }, { headers: SEM_CACHE_MIDIA })
      await tx.arquivo.update({ where: { id }, data: body.publicar
        ? { publicadoEm: new Date(), publicadoPor: acesso.usuarioId, revogadoEm: null, revogadoPor: null, publicacaoUrl: a.url, publicacaoThumbnailUrl: a.thumbnailUrl }
        : { revogadoEm: new Date(), revogadoPor: acesso.usuarioId } })
      await registrarAuditoria(tx, acesso, { acao: "arquivo.publicacao", recurso: "arquivo", recursoId: id, correlationId,
        antes: { publicado: !!a.publicadoEm && !a.revogadoEm }, depois: { publicado: body.publicar } })
      return NextResponse.json({ ok: true }, { headers: SEM_CACHE_MIDIA })
    }, { isolationLevel: "Serializable" })
  })
}
