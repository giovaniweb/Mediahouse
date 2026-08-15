import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { filtroMinhasDemandas } from "@/lib/escopo-demanda"
import { EVENTO_EDICAO, EVENTO_RESPONSAVEL } from "@/lib/status"
import { vinculoDaCategoria, nivelDoPapel, funcaoDaPessoa, equipesDaPessoa } from "@/lib/pessoas-vocabulario"

// GET /api/pessoas/[id] — tudo sobre uma pessoa, num lugar só.
//
// Existe porque hoje a mesma pessoa é vista em três telas diferentes: dados e
// acesso em /usuarios, carga em /equipe, ficha profissional em /videomakers.
// Quem quer saber "quem é essa pessoa e o que ela pode fazer" precisa abrir três
// abas e cruzar na cabeça.
//
// A carga reusa exatamente o critério de /equipe — demanda não finalizada — para
// os números não divergirem entre as telas, que foi o problema que originou toda
// esta reestruturação.

export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params

  const membro = await prisma.usuarioOrganizacao.findFirst({
    where: { usuarioId: id, organizacaoId },
    select: {
      papel: true, categoria: true, liderAudiovisual: true,
      funcaoProfissional: true, areas: true, createdAt: true,
      usuario: {
        select: {
          id: true, nome: true, email: true, telefone: true, tipo: true,
          status: true, avatarUrl: true, createdAt: true,
          videomakerRef: { select: { id: true, cidade: true, estado: true, tipoContrato: true, habilidades: true, avaliacao: true } },
          editorRef: { select: { id: true, cargaLimite: true, especialidade: true, tipoContrato: true } },
          designerRef: { select: { id: true } },
        },
      },
    },
  })

  if (!membro?.usuario) return NextResponse.json({ error: "Pessoa não encontrada" }, { status: 404 })
  const u = membro.usuario

  // Carga: mesmo critério de /equipe (não finalizada), para não criar um terceiro
  // número para a mesma pergunta.
  const escopo = await filtroMinhasDemandas(u.id, organizacaoId)
  const agora = new Date()

  const [emAndamento, atrasadas, concluidas, permissoes, historico] = await Promise.all([
    prisma.demanda.count({ where: { AND: [escopo, { organizacaoId, statusVisivel: { notIn: ["finalizado"] } }] } }),
    prisma.demanda.count({
      where: { AND: [escopo, { organizacaoId, statusVisivel: { notIn: ["finalizado"] }, dataLimite: { lt: agora } }] },
    }),
    prisma.demanda.count({ where: { AND: [escopo, { organizacaoId, statusVisivel: "finalizado" }] } }),
    prisma.permissaoUsuario.findFirst({ where: { usuarioId: u.id, organizacaoId } }),
    prisma.historicoStatus.findMany({
      where: { usuarioId: u.id, demanda: { organizacaoId } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, statusAnterior: true, statusNovo: true, observacao: true,
        origem: true, createdAt: true,
        demanda: { select: { id: true, codigo: true, titulo: true } },
      },
    }),
  ])

  const capacidadeTotal = u.editorRef?.cargaLimite ?? null

  return NextResponse.json({
    pessoa: {
      id: u.id,
      nome: u.nome,
      email: u.email,
      telefone: u.telefone,
      avatarUrl: u.avatarUrl,
      status: u.status,
      criadoEm: u.createdAt,
      entrouNaOrgEm: membro.createdAt,
      funcao: funcaoDaPessoa(membro.funcaoProfissional, {
        videomaker: !!u.videomakerRef, editor: !!u.editorRef, designer: !!u.designerRef,
      }),
      equipes: equipesDaPessoa(membro.areas),
      vinculo: vinculoDaCategoria(membro.categoria),
      nivel: nivelDoPapel(membro.papel, membro.liderAudiovisual),
      perfilAcesso: membro.papel,
      liderAudiovisual: membro.liderAudiovisual,
      localizacao: [u.videomakerRef?.cidade, u.videomakerRef?.estado].filter(Boolean).join(", ") || null,
      capacidades: {
        captacao: !!u.videomakerRef,
        edicao: !!u.editorRef,
        design: !!u.designerRef,
      },
      fichas: {
        videomakerId: u.videomakerRef?.id ?? null,
        editorId: u.editorRef?.id ?? null,
        designerId: u.designerRef?.id ?? null,
        habilidades: u.videomakerRef?.habilidades ?? [],
        especialidade: u.editorRef?.especialidade ?? null,
        avaliacao: u.videomakerRef?.avaliacao ?? null,
      },
    },
    carga: {
      capacidadeTotal,
      emAndamento,
      disponivel: capacidadeTotal !== null ? Math.max(0, capacidadeTotal - emAndamento) : null,
      atrasadas,
      concluidas,
    },
    permissoes: permissoes ?? null,
    historico: historico.map((h) => ({
      id: h.id,
      quando: h.createdAt,
      origem: h.origem,
      demanda: h.demanda,
      texto: h.observacao
        ?? (h.statusNovo === EVENTO_EDICAO ? "Editou a demanda"
          : h.statusNovo === EVENTO_RESPONSAVEL ? "Alterou o responsável"
          : `Moveu para ${h.statusNovo}`),
    })),
  })
}
