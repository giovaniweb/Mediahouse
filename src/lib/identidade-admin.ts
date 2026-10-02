import { prismaAuth } from "@/lib/prisma-auth"

/** Gestão de uma empresa não concede controle da identidade usada em outras. */
export async function podeAdministrarIdentidade(atorId: string, organizacaoId: string, alvoId: string) {
  if (atorId === alvoId) return true
  const [ator, alvo, outrasEmpresas] = await Promise.all([
    prismaAuth.usuario.findUnique({ where: { id: atorId }, select: { superAdmin: true, status: true } }),
    prismaAuth.usuario.findUnique({ where: { id: alvoId }, select: { superAdmin: true } }),
    // Cliente de autenticação: RLS da empresa não pode esconder os outros vínculos.
    prismaAuth.usuarioOrganizacao.count({ where: { usuarioId: alvoId, organizacaoId: { not: organizacaoId } } }),
  ])
  if (!ator || ator.status !== "ativo" || !alvo) return false
  return ator.superAdmin || (!alvo.superAdmin && outrasEmpresas === 0)
}

export async function numeroDeEmpresasDaIdentidade(usuarioId: string) {
  return prismaAuth.usuarioOrganizacao.count({ where: { usuarioId } })
}
