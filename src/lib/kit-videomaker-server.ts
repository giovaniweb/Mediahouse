import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { requireAcesso } from "@/lib/acesso"
import { linkValido } from "@/lib/etapas-da-gravacao"

// Quem mexe no kit do videomaker: a gestão (admin, gestor) e quem opera as
// Gravações Externas. Ver é de qualquer pessoa da empresa.
export async function acessoAoKit(editar: boolean) {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  if (!editar) return acesso
  if (acesso.papel === "admin" || acesso.papel === "gestor") return acesso
  const membro = await comOrg(acesso.organizacaoId, () => prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId: acesso.usuarioId, organizacaoId: acesso.organizacaoId } },
    select: { operaGravacoes: true },
  }))
  if (membro?.operaGravacoes) return acesso
  return NextResponse.json({ error: "Só a gestão ou quem opera as gravações mexe no kit." }, { status: 403 })
}

/** O endereço do material: arquivo do kit desta empresa ou link externo https. */
export function urlDoKitValida(url: string, organizacaoId: string): boolean {
  return url.startsWith(`/api/midia/org/${organizacaoId}/kit/`) || linkValido(url)
}
