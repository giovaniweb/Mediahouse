import { createHash, randomBytes } from "node:crypto"
import type { Session } from "next-auth"
import { prismaBase } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"

// Chave do assistente (MCP) de uma pessoa — ver TokenMcp no schema.
//
// O assistente age como a pessoa: a sessão montada aqui tem o mesmo formato da
// do login, com o papel dela na empresa da chave, e é ela que as regras de
// escopo e de criação recebem. Nada de permissão própria do MCP.

/** Prefixo visível: quem achar a chave num log sabe o que é e onde revogar. */
export const PREFIXO_CHAVE_MCP = "nfmcp_"

export function hashDaChave(chave: string): string {
  return createHash("sha256").update(chave).digest("hex")
}

/** A chave sai daqui uma vez só; o banco guarda o hash. */
export function gerarChaveMcp(): { chave: string; hash: string } {
  const chave = PREFIXO_CHAVE_MCP + randomBytes(32).toString("base64url")
  return { chave, hash: hashDaChave(chave) }
}

export type PessoaMcp = { tokenId: string; organizacaoId: string; sessao: Session }

/**
 * De quem é a chave. Null quando não existe, foi revogada, ou a pessoa não
 * entraria mais no NuFlow (pessoa inativa, sem vínculo, empresa inativa) — a
 * mesma régua de `vinculoAtivo`. A chave não vale um dia a mais que o login.
 */
export async function pessoaPorChaveMcp(chave: string | null | undefined): Promise<PessoaMcp | null> {
  if (!chave?.startsWith(PREFIXO_CHAVE_MCP)) return null
  // A chave chega antes de haver empresa declarada: a função devolve só de quem
  // ela é (migration 20261030200000), sem abrir a tabela.
  const [t] = await prismaBase.$queryRaw<{ tokenId: string; organizacaoId: string; usuarioId: string }[]>`
    SELECT * FROM public.pessoa_por_token_mcp(${hashDaChave(chave)})`
  if (!t) return null
  const v = await prismaAuth.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId: t.usuarioId, organizacaoId: t.organizacaoId } },
    select: {
      papel: true,
      usuario: { select: { nome: true, email: true, tipo: true, status: true } },
      organizacao: { select: { ativo: true } },
    },
  })
  if (!v || v.usuario.status !== "ativo" || !v.organizacao.ativo) return null
  return {
    tokenId: t.tokenId,
    organizacaoId: t.organizacaoId,
    sessao: {
      user: {
        id: t.usuarioId,
        name: v.usuario.nome,
        email: v.usuario.email,
        tipo: v.usuario.tipo,
        organizacaoId: t.organizacaoId,
        papel: v.papel,
      },
      expires: "",
    },
  }
}
