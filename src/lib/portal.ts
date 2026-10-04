// A área pública de cada empresa: nuflow.space/c/<slug>.
//
// Quem pede vídeo, quem quer trabalhar como videomaker e quem só quer entrar na
// conta chega pela área da empresa, e não por um formulário genérico que caía na
// empresa padrão. Aqui fica a única leitura que a área precisa: quem é a empresa
// dona do slug. Só o que já é público vai junto — nome e logo —, e empresa
// desligada responde como inexistente.
import { prismaAuth } from "@/lib/prisma-auth"
import { SLUG_PUBLICO } from "@/lib/org-publica-cliente"
import { SLUG_ORG_PADRAO } from "@/lib/org"

export type EmpresaPublica = { nome: string; slug: string; logoUrl: string | null }

export async function empresaDoPortal(slug: string | null | undefined): Promise<EmpresaPublica | null> {
  const alvo = slug?.trim().toLowerCase()
  if (!alvo || !SLUG_PUBLICO.test(alvo)) return null
  const org = await prismaAuth.organizacao.findUnique({
    where: { slug: alvo },
    select: { nome: true, slug: true, logoUrl: true, ativo: true },
  })
  if (!org?.ativo) return null
  return { nome: org.nome, slug: org.slug, logoUrl: org.logoUrl }
}

/**
 * A empresa que recebe um formulário público: a do slug, ou a padrão quando o
 * link não traz slug nenhum (os links antigos). Slug que não existe não cai na
 * padrão: devolve null, para a tela dizer que o link está errado em vez de
 * mandar o pedido para a empresa errada sem avisar.
 */
export async function empresaDestino(slug: string | null | undefined): Promise<EmpresaPublica | null> {
  return empresaDoPortal(slug?.trim() ? slug : SLUG_ORG_PADRAO)
}
