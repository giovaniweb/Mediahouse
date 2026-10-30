// Tirar uma pessoa de UMA empresa sem apagar o que ela deixou.
//
// Existe por causa do WhatsApp. A identificação do número
// (lib/whatsapp-identidade.ts) recusa o envio quando o número aparece em mais
// de um cadastro da empresa ou num cadastro inativo dela. Desativar ou mesclar
// deixava o cadastro velho com o mesmo número da pessoa que ficou, e todo aviso
// para ela era descartado sem erro nenhum: o João (editor) passou de 03/10 a
// 30/10/2026 sem receber uma mensagem, e outras cinco pessoas também.
//
// O vínculo com a empresa NÃO sai quando esta é a única empresa da pessoa. Com
// RLS, `usuarios` só aparece por vínculo com a empresa declarada: sem ele, o
// nome some dos pedidos e comentários antigos, e o comentário (autor
// obrigatório) quebra a consulta inteira. Então a conta é inativada e o
// WhatsApp sai deste cadastro — é o número que travava o outro.
//
// Quem também está em outra empresa só perde o vínculo daqui: a conta e o
// telefone são dela nas outras, e esta empresa não pode mexer neles.
//
// Nos dois casos, os perfis de editor e videomaker ligados ficam inativos aqui
// (a identificação também os conta) e as permissões desta empresa saem.

import type { Prisma } from "@prisma/client"

type Tx = Prisma.TransactionClient

export async function removerDaEmpresa(tx: Tx, alvo: {
  usuarioId: string
  organizacaoId: string
  /** A pessoa não está em nenhuma outra empresa. */
  soNestaEmpresa: boolean
}) {
  const { usuarioId, organizacaoId } = alvo
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
  if (alvo.soNestaEmpresa) {
    await tx.usuario.update({ where: { id: usuarioId }, data: { status: "inativo", telefone: null } })
  } else {
    await tx.usuarioOrganizacao.delete({ where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } } })
  }
}
