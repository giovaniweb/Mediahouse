import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { correlacaoAuditoria, registrarAuditoria } from "@/lib/auditoria"
import { erroDeZod } from "@/lib/erros-api"
import { LISTA_CATEGORIAS } from "@/lib/avisos-categorias"
import { lerPreferencias, pessoasConfiguraveis, salvarPreferencias } from "@/lib/preferencias-aviso-gestao"

// Avisos por pessoa (12/11/2026). A gestão (gerenciarUsuarios) escolhe, pessoa
// por pessoa, quais avisos ela recebe; a própria pessoa ajusta os dela, menos o
// que a gestão travou. Fica na Auditoria quem mudou o quê de quem.

const semCache = { "Cache-Control": "no-store" }

export async function GET(req: NextRequest) {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  const { organizacaoId, usuarioId, permissoes } = acesso
  const gestao = !!permissoes.gerenciarUsuarios
  const pedido = req.nextUrl.searchParams.get("usuarioId")
  const alvo = pedido && pedido !== usuarioId ? pedido : usuarioId
  if (alvo !== usuarioId && !gestao) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  const r = await comOrg(organizacaoId, () => prisma.$transaction(async (tx) => {
    const pessoa = await tx.usuarioOrganizacao.findFirst({
      where: { organizacaoId, usuarioId: alvo, usuario: { status: "ativo" } },
      select: { papel: true, areas: true, usuario: { select: { id: true, nome: true } } },
    })
    if (!pessoa) return null
    return {
      pessoa: { id: pessoa.usuario.id, nome: pessoa.usuario.nome.trim(), papel: pessoa.papel, areas: pessoa.areas },
      estado: await lerPreferencias(tx, organizacaoId, alvo),
      comoGestao: gestao,
      pessoas: gestao ? await pessoasConfiguraveis(tx, organizacaoId) : [],
    }
  }))
  if (!r) return NextResponse.json({ error: "Pessoa não encontrada nesta empresa." }, { status: 404 })
  return NextResponse.json(r, { headers: semCache })
}

const estadoSchema = z.object({
  categoria: z.enum(LISTA_CATEGORIAS as [string, ...string[]]),
  sino: z.boolean(), email: z.boolean(), whatsapp: z.boolean(),
  recorte: z.enum(["tudo", "setor", "meus", "pedi"]), setor: z.enum(["audiovisual", "growth"]).nullable().default(null),
  travada: z.boolean(),
}).strict()
const salvarSchema = z.object({
  usuarioId: z.string().min(1).max(128),
  categorias: z.array(estadoSchema).max(LISTA_CATEGORIAS.length),
}).strict()

export async function PUT(req: NextRequest) {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  const body = salvarSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) return erroDeZod(body.error)
  const { organizacaoId, usuarioId, permissoes } = acesso
  const alvo = body.data.usuarioId
  const comoGestao = !!permissoes.gerenciarUsuarios
  if (alvo !== usuarioId && !comoGestao) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  const r = await comOrg(organizacaoId, () => prisma.$transaction(async (tx) => {
    const s = await salvarPreferencias(tx, organizacaoId, alvo, usuarioId, comoGestao,
      body.data.categorias as Parameters<typeof salvarPreferencias>[5])
    if (s.ok && s.alteradas) {
      await registrarAuditoria(tx, { organizacaoId, usuarioId }, {
        acao: "avisos.preferencias", recurso: "usuario", recursoId: alvo, correlationId: correlacaoAuditoria(),
        depois: { alterados: s.alteradas },
      })
    }
    return s.ok ? { ...s, estado: await lerPreferencias(tx, organizacaoId, alvo) } : s
  }))
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 404 })
  return NextResponse.json(r, { headers: semCache })
}
