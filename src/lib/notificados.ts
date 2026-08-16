// Quem recebe os avisos da operação no WhatsApp.
//
// Existe porque a mesma regra estava copiada em 16 lugares, cada um com uma
// variação: uns filtravam `telefone: { not: null }`, outros não; uns escopavam
// por organização, outros esqueciam. Uma pessoa marcada para "receber tudo"
// receberia de alguns pontos e não de outros — o pior tipo de meio-funcionando.
//
// A regra tem duas portas, e as duas continuam valendo:
//   1. cargo  — admin e gestor recebem, como sempre foi
//   2. escolha — quem tem `recebeTodosAvisos` marcado, seja qual for o cargo
//
// A segunda existe para desamarrar "acompanhar a operação" de "ter acesso total
// ao sistema": antes, para alguém receber os avisos, precisava virar gestor.

import { prisma } from "@/lib/prisma"
import type { TipoUsuario } from "@prisma/client"

export interface DestinatarioAviso {
  id: string
  nome: string
  telefone: string
}

/**
 * Pessoas ativas da organização que recebem todo aviso, com telefone cadastrado.
 *
 * Sem telefone não há como avisar por WhatsApp — quem está nessa situação é
 * omitido aqui em vez de virar uma tentativa de envio que falha depois.
 */
export async function quemRecebeTudo(
  organizacaoId: string | null | undefined
): Promise<DestinatarioAviso[]> {
  const porCargo = { tipo: { in: ["admin", "gestor"] as TipoUsuario[] } }

  const pessoas = await prisma.usuario.findMany({
    where: {
      status: "ativo",
      telefone: { not: null },
      // Sem organização resolvida, cai no filtro antigo puro (só cargo, sem
      // escopo). A porta 2 mora na membership e por isso exige a org — e este
      // caminho sem org existe apenas para não mudar comportamento onde o
      // chamador ainda não tem a organização em mãos.
      ...(organizacaoId
        ? {
            OR: [
              // Porta 1 — exatamente o filtro que os pontos já usavam: o cargo
              // global em `Usuario.tipo`. Mantido assim de propósito; trocar
              // pelo `papel` da membership mudaria em silêncio quem recebe.
              { ...porCargo, organizacoes: { some: { organizacaoId } } },
              // Porta 2 — a escolha explícita, independente de cargo.
              { organizacoes: { some: { organizacaoId, recebeTodosAvisos: true } } },
            ],
          }
        : porCargo),
    },
    select: { id: true, nome: true, telefone: true },
  }).catch(() => [])

  // O `telefone: { not: null }` do where já garante isto no banco; o filtro
  // aqui é o que convence o TypeScript e cobre string vazia, que passa pelo
  // NOT NULL e não serve para enviar nada.
  return pessoas.flatMap((p) => (p.telefone?.trim() ? [{ ...p, telefone: p.telefone }] : []))
}

/** Só os telefones — atalho para os pontos que não precisam de nome nem id. */
export async function telefonesQueRecebemTudo(organizacaoId: string): Promise<string[]> {
  return (await quemRecebeTudo(organizacaoId)).map((p) => p.telefone)
}
