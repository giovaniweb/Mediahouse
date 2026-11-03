// A área pública de cada empresa: nuflow.space/c/<slug>.
//
// Quem pede vídeo, quem quer trabalhar como videomaker e quem só quer entrar na
// conta chega pela área da empresa, e não por um formulário genérico que caía na
// empresa padrão. Aqui fica a única leitura que a área precisa: quem é a empresa
// dona do slug. Só o que já é público vai junto — nome e logo —, e empresa
// desligada responde como inexistente.
import { prismaAuth } from "@/lib/prisma-auth"
import { SLUG_PUBLICO } from "@/lib/org-publica-cliente"
import { SLUG_LINKS_ANTIGOS } from "@/lib/org"

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

/** Identidade pública da empresa pelo id (a de quem está logado, na galeria aberta do painel). */
export async function empresaPorId(id: string): Promise<EmpresaPublica | null> {
  const org = await prismaAuth.organizacao.findUnique({
    where: { id },
    select: { nome: true, slug: true, logoUrl: true, ativo: true },
  })
  if (!org?.ativo) return null
  return { nome: org.nome, slug: org.slug, logoUrl: org.logoUrl }
}

/**
 * Para onde vai um LINK ANTIGO (/cadastrar-demanda, /cadastrar-videomaker): a
 * área da empresa do ?org=, ou, sem ele, a dos links antigos (SLUG_LINKS_ANTIGOS),
 * que é de quem esses links eram. A pessoa chega à área com o nome da empresa no
 * topo; nada é gravado aqui. Slug que não existe não cai em empresa nenhuma:
 * devolve null, para a tela dizer que o link está errado.
 */
export async function empresaDoLinkAntigo(slug: string | null | undefined): Promise<EmpresaPublica | null> {
  return empresaDoPortal(slug?.trim() ? slug : SLUG_LINKS_ANTIGOS)
}
