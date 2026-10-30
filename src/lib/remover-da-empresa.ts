// Tirar uma pessoa de UMA empresa sem apagar o que ela deixou.
//
// Existe por causa do WhatsApp. A identificação do número
// (lib/whatsapp-identidade.ts) recusa o envio quando o número aparece em mais
// de um cadastro da empresa ou num cadastro inativo dela. Desativar ou mesclar
// deixava o cadastro velho na empresa, com o mesmo número da pessoa que ficou,
// e todo aviso para ela era descartado sem erro nenhum: o João (editor) passou
// de 03/10 a 30/10/2026 sem receber uma mensagem, e outras cinco pessoas também.
//
// Sair da empresa é o que tira o cadastro dessa conta: o vínculo some, e os
// perfis de editor e videomaker ligados a ele ficam inativos aqui (a
// identificação também os conta). Pedidos, comentários e histórico continuam,
// com o nome da pessoa — é o que impede apagar o cadastro de vez.

import type { Prisma } from "@prisma/client"

type Tx = Prisma.TransactionClient

export async function removerDaEmpresa(tx: Tx, alvo: {
  usuarioId: string
  organizacaoId: string
  /** Só quando esta é a única empresa da pessoa: aí a conta para de entrar no sistema. */
  inativarConta: boolean
}) {
  const { usuarioId, organizacaoId } = alvo
  // Antes de tudo: com RLS, `usuarios` só aparece por vínculo com a empresa
  // declarada. Depois que o vínculo sai, este update não acharia mais a pessoa.
  if (alvo.inativarConta) {
    await tx.usuario.update({ where: { id: usuarioId }, data: { status: "inativo" } })
  }
  await tx.editorOrganizacao.updateMany({
    where: { organizacaoId, editor: { usuarioId } },
    data: { status: "inativo" },
  })
  await tx.videomakerOrganizacao.updateMany({
    where: { organizacaoId, videomaker: { usuarioId } },
    data: { status: "inativo" },
  })
  // Permissão é por empresa. Se a pessoa voltar, entra pelo preset do papel
  // novo, e não por uma exceção esquecida de quando saiu.
  await tx.permissaoUsuario.deleteMany({ where: { usuarioId, organizacaoId } })
  await tx.usuarioOrganizacao.delete({ where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } } })
}
