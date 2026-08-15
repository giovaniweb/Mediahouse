import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { equipesDaPessoa, funcaoDaPessoa, nivelDoPapel } from "@/lib/pessoas-vocabulario"

// GET /api/equipes — as equipes com membros, líder e carga agregada.
//
// Deliberadamente SEM migration nesta fase: as equipes são derivadas de `areas`,
// que já existe na membership. Isso entrega a aba Equipes hoje, sem tocar em
// dado nenhum.
//
// A tabela própria de Equipe só passa a valer a pena quando for preciso ter
// equipe fora das três áreas atuais (Comercial, Financeiro, Operações) ou líder
// por equipe. Enquanto a resposta continuar sendo "Audiovisual, Growth,
// Eventos", uma tabela nova só acrescentaria uma segunda fonte da verdade — que
// é exatamente o problema que esta reestruturação veio resolver.
//
// A carga usa o mesmo critério de /equipe e do painel da pessoa: demanda não
// finalizada. Três telas, um número.

export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const membros = await prisma.usuarioOrganizacao.findMany({
    where: { organizacaoId, usuario: { status: "ativo" } },
    select: {
      papel: true, areas: true, liderAudiovisual: true, funcaoProfissional: true,
      usuario: {
        select: {
          id: true, nome: true, avatarUrl: true,
          editorRef: { select: { id: true, cargaLimite: true } },
          videomakerRef: { select: { id: true } },
          designerRef: { select: { id: true } },
        },
      },
    },
  })

  // Carga por pessoa numa consulta só — evita N+1 ao montar cada equipe.
  const emAndamentoPorPessoa = new Map<string, number>()
  const abertas = await prisma.demanda.findMany({
    where: { organizacaoId, statusVisivel: { notIn: ["finalizado"] } },
    select: {
      editorId: true, videomakerId: true, responsavelId: true,
      responsaveis: { select: { usuarioId: true } },
      editor: { select: { usuarioId: true } },
      videomaker: { select: { usuarioId: true } },
    },
  })
  for (const d of abertas) {
    const envolvidos = new Set<string>()
    if (d.responsavelId) envolvidos.add(d.responsavelId)
    for (const r of d.responsaveis) envolvidos.add(r.usuarioId)
    if (d.editor?.usuarioId) envolvidos.add(d.editor.usuarioId)
    if (d.videomaker?.usuarioId) envolvidos.add(d.videomaker.usuarioId)
    for (const id of envolvidos) {
      emAndamentoPorPessoa.set(id, (emAndamentoPorPessoa.get(id) ?? 0) + 1)
    }
  }

  const porEquipe = new Map<string, {
    nome: string
    membros: { id: string; nome: string; funcao: string; lider: boolean; capacidade: number | null; emAndamento: number }[]
  }>()

  for (const m of membros) {
    const u = m.usuario
    if (!u) continue
    const equipes = equipesDaPessoa(m.areas)
    // Quem não tem área declarada não some: cai num agrupamento explícito, em
    // vez de desaparecer como acontecia na partição por tipo.
    const alvos = equipes.length > 0 ? equipes : ["Sem equipe"]

    for (const nome of alvos) {
      if (!porEquipe.has(nome)) porEquipe.set(nome, { nome, membros: [] })
      porEquipe.get(nome)!.membros.push({
        id: u.id,
        nome: u.nome,
        funcao: funcaoDaPessoa(m.funcaoProfissional, {
          videomaker: !!u.videomakerRef, editor: !!u.editorRef, designer: !!u.designerRef,
        }),
        lider: m.liderAudiovisual || nivelDoPapel(m.papel, m.liderAudiovisual) === "supervisor",
        capacidade: u.editorRef?.cargaLimite ?? null,
        emAndamento: emAndamentoPorPessoa.get(u.id) ?? 0,
      })
    }
  }

  const equipes = Array.from(porEquipe.values())
    .map((e) => {
      const comCapacidade = e.membros.filter((m) => m.capacidade !== null)
      const capacidadeTotal = comCapacidade.reduce((s, m) => s + (m.capacidade ?? 0), 0)
      const emAndamento = e.membros.reduce((s, m) => s + m.emAndamento, 0)
      return {
        nome: e.nome,
        totalMembros: e.membros.length,
        lideres: e.membros.filter((m) => m.lider).map((m) => m.nome),
        capacidadeTotal: comCapacidade.length > 0 ? capacidadeTotal : null,
        emAndamento,
        sobrecarregados: e.membros.filter((m) => m.capacidade !== null && m.emAndamento > m.capacidade).length,
        membros: e.membros.sort((a, b) => Number(b.lider) - Number(a.lider) || a.nome.localeCompare(b.nome)),
      }
    })
    .sort((a, b) => b.totalMembros - a.totalMembros)

  return NextResponse.json({ equipes })
}
