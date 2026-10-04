// Criar pessoa sob RLS.
//
// `usuarios` só é visível para a empresa em que a pessoa tem vínculo
// (`usuarios_por_membresia`). Uma pessoa recém-inserida ainda não tem vínculo
// nenhum, então o `INSERT ... RETURNING` que `prisma.usuario.create` faz devolve
// uma linha que a própria empresa não pode ver — e o Postgres recusa o INSERT
// inteiro: "new row violates row-level security policy for table usuarios". O
// ensaio de 04/10/2026 pegou isso em Pessoas & Acessos, no cadastro de
// editor/videomaker com acesso e no formulário público de demanda.
//
// A ordem que funciona: o id nasce aqui, o INSERT vai sem RETURNING
// (`createMany`), o vínculo com a empresa vem em seguida e só então a pessoa é
// lida. Tudo numa transação — pessoa sem vínculo não pode sobrar se o vínculo
// falhar.
//
// Procurar quem já existe também muda. E-mail e telefone são únicos na
// PLATAFORMA, não na empresa: a busca pelo cliente normal não acharia a pessoa
// cadastrada por outra empresa, e o INSERT seguinte cairia na chave única. A
// busca vai pelo cliente de autenticação — o mesmo do login, que enxerga a
// identidade em todas as empresas — e devolve só o id. O resto da pessoa só é
// lido depois, pelo cliente normal, quando houver vínculo com a empresa ativa.
import { randomUUID } from "node:crypto"
import type { CategoriaPessoa, AreaAtuacao, Prisma, TipoUsuario } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { comOrg } from "@/lib/org-contexto"

/** Id de quem já usa este e-mail na plataforma, em qualquer empresa. */
export async function usuarioIdPorEmail(email: string): Promise<string | null> {
  const u = await prismaAuth.usuario.findUnique({ where: { email }, select: { id: true } })
  return u?.id ?? null
}

/** Id de quem tem um telefone que contém `trecho`, em qualquer empresa. */
export async function usuarioIdPorTelefone(trecho: string): Promise<string | null> {
  const u = await prismaAuth.usuario.findFirst({ where: { telefone: { contains: trecho } }, select: { id: true } })
  return u?.id ?? null
}

type DadosPessoa = Pick<Prisma.UsuarioCreateManyInput, "nome" | "email" | "telefone" | "senhaHash"> & { tipo: TipoUsuario }
type Vinculo = {
  papel: TipoUsuario
  categoria?: CategoriaPessoa
  funcaoProfissional?: string | null
  areas?: AreaAtuacao[]
}

/** Cria a pessoa já vinculada a `organizacaoId` e devolve `select` dela, lido sob RLS. */
export async function criarUsuarioComVinculo<S extends Prisma.UsuarioSelect>(
  organizacaoId: string,
  dados: DadosPessoa,
  vinculo: Vinculo,
  select: S
): Promise<Prisma.UsuarioGetPayload<{ select: S }>> {
  const id = randomUUID()
  return comOrg(organizacaoId, async () => {
    await prisma.$transaction(async (tx) => {
      await tx.usuario.createMany({ data: [{ id, ...dados }] })
      await tx.usuarioOrganizacao.create({ data: { usuarioId: id, organizacaoId, ...vinculo } })
    })
    return prisma.usuario.findUniqueOrThrow({ where: { id }, select }) as Promise<Prisma.UsuarioGetPayload<{ select: S }>>
  })
}
