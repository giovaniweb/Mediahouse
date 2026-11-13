// Quem da empresa parceira faz o card que ela recebeu por espelho (12/11/2026):
// o X da GH na gravação da Contourline. A linha mora em `executor_espelho`, é
// dado da GH, e toda leitura aqui filtra pela empresa ATIVA — a dona nunca a vê.
//
// Para a dona, tudo o que o X faz entra como do videomaker que ela escalou (o
// Gabriel), "pela GH Produção". Quem fez de verdade fica na auditoria da GH.
import { prisma } from "@/lib/prisma"
import type { AcessoDemanda } from "@/lib/compartilhamento"

/** A pessoa é o executor escolhido pela empresa ATIVA para este card? Devolve o Videomaker dela. */
export async function executorDaPessoa(
  usuarioId: string,
  organizacaoId: string,
  demandaId: string
): Promise<{ videomakerId: string } | null> {
  const perfil = await prisma.videomaker.findFirst({ where: { usuarioId }, select: { id: true } })
  if (!perfil) return null
  const linha = await prisma.executorEspelho.findFirst({
    where: { organizacaoId, demandaId, videomakerId: perfil.id },
    select: { videomakerId: true },
  })
  return linha
}

/**
 * Quem aparece no histórico da DONA por uma ação feita na parceira.
 *
 * - Na dona: a própria pessoa.
 * - No espelho automático, enquanto o card segue com o videomaker que o trouxe:
 *   o usuário desse videomaker (o Gabriel). É ele o responsável para a dona.
 * - Na terceirização manual: ninguém — a observação diz "Pela <empresa>".
 */
export function autorNaDona(
  acesso: Pick<AcessoDemanda, "papel" | "porVideomakerId">,
  usuarioDaSessao: string,
  card: { videomakerId: string | null; videomaker?: { usuarioId: string | null } | null }
): string | null {
  if (acesso.papel === "dona") return usuarioDaSessao
  if (acesso.porVideomakerId && acesso.porVideomakerId === card.videomakerId) return card.videomaker?.usuarioId ?? null
  return null
}
