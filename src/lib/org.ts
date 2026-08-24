// Helpers de isolamento por organização (SaaS multiempresa — Fase 1).
// Padrão de uso numa rota autenticada:
//   const session = await auth()
//   const organizacaoId = await getOrgId(session)
//   if (!organizacaoId) return semOrg()
//   ...prisma.x.findMany({ where: { organizacaoId } })
//   ...ownership: if (!pertenceAOrg(record, organizacaoId)) return NextResponse.json(..., { status: 404 })
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Session } from "next-auth"

type SessionUser = { id?: string; organizacaoId?: string | null }
// Tipo estrutural mínimo aceito — cobre tanto a Session do NextAuth quanto os
// SessionLike narrowados (ex.: requireEventoAccess) que só carregam user.id.
type SessionShape = { user?: SessionUser | { id: string; tipo?: string } } | null | undefined

/** Cookie com a organização ativa. É um PALPITE do cliente — sempre revalidado. */
export const COOKIE_ORG_ATIVA = "org_ativa"

/**
 * Resolve a organização ativa da sessão.
 *
 * Ordem: cookie escolhido pela pessoa → organização do token → primeira
 * membership (token antigo, evita forçar re-login).
 *
 * Por que o cookie e não o JWT: o `jwt` callback vive em `auth.config.ts`, que é
 * edge-safe e não pode falar com o Prisma — não daria para validar a membership
 * lá dentro. Aqui, do lado Node, o cookie é só o palpite: quem decide é a
 * consulta abaixo. Cookie forjado, membership removida ou empresa de outra
 * pessoa simplesmente não casa, e a resolução cai no padrão.
 *
 * Antes disto, quem tivesse duas empresas ficava preso na mais antiga por
 * `createdAt` — não havia como entrar na segunda.
 */
export async function getOrgId(session: SessionShape): Promise<string | null> {
  const u = session?.user as SessionUser | undefined
  if (!u) return null

  if (u.id) {
    const escolhida = await organizacaoEscolhida()
    if (escolhida) {
      // A autoridade é o banco: só vale se a pessoa for MESMO membro dela.
      const m = await prisma.usuarioOrganizacao.findUnique({
        where: { usuarioId_organizacaoId: { usuarioId: u.id, organizacaoId: escolhida } },
        select: { organizacaoId: true },
      })
      if (m) return m.organizacaoId
    }
  }

  if (u.organizacaoId) return u.organizacaoId
  if (!u.id) return null
  const m = await prisma.usuarioOrganizacao.findFirst({
    where: { usuarioId: u.id },
    orderBy: { createdAt: "asc" },
    select: { organizacaoId: true },
  })
  return m?.organizacaoId ?? null
}

/**
 * Lê o cookie da organização ativa. Fora de um contexto de requisição (cron,
 * job em segundo plano) `cookies()` lança — ali não há escolha de ninguém para
 * respeitar, e o retorno nulo faz a resolução seguir pelo caminho normal.
 */
async function organizacaoEscolhida(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers")
    return (await cookies()).get(COOKIE_ORG_ATIVA)?.value?.trim() || null
  } catch {
    return null
  }
}

/**
 * Organização que recebe tráfego público sem `?org=`.
 *
 * Deixou de ser "contourline" cravado no código: agora é `ORG_PUBLICA_PADRAO`.
 * A diferença importa quando existe uma segunda empresa — sem isso, todo link
 * público sem slug continuaria caindo na primeira, para sempre.
 *
 * Por que ainda existe um padrão em vez de 404: nenhuma página pública passa
 * `?org=` hoje, então exigir o slug tiraria do ar os formulários que já estão
 * em uso. A propagação do slug nas páginas é o que permite aposentá-lo.
 */
export const SLUG_ORG_PADRAO = process.env.ORG_PUBLICA_PADRAO || "contourline"

// Resolve a organização de uma rota PÚBLICA (sem sessão) a partir de `?org=<slug>`.
// Sem slug, cai na SLUG_ORG_PADRAO. O ponto é nunca consultar sem organização
// nenhuma, que era o que fazia as vitrines públicas agregarem dados de todas as
// empresas.
export async function orgPublica(slug: string | null | undefined): Promise<string | null> {
  const alvo = slug?.trim() || SLUG_ORG_PADRAO
  if (!slug?.trim()) {
    console.warn(`[org] rota pública sem ?org= — usando o padrão "${SLUG_ORG_PADRAO}".`)
  }
  const org = await prisma.organizacao.findUnique({
    where: { slug: alvo },
    select: { id: true, ativo: true },
  })
  return org?.ativo ? org.id : null
}

// Resposta padrão quando a sessão não tem organização resolvível.
export function semOrg() {
  return NextResponse.json({ error: "Organização não encontrada na sessão" }, { status: 403 })
}

// Gate de super-admin (gestão global de organizações). Resolve via DB (a flag não
// vive no token), então funciona mesmo com tokens antigos. Retorna o userId se for
// super-admin, ou um NextResponse 401/403 para a rota devolver direto.
export async function requireSuperAdmin(
  session: SessionShape
): Promise<{ usuarioId: string } | NextResponse> {
  const u = session?.user as SessionUser | undefined
  if (!u?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const usuario = await prisma.usuario.findUnique({ where: { id: u.id }, select: { superAdmin: true } })
  if (!usuario?.superAdmin) return NextResponse.json({ error: "Requer super-admin" }, { status: 403 })
  return { usuarioId: u.id }
}

// Verifica se um registro pertence à organização ativa (defesa contra acesso por ID direto).
export function pertenceAOrg(
  record: { organizacaoId?: string | null } | null | undefined,
  organizacaoId: string
): boolean {
  if (!record) return false
  return record.organizacaoId === organizacaoId
}

// Ownership compartilhado de demanda: resolve a org da sessão e garante que a demanda
// pertence a ela. Retorna { organizacaoId } se ok, ou um NextResponse (403/404) para
// a rota devolver direto. Uso:
//   const guard = await requireDemandaOrg(session, id)
//   if (guard instanceof NextResponse) return guard
//   const { organizacaoId } = guard
export async function requireDemandaOrg(
  session: Session | null,
  demandaId: string
): Promise<{ organizacaoId: string } | NextResponse> {
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const d = await prisma.demanda.findUnique({ where: { id: demandaId }, select: { organizacaoId: true } })
  if (!pertenceAOrg(d, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  return { organizacaoId }
}

// Ownership de EventoCobertura. As sub-rotas (uploads, equipe, checklist) recebem
// o coberturaId pela URL e operavam nele sem verificar dono — bastava trocar o id
// para listar ou apagar material de cobertura de outra empresa.
export async function requireCoberturaOrg(
  session: SessionShape,
  coberturaId: string
): Promise<{ organizacaoId: string } | NextResponse> {
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const c = await prisma.eventoCobertura.findUnique({
    where: { id: coberturaId },
    select: { organizacaoId: true },
  })
  if (!pertenceAOrg(c, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  return { organizacaoId }
}

// Ownership compartilhado de EventoGestao (módulo de eventos). Mesmo padrão de requireDemandaOrg.
export async function requireEventoGestaoOrg(
  session: SessionShape,
  eventoId: string
): Promise<{ organizacaoId: string } | NextResponse> {
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const e = await prisma.eventoGestao.findUnique({ where: { id: eventoId }, select: { organizacaoId: true } })
  if (!pertenceAOrg(e, organizacaoId)) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
  return { organizacaoId }
}
