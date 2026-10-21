import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { requireSuperAdmin } from "@/lib/org"
import { prismaAdmin } from "@/lib/prisma-admin"
import { sendEmailNotificacao } from "@/lib/email"

// Contestações da rede (Política de Avaliações, seção 5). Quem decide é a
// Plataforma: manter a nota ou remover. Em análise, a nota já está fora da
// média (função score_rede); removida, sai de vez e some da lista da empresa,
// mas fica guardada com acesso restrito (seção 8).
//
// Só o superadmin, pela conexão administrativa: a tabela não tem política para
// o role da aplicação.

const incluir = {
  avaliacaoVideomaker: {
    select: {
      id: true, nota: true, comentario: true, createdAt: true, avaliadorId: true, removidaEm: true,
      organizacao: { select: { nome: true } },
      videomaker: { select: { id: true, nome: true, email: true } },
    },
  },
  avaliacaoEditor: {
    select: {
      id: true, nota: true, comentario: true, createdAt: true, avaliadorId: true, removidaEm: true,
      organizacao: { select: { nome: true } },
      editor: { select: { id: true, nome: true, email: true } },
    },
  },
} as const

export async function GET() {
  const guard = await requireSuperAdmin(await auth())
  if (guard instanceof NextResponse) return guard

  const linhas = await prismaAdmin.contestacaoAvaliacao.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 200,
    include: incluir,
  })
  const contestacoes = linhas.map(c => {
    const av = c.avaliacaoVideomaker ?? c.avaliacaoEditor
    const prof = c.avaliacaoVideomaker?.videomaker ?? c.avaliacaoEditor?.editor
    return {
      id: c.id, status: c.status, motivo: c.motivo, decisao: c.decisao, decididoEm: c.decididoEm, createdAt: c.createdAt,
      tipo: c.avaliacaoVideomaker ? "videomaker" : "editor",
      profissional: prof?.nome ?? "—",
      avaliacao: av ? { nota: av.nota, comentario: av.comentario, createdAt: av.createdAt, empresa: av.organizacao?.nome ?? null } : null,
    }
  })
  // Em análise primeiro (mais antiga no topo); depois as decididas, mais recentes.
  contestacoes.sort((a, b) => {
    if ((a.status === "em_analise") !== (b.status === "em_analise")) return a.status === "em_analise" ? -1 : 1
    return a.status === "em_analise"
      ? +new Date(a.createdAt) - +new Date(b.createdAt)
      : +new Date(b.decididoEm ?? b.createdAt) - +new Date(a.decididoEm ?? a.createdAt)
  })
  return NextResponse.json({ contestacoes })
}

const schema = z.object({
  id: z.string().min(1).max(64),
  decisao: z.enum(["mantida", "removida"]),
  motivo: z.string().trim().min(10, "Escreva o motivo da decisão em pelo menos 10 caracteres.").max(1000),
})

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(await auth())
  if (guard instanceof NextResponse) return guard

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Pedido inválido." }, { status: 400 })
  const { id, decisao, motivo } = parsed.data

  const resultado = await prismaAdmin.$transaction(async tx => {
    const feita = await tx.contestacaoAvaliacao.updateMany({
      where: { id, status: "em_analise" },
      data: { status: decisao, decisao: motivo, decididoPorId: guard.usuarioId, decididoEm: new Date() },
    })
    if (feita.count === 0) return null
    const c = await tx.contestacaoAvaliacao.findUniqueOrThrow({ where: { id }, include: incluir })
    if (decisao === "removida") {
      if (c.avaliacaoVideomakerId) await tx.avaliacaoVideomaker.update({ where: { id: c.avaliacaoVideomakerId }, data: { removidaEm: new Date() } })
      if (c.avaliacaoEditorId) await tx.avaliacaoEditor.update({ where: { id: c.avaliacaoEditorId }, data: { removidaEm: new Date() } })
    }
    // A nota volta para a média (mantida) ou sai de vez (removida).
    if (c.avaliacaoVideomaker) await tx.$queryRaw`SELECT public.recalcular_media_videomaker(${c.avaliacaoVideomaker.videomaker.id})`
    if (c.avaliacaoEditor) await tx.$queryRaw`SELECT public.recalcular_media_editor(${c.avaliacaoEditor.editor.id})`
    return c
  })
  if (!resultado) return NextResponse.json({ error: "Esta contestação já foi decidida." }, { status: 409 })

  // A decisão é comunicada às duas partes, com o motivo (Política, seção 5, item 4).
  // O cliente que avaliou por link não deixou contato; a empresa que contratou, sim.
  const av = resultado.avaliacaoVideomaker ?? resultado.avaliacaoEditor
  const prof = resultado.avaliacaoVideomaker?.videomaker ?? resultado.avaliacaoEditor?.editor
  const texto = decisao === "removida" ? "removida da sua média" : "mantida"
  const base = process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") ?? ""
  const escapar = (t: string) => t.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string))
  const avisos: Promise<unknown>[] = []
  if (prof?.email) {
    avisos.push(sendEmailNotificacao({
      destinatario: prof.email,
      assunto: `[NuFlow] Sua contestação foi analisada: nota ${texto}`,
      evento: "contestacao-decidida",
      html: `<p>Olá, ${escapar(prof.nome)}.</p><p>A NuFlow analisou sua contestação da nota ${av?.nota ?? ""} e a decisão foi: <strong>nota ${texto}</strong>.</p><p>Motivo: ${escapar(motivo)}</p><p>Se discordar, você pode pedir uma segunda análise, uma vez, em até 5 dias úteis${base ? `, em <a href="${base}/minhas-avaliacoes">Minhas avaliações</a>` : ""}.</p>`,
    }))
  }
  if (av?.avaliadorId) {
    const avaliador = await prismaAdmin.usuario.findUnique({ where: { id: av.avaliadorId }, select: { email: true, nome: true } })
    if (avaliador?.email) {
      avisos.push(sendEmailNotificacao({
        destinatario: avaliador.email,
        assunto: `[NuFlow] Contestação de uma avaliação da sua empresa: nota ${decisao === "removida" ? "removida" : "mantida"}`,
        evento: "contestacao-decidida",
        html: `<p>Olá, ${escapar(avaliador.nome)}.</p><p>O profissional ${escapar(prof?.nome ?? "")} contestou a nota ${av.nota} que você deu. A NuFlow analisou e a decisão foi: <strong>nota ${decisao === "removida" ? "removida" : "mantida"}</strong>.</p><p>Motivo: ${escapar(motivo)}</p><p>Se discordar, fale com a NuFlow em até 5 dias úteis para pedir uma segunda análise.</p>`,
      }))
    }
  }
  await Promise.allSettled(avisos)

  return NextResponse.json({ ok: true })
}
