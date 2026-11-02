import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { requireAcesso } from "@/lib/acesso"
import { linkValido } from "@/lib/etapas-da-gravacao"

/**
 * A gestão (admin, gestor) ou quem opera as Gravações Externas. É a porta do
 * que é da operação: mexer no kit, cancelar a gravação.
 */
export async function acessoDaOperacao(recusa: string) {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  if (acesso.papel === "admin" || acesso.papel === "gestor") return acesso
  const membro = await comOrg(acesso.organizacaoId, () => prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId: acesso.usuarioId, organizacaoId: acesso.organizacaoId } },
    select: { operaGravacoes: true },
  }))
  if (membro?.operaGravacoes) return acesso
  return NextResponse.json({ error: recusa }, { status: 403 })
}

// Quem mexe no kit do videomaker: a operação (acessoDaOperacao). Ver é de
// qualquer pessoa da empresa.
export async function acessoAoKit(editar: boolean) {
  if (!editar) return requireAcesso()
  return acessoDaOperacao("Só a gestão ou quem opera as gravações mexe no kit.")
}

/** O endereço do material: arquivo do kit desta empresa ou link externo https. */
export function urlDoKitValida(url: string, organizacaoId: string): boolean {
  return url.startsWith(`/api/midia/org/${organizacaoId}/kit/`) || linkValido(url)
}
