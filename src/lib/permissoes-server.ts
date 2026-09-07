// Leitura e escrita de permissões, sempre escopadas à empresa.
//
// Existe porque a busca estava espalhada em 8 lugares como
// `findUnique({ where: { usuarioId } })`. Com as permissões agora por empresa,
// cada um desses pontos precisaria lembrar de incluir a organização — e é
// exatamente o tipo de coisa que alguém esquece. Aqui é impossível esquecer.
import { prisma } from "@/lib/prisma"
import { BASE_FALSE, permissaoEfetiva, type MapaPermissoes, type PermissaoKey } from "@/lib/permissoes"
import type { PermissaoUsuario } from "@prisma/client"

export type { MapaPermissoes }

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

/**
 * A permissão efetiva desta pessoa NESTA empresa — o ponto único de leitura
 * para autorização organizacional.
 *
 * Resolve `permissoes_usuario` e o vínculo numa consulta só e delega a decisão
 * para `permissaoEfetiva` (função pura, em lib/permissoes.ts, coberta por
 * testes). Devolve `null` quando não dá para determinar com segurança —
 * organização ausente, sem vínculo, vínculo de outra empresa, pessoa inativa,
 * papel ausente ou papel sem preset. `null` significa NEGAR.
 *
 * O papel vem SEMPRE de `UsuarioOrganizacao.papel`. `Usuario.tipo` é global e
 * não decide autorização dentro de uma empresa — ver src/lib/papel.ts.
 */
export type VinculoEfetivo = {
  /** `UsuarioOrganizacao.papel`, lido do banco — nunca da sessão. */
  papel: string
  permissoes: MapaPermissoes
}

export async function permissoesEfetivas(
  usuarioId: string,
  organizacaoId: string | null | undefined
): Promise<VinculoEfetivo | null> {
  if (!organizacaoId) return null

  const vinculo = await prisma.usuarioOrganizacao
    .findUnique({
      where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
      select: {
        papel: true,
        organizacaoId: true,
        usuario: { select: { status: true } },
      },
    })
    .catch(() => null)

  // Sem vínculo não há o que herdar: a pessoa não é desta empresa.
  if (!vinculo) return null

  const explicita = await getPermissoes(usuarioId, organizacaoId).catch(() => null)

  const permissoes = permissaoEfetiva({
    membro: {
      papel: vinculo.papel,
      organizacaoId: vinculo.organizacaoId,
      statusUsuario: vinculo.usuario?.status ?? null,
    },
    permissaoExplicita: explicita,
    organizacaoId,
  })

  if (!permissoes) return null

  // O papel devolvido vem do VÍNCULO, não da sessão. `src/lib/auth.ts:88` grava
  // `papel: membership?.papel ?? usuario.tipo` no JWT: sem membership resolvida,
  // o token carrega o tipo GLOBAL. Quem lê autoridade da sessão herda esse
  // fallback — e para a pessoa com `tipo = admin` / `papel = videomaker` isso
  // seria admin numa empresa onde ela é videomaker. Aqui o banco decide.
  return { papel: vinculo.papel, permissoes }
}
