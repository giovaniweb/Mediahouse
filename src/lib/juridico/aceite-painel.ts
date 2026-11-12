// A conferência que o layout do painel faz a cada carga de página.
import { unstable_rethrow } from "next/navigation"
import { auth } from "@/lib/auth"
import { getOrgId } from "@/lib/org"
import { prismaAuth } from "@/lib/prisma-auth"
import type { SlugDocumento } from "@/lib/juridico/documentos"
import { situacaoDoAceite } from "@/lib/juridico/aceite-servidor"

/** `organizacaoId` vai para a tela e volta no clique: o aceite fica preso à
 *  empresa que a pessoa viu, mesmo que outra aba troque a empresa ativa. */
export type AceitePendente = { pendentes: SlugDocumento[]; organizacaoId: string; empresa: string; emNomeDaEmpresa: boolean; versaoNova: boolean }

/**
 * null quando não há nada a aceitar — e também quando a conferência falha.
 * Falhar aberto é de propósito: um erro aqui (banco lento, migration ainda não
 * aplicada) não pode tirar o sistema inteiro do ar para todo mundo. O aceite que
 * faltar é pedido de novo na próxima página.
 */
export async function aceitePendenteDoPainel(): Promise<AceitePendente | null> {
  try {
    const session = await auth()
    const usuarioId = session?.user?.id
    if (!usuarioId) return null
    const organizacaoId = await getOrgId(session)
    if (!organizacaoId) return null
    const { pendentes, exigidos, anteriores } = await situacaoDoAceite(usuarioId, organizacaoId)
    if (pendentes.length === 0) return null
    const org = await prismaAuth.organizacao.findUnique({ where: { id: organizacaoId }, select: { nome: true } })
    return {
      pendentes,
      organizacaoId,
      empresa: org?.nome ?? "sua empresa",
      emNomeDaEmpresa: exigidos.includes("dpa"),
      versaoNova: anteriores > 0,
    }
  } catch (e) {
    // Os sinais internos do Next (leitura de cookies/headers no build, redirect)
    // não são falha: engoli-los fazia o build gerar o painel como página
    // estática, com aceite = null congelado — ninguém via a tela de aceite.
    unstable_rethrow(e)
    console.error("[aceite] conferência do aceite falhou — painel liberado:", e instanceof Error ? e.message : e)
    return null
  }
}
