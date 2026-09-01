// Descobrir a empresa a partir de uma credencial pública.
//
// Rota pública por token tem o mesmo problema de ordem que o login: precisa ler
// o registro para saber de qual empresa ele é, e sob RLS ler o registro já
// exigiria saber a empresa. Sem uma saída, /aprovar, /e/[slug], /nf-upload e /d
// respondem vazio para todo mundo.
//
// A saída é uma função SECURITY DEFINER no banco que recebe a credencial e
// devolve SÓ o id da empresa — nem título, nem valor, nem a existência de outros
// registros. Quem tem o token descobre a empresa dele e nada mais.
//
// O uso é sempre o mesmo desenho:
//
//   const organizacaoId = await orgPorCredencial("nota_fiscal", token)
//   if (!organizacaoId) return NextResponse.json({ error: "..." }, { status: 404 })
//   return comOrg(organizacaoId, async () => { ...o resto da rota... })
//
// O 404 antes do `comOrg` importa: credencial inválida tem que responder igual a
// credencial de outra empresa, senão a diferença entre "não existe" e "existe e
// não é sua" vira um oráculo.
import { prismaBase } from "@/lib/prisma"

export type TipoCredencial =
  | "demanda"
  | "demanda_publica"
  | "nota_fiscal"
  | "convite"
  | "cobertura"
  | "fornecedor"
  | "arquivo"
  | "arquivo_por_url"

/** Id da empresa dona da credencial, ou null se ela não vale nada. */
export async function orgPorCredencial(
  tipo: TipoCredencial,
  valor: string | null | undefined
): Promise<string | null> {
  if (!valor) return null
  try {
    // `prismaBase` de propósito: esta chamada acontece ANTES de haver empresa
    // declarada, então ela não pode passar pela extensão que declara a empresa.
    const linhas = await prismaBase.$queryRaw<{ org: string | null }[]>`
      SELECT public.org_por_credencial(${tipo}, ${valor}) AS org
    `
    return linhas[0]?.org ?? null
  } catch (e) {
    console.error(`[org-por-credencial] falha ao resolver ${tipo}:`, e)
    return null
  }
}
