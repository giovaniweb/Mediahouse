// Quem pode ler e quem pode alterar custos de videomaker (02/10/2026).
//
// Até aqui as rotas de custos conferiam só sessão e empresa: qualquer membro —
// solicitante, videomaker — listava CPF/CNPJ e PIX de todos os profissionais e
// podia criar, marcar como pago ou apagar um lançamento por chamada direta. O
// menu esconder a página não protegia nada.
//
// Leitura: `verCustos` ou `verAprovacoes`. A tela de Aprovações lista as notas
// enviadas para quem aprova; quem não tem `verCustos` recebe a lista sem diária
// e sem os dados fiscais do profissional.
// Escrita: `verCustos` e papel admin/gestor NO VÍNCULO desta empresa — a mesma
// regra da branch de melhorias, para a integração não mudar o comportamento de
// novo.
//
// A rota chama `auth()` e passa a sessão: o teste rota-sem-sessao reconhece rota
// autenticada por esse `await auth()` no próprio arquivo.
import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { getOrgId, semOrg } from "@/lib/org"
import { permissoesEfetivas } from "@/lib/permissoes-server"

export type AcessoCustos = { usuarioId: string; organizacaoId: string; verCustos: boolean }

export async function acessoCustos(
  session: Session | null,
  modo: "ler" | "escrever"
): Promise<AcessoCustos | NextResponse> {
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  const verCustos = !!vinculo?.permissoes.verCustos
  const permitido = modo === "ler"
    ? verCustos || !!vinculo?.permissoes.verAprovacoes
    : verCustos && (vinculo?.papel === "admin" || vinculo?.papel === "gestor")
  if (!permitido) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

  return { usuarioId: session.user.id, organizacaoId, verCustos }
}
