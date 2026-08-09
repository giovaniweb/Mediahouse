// Leitura e escrita de permissões, sempre escopadas à empresa.
//
// Existe porque a busca estava espalhada em 8 lugares como
// `findUnique({ where: { usuarioId } })`. Com as permissões agora por empresa,
// cada um desses pontos precisaria lembrar de incluir a organização — e é
// exatamente o tipo de coisa que alguém esquece. Aqui é impossível esquecer.
import { prisma } from "@/lib/prisma"
import { BASE_FALSE, type PermissaoKey } from "@/lib/permissoes"
import type { PermissaoUsuario } from "@prisma/client"

export type MapaPermissoes = Record<PermissaoKey, boolean>

// Permissões da pessoa NAQUELA empresa. Sem registro, devolve tudo falso —
// ausência de permissão é ausência de acesso, nunca acesso liberado.
export async function getPermissoes(
  usuarioId: string,
  organizacaoId: string
): Promise<PermissaoUsuario | null> {
  return prisma.permissaoUsuario.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
  })
}

// Checagem de uma permissão específica. `admin` e `gestor` passam direto: são o
// papel que administra a empresa e não dependem de checkbox.
export async function temPermissao(
  usuarioId: string,
  organizacaoId: string,
  chave: PermissaoKey,
  papel?: string | null
): Promise<boolean> {
  if (papel === "admin" || papel === "gestor") return true
  const p = await getPermissoes(usuarioId, organizacaoId)
  return !!p?.[chave as keyof PermissaoUsuario]
}

// Cria/atualiza as permissões de alguém numa empresa. Único ponto de escrita.
export async function setPermissoes(
  usuarioId: string,
  organizacaoId: string,
  valores: Partial<MapaPermissoes>
): Promise<PermissaoUsuario> {
  return prisma.permissaoUsuario.upsert({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
    create: { usuarioId, organizacaoId, ...BASE_FALSE, ...valores },
    update: valores,
  })
}
