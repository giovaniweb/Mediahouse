// Quem usa o app de campo numa cobertura (/campo): a gestão das coberturas
// ("Ver Coberturas") ou quem está ESCALADO nela — videomaker externo, editor ou
// pessoa da equipe. Achado do Vercel Agent no PR #161: depois da auditoria de
// 18/11/2026 as rotas do campo pediam só "Ver Coberturas", que o videomaker
// externo não tem, e quem estava escalado no evento não conseguia subir nada.
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"

export type AcessoDeCampo = {
  organizacaoId: string
  usuarioId: string
  /** Tem "Ver Coberturas": vale para qualquer membro da equipe da cobertura. */
  gestao: boolean
  /** As linhas da equipe desta cobertura que são da pessoa (vazio para a gestão). */
  membros: string[]
}

/** Linhas da equipe de `coberturaId` que são de `usuarioId` (direto, como videomaker ou como editor). */
export async function membrosDaPessoa(coberturaId: string, usuarioId: string): Promise<string[]> {
  const linhas = await prisma.eventoCoberturaEquipe.findMany({
    where: { coberturaId, OR: [{ usuarioId }, { videomaker: { usuarioId } }, { editor: { usuarioId } }] },
    select: { id: true },
  })
  return linhas.map((l) => l.id)
}

/**
 * Sessão com vínculo na empresa ativa, cobertura desta empresa (404 fora dela)
 * e, nela, a gestão das coberturas ou alguém escalado (403 para o resto).
 */
export async function acessoDeCampo(coberturaId: string): Promise<AcessoDeCampo | NextResponse> {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  const c = await prisma.eventoCobertura.findFirst({ where: { id: coberturaId, organizacaoId: acesso.organizacaoId }, select: { id: true } })
  if (!c) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  const base = { organizacaoId: acesso.organizacaoId, usuarioId: acesso.usuarioId }
  if (acesso.permissoes.verCoberturas) return { ...base, gestao: true, membros: [] }
  const membros = await membrosDaPessoa(coberturaId, acesso.usuarioId)
  if (!membros.length) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  return { ...base, gestao: false, membros }
}
