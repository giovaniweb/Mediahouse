// Quem pede pelo formulário público (/c/<slug>, /api/publico/demanda).
//
// Auditoria de 18/11/2026: a rota procurava o telefone digitado na PLATAFORMA
// inteira, punha o dono desse número como solicitante da empresa do formulário
// e ainda gravava o e-mail digitado na conta dele, se ela não tivesse um. Quem
// soubesse o telefone de alguém criava um vínculo dessa pessoa com outra empresa
// e, com o e-mail, abria o "esqueci a senha" para a conta dela.
//
// Formulário público não prova identidade. A regra agora:
//  1. Reaproveita só quem já é MEMBRO desta empresa com esse telefone ou
//     e-mail, e não muda nada no cadastro dele.
//  2. Fora isso, nasce um solicitante NOVO, vinculado só a esta empresa.
//  3. O solicitante novo só recebe o telefone e o e-mail se nenhuma conta da
//     plataforma os usa. O login por telefone pega a primeira conta que contém
//     os dígitos, e o e-mail é único: uma conta criada por um estranho com o
//     contato de outra pessoa não pode passar a responder por ela. Nesse caso
//     o contato digitado fica no próprio pedido (telefoneSolicitante e a
//     descrição), e a gestão junta os cadastros depois, se for a mesma pessoa.
import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { criarUsuarioComVinculo } from "@/lib/criar-usuario"

export type ContatoDoFormulario = { nomeCliente: string; email: string; telefone: string }

/** Últimos 9 dígitos: o mesmo trecho que o resto do app usa para casar celular com e sem DDI/DDD. */
export function trechoDoTelefone(telefone: string): string | null {
  const d = telefone.replace(/\D/g, "")
  return d.length >= 8 ? d.slice(-9) : null
}

/** Membro desta empresa com este telefone ou e-mail (o mais antigo, para ser estável). */
export async function membroPorContato(organizacaoId: string, c: Pick<ContatoDoFormulario, "email" | "telefone">) {
  const trecho = trechoDoTelefone(c.telefone)
  const email = c.email.trim()
  const ou = [
    ...(trecho ? [{ telefone: { contains: trecho } }] : []),
    ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
  ]
  if (!ou.length) return null
  const v = await prisma.usuarioOrganizacao.findFirst({
    where: { organizacaoId, usuario: { OR: ou } },
    orderBy: { createdAt: "asc" },
    select: { usuarioId: true },
  })
  return v?.usuarioId ?? null
}

/**
 * Solicitante do pedido público. `contatoGuardado` diz se o telefone e o e-mail
 * digitados estão no cadastro de quem ficou como solicitante; quando não estão,
 * a rota os copia para a descrição do pedido.
 */
export async function solicitanteDoFormulario(
  organizacaoId: string,
  c: ContatoDoFormulario,
): Promise<{ id: string; novo: boolean; contatoGuardado: boolean }> {
  const membro = await membroPorContato(organizacaoId, c)
  if (membro) return { id: membro, novo: false, contatoGuardado: true }

  // Busca na plataforma inteira (cliente de autenticação) só para saber se o
  // contato já tem dono — o resultado nunca vira vínculo nem alteração.
  const trecho = trechoDoTelefone(c.telefone)
  const email = c.email.trim()
  const [telDeOutro, emailDeOutro] = await Promise.all([
    trecho ? prismaAuth.usuario.findFirst({ where: { telefone: { contains: trecho } }, select: { id: true } }) : null,
    email ? prismaAuth.usuario.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }) : null,
  ])

  // Senha aleatória e nunca enviada: quem pede pelo formulário não entra no
  // sistema por ela. Se um dia precisar, a gestão manda o link de acesso.
  const senhaHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10)
  const criado = await criarUsuarioComVinculo(
    organizacaoId,
    {
      nome: c.nomeCliente,
      email: emailDeOutro ? null : email.toLowerCase(),
      telefone: telDeOutro ? null : c.telefone,
      tipo: "solicitante",
      senhaHash,
    },
    { papel: "solicitante", categoria: "solicitante", funcaoProfissional: null, areas: [] },
    { id: true },
  )
  return { id: criado.id, novo: true, contatoGuardado: !telDeOutro && !emailDeOutro }
}
