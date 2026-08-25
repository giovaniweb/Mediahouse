// Quais módulos esta empresa tem — a leitura do lado servidor (Node).
//
// Fica separado de `modulos.ts` de propósito: aquele é catálogo puro, sem
// estado e sem Prisma, e por isso pode ser importado pelo middleware edge-safe.
// Este fala com o banco e só roda em rota, página ou job.
import { prisma } from "@/lib/prisma"
import { DISPONIVEL_NA_PLATAFORMA, PADRAO_MODULOS, moduloDaRota, type Modulo } from "@/lib/modulos"

export type MapaModulos = Record<Modulo, boolean>

/**
 * Módulos efetivos de uma empresa.
 *
 * Duas camadas, e a ordem importa: o que não está DISPONÍVEL na plataforma fica
 * desligado mesmo que a empresa tenha linha dizendo `ativo: true`. Vender o que
 * não existe é pior que não vender.
 *
 * Sem organização, devolve o padrão — quem chama trata como "nada específico",
 * nunca como "tudo liberado".
 */
export async function modulosDaOrganizacao(organizacaoId: string | null | undefined): Promise<MapaModulos> {
  const efetivo = { ...PADRAO_MODULOS }
  if (organizacaoId) {
    const linhas = await prisma.moduloOrganizacao.findMany({
      where: { organizacaoId },
      select: { modulo: true, ativo: true },
    })
    for (const l of linhas) {
      if (l.modulo in efetivo) efetivo[l.modulo as Modulo] = l.ativo
    }
  }
  // Chave geral por cima da decisão comercial.
  for (const chave of Object.keys(efetivo) as Modulo[]) {
    if (!DISPONIVEL_NA_PLATAFORMA[chave]) efetivo[chave] = false
  }
  return efetivo
}

/** Um módulo específico. */
export async function moduloAtivo(organizacaoId: string | null | undefined, modulo: Modulo): Promise<boolean> {
  return (await modulosDaOrganizacao(organizacaoId))[modulo]
}

/**
 * O caminho pertence a um módulo que esta empresa NÃO tem?
 *
 * Usado pelas rotas e páginas de módulo. O middleware não consegue fazer esta
 * pergunta — ele roda no edge e não alcança o banco —, então a checagem por
 * empresa acontece aqui, do lado Node.
 */
export async function rotaBloqueadaParaOrg(
  pathname: string,
  organizacaoId: string | null | undefined
): Promise<boolean> {
  const modulo = moduloDaRota(pathname)
  if (!modulo) return false
  return !(await modulosDaOrganizacao(organizacaoId))[modulo]
}
