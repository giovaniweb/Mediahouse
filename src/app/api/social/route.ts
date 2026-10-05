import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { escopoSocial } from "@/lib/social"
import { TAG_SOLICITACAO } from "@/lib/social-quadro"

// GET /api/social — o quadro da social media: as ideias das linhas dela e, das
// que já viraram pedido, onde o pedido está. Gestor e admin recebem todas as
// linhas, só para ver.
//
// O que já foi entregue há mais de 30 dias sai do quadro: "Pronto" é para
// lembrar de postar, não um arquivo.
const DIAS_NO_PRONTO = 30

export async function GET() {
  const session = await auth()
  const escopo = await escopoSocial(session)
  if (escopo instanceof NextResponse) return escopo
  const { organizacaoId, usuarioId, veTodas, linhas, minhas } = escopo

  const corte = new Date(Date.now() - DIAS_NO_PRONTO * 86_400_000)
  const ideias = linhas.length === 0 ? [] : await prisma.ideiaVideo.findMany({
    where: {
      organizacaoId,
      linhaProjetoId: { in: linhas.map((l) => l.id) },
      status: { notIn: ["descartada", "rascunho"] },
      OR: [
        { demandaId: null },
        { demanda: { finalizadaEm: null } },
        { demanda: { finalizadaEm: { gte: corte } } },
      ],
    },
    select: {
      id: true, titulo: true, descricao: true, linkReferencia: true, area: true,
      dataPostagem: true, linhaProjetoId: true, createdAt: true, formulario: true,
      origem: true, enviadoPor: true, tags: true, usuarioId: true,
      usuario: { select: { nome: true } },
      demanda: {
        select: {
          id: true, codigo: true, statusVisivel: true, statusInterno: true, prioridade: true,
          cobrancas: true, cobradoEm: true, linkPostagem: true,
          responsavel: { select: { nome: true } },
          responsaveis: { select: { usuario: { select: { nome: true } } } },
          editor: { select: { nome: true } },
          videomaker: { select: { nome: true } },
          designer: { select: { nome: true } },
          // A última mudança de etapa diz há quanto tempo o pedido está parado.
          historicos: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
          // "Revisar e aprovar" abre a aprovação que já existe (/aprovar/[token]).
          aprovacoesVideo: { where: { status: "pendente" }, orderBy: { createdAt: "desc" }, take: 1, select: { token: true } },
        },
      },
    },
    orderBy: [{ dataPostagem: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 500,
  })

  const porId = new Map(linhas.map((l) => [l.id, l]))
  const cards = ideias.map(({ demanda: d, usuario, usuarioId: autorId, origem, enviadoPor, tags, ...i }) => {
    const linha = i.linhaProjetoId ? porId.get(i.linhaProjetoId) : undefined
    return {
      ...i,
      linha: linha?.nome ?? null,
      // "Enviada por Fulano": a ideia não foi anotada pela social da linha.
      enviadaPor: origem === "publico"
        ? `${enviadoPor ?? "alguém"} (sem login)`
        : autorId && !linha?.socials.some((s) => s.usuarioId === autorId)
          ? usuario?.nome ?? enviadoPor
          : null,
      solicitacao: tags.includes(TAG_SOLICITACAO),
      podeMexer: !!i.linhaProjetoId && minhas.has(i.linhaProjetoId),
      demanda: d && {
        id: d.id, codigo: d.codigo, statusVisivel: d.statusVisivel, statusInterno: d.statusInterno,
        prioridade: d.prioridade, cobrancas: d.cobrancas, cobradoEm: d.cobradoEm, linkPostagem: d.linkPostagem,
        responsaveis: [...new Set([
          ...d.responsaveis.map((r) => r.usuario.nome), d.responsavel?.nome,
          d.videomaker?.nome, d.editor?.nome, d.designer?.nome,
        ].filter((n): n is string => !!n))],
        ultimaMudanca: d.historicos[0]?.createdAt ?? null,
        tokenAprovacao: d.aprovacoesVideo[0]?.token ?? null,
      },
    }
  })

  return NextResponse.json({
    usuarioId,
    veTodas,
    linhas: linhas.map((l) => ({ id: l.id, nome: l.nome, minha: minhas.has(l.id), socials: l.socials.map((x) => x.nome) })),
    cards,
  })
}
