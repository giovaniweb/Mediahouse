import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { escopoSocial, podeEditarLinha } from "@/lib/social"
import { TAG_SOLICITACAO } from "@/lib/social-quadro"

// GET /api/social — o quadro da social media.
//
// Duas fontes, sem duplicar:
//   1. as ideias das linhas (IdeiaVideo) e, das que viraram pedido, onde o
//      pedido está;
//   2. os pedidos que a social fez DIRETO no Audiovisual ou no Growth — antes de
//      o quadro existir, ou fora dele — e que não têm ideia ligada. Calculado na
//      leitura, sem backfill: a regra é "quem pediu foi a social da linha".
// Gestor e admin recebem todas as linhas.
//
// O que já foi entregue há mais de 30 dias sai do quadro: "Pronto" é para
// lembrar de postar, não um arquivo.
const DIAS_NO_PRONTO = 30

const SELECT_PEDIDO = {
  id: true, codigo: true, titulo: true, area: true, statusVisivel: true, statusInterno: true, prioridade: true,
  cobrancas: true, cobradoEm: true, linkPostagem: true, dataLimite: true, createdAt: true,
  socialId: true, solicitanteId: true, linhaProjetoId: true,
  linhaProjetoRef: { select: { nome: true } },
  responsavel: { select: { nome: true } },
  responsaveis: { select: { usuario: { select: { nome: true } } } },
  editor: { select: { nome: true } },
  videomaker: { select: { nome: true } },
  designer: { select: { nome: true } },
  // A última mudança de etapa diz há quanto tempo o pedido está parado.
  historicos: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
  // "Revisar e aprovar" abre a aprovação que já existe (/aprovar/[token]).
  aprovacoesVideo: { where: { status: "pendente" }, orderBy: { createdAt: "desc" }, take: 1, select: { token: true } },
} satisfies Prisma.DemandaSelect

type Pedido = Prisma.DemandaGetPayload<{ select: typeof SELECT_PEDIDO }>

function resumoDoPedido(d: Pedido) {
  return {
    id: d.id, codigo: d.codigo, statusVisivel: d.statusVisivel, statusInterno: d.statusInterno,
    prioridade: d.prioridade, cobrancas: d.cobrancas, cobradoEm: d.cobradoEm, linkPostagem: d.linkPostagem,
    responsaveis: [...new Set([
      ...d.responsaveis.map((r) => r.usuario.nome), d.responsavel?.nome,
      d.videomaker?.nome, d.editor?.nome, d.designer?.nome,
    ].filter((n): n is string => !!n))],
    ultimaMudanca: d.historicos[0]?.createdAt ?? null,
    tokenAprovacao: d.aprovacoesVideo[0]?.token ?? null,
  }
}

export async function GET() {
  const session = await auth()
  const escopo = await escopoSocial(session)
  if (escopo instanceof NextResponse) return escopo
  const { organizacaoId, usuarioId, veTodas, gestor, linhas, minhas } = escopo

  const corte = new Date(Date.now() - DIAS_NO_PRONTO * 86_400_000)
  const aindaNoQuadro: Prisma.DemandaWhereInput = {
    OR: [
      { statusVisivel: { not: "finalizado" } },
      { finalizadaEm: { gte: corte } },
      // Há concluídos antigos sem data de finalização; sem isto, cada pedido
      // velho da social ficaria em "Pronto" para sempre.
      { finalizadaEm: null, updatedAt: { gte: corte } },
    ],
    // Recusado na entrada também "termina": sai depois do mesmo prazo.
    NOT: { statusInterno: "encerrado", statusVisivel: "entrada", updatedAt: { lt: corte } },
  }

  // Quem é a social de cada linha, e de quais linhas cada social cuida.
  const linhasDaSocial = new Map<string, string[]>()
  const nomeDaSocial = new Map<string, string>()
  for (const l of linhas) for (const s of l.socials) {
    linhasDaSocial.set(s.usuarioId, [...(linhasDaSocial.get(s.usuarioId) ?? []), l.id])
    nomeDaSocial.set(s.usuarioId, s.nome)
  }
  // A social só vê os pedidos dela; quem vê tudo, os de todas as socials.
  const socialsVisiveis = veTodas ? [...linhasDaSocial.keys()] : minhas.size > 0 ? [usuarioId] : []

  const [ideias, diretos] = await Promise.all([
    linhas.length === 0 ? [] : prisma.ideiaVideo.findMany({
      where: {
        organizacaoId,
        linhaProjetoId: { in: linhas.map((l) => l.id) },
        status: { notIn: ["descartada", "rascunho"] },
        OR: [{ demandaId: null }, { demanda: aindaNoQuadro }],
      },
      select: {
        id: true, titulo: true, descricao: true, linkReferencia: true, area: true,
        dataPostagem: true, linhaProjetoId: true, createdAt: true, formulario: true,
        origem: true, enviadoPor: true, tags: true, usuarioId: true,
        usuario: { select: { nome: true } },
        demanda: { select: SELECT_PEDIDO },
      },
      orderBy: [{ dataPostagem: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 500,
    }),
    socialsVisiveis.length === 0 ? [] : prisma.demanda.findMany({
      where: {
        organizacaoId,
        ideia: null, // a que tem ideia já vem pela ideia
        AND: [
          aindaNoQuadro,
          {
            OR: [
              { solicitanteId: { in: socialsVisiveis } },
              veTodas ? { socialId: { not: null } } : { socialId: usuarioId },
            ],
          },
        ],
      },
      select: SELECT_PEDIDO,
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
  ])

  const porId = new Map(linhas.map((l) => [l.id, l]))

  const cardsDeIdeia = ideias.map(({ demanda: d, usuario, usuarioId: autorId, origem, enviadoPor, tags, ...i }) => {
    const linha = i.linhaProjetoId ? porId.get(i.linhaProjetoId) : undefined
    const autorESocial = !!autorId && !!linha?.socials.some((s) => s.usuarioId === autorId)
    const dono = d?.socialId ?? (autorESocial ? autorId : linha?.socials[0]?.usuarioId) ?? null
    return {
      ...i,
      direto: false,
      linha: linha?.nome ?? null,
      // "Enviada por Fulano": a ideia não foi anotada pela social da linha.
      enviadaPor: origem === "publico"
        ? `${enviadoPor ?? "alguém"} (sem login)`
        : autorId && !autorESocial ? usuario?.nome ?? enviadoPor : null,
      solicitacao: tags.includes(TAG_SOLICITACAO),
      socialId: dono,
      socialNome: dono ? nomeDaSocial.get(dono) ?? null : null,
      podeEditar: podeEditarLinha(escopo, i.linhaProjetoId),
      // Priorizar, cobrar e aprovar: só a social da linha.
      podeMexer: !!i.linhaProjetoId && minhas.has(i.linhaProjetoId),
      demanda: d && resumoDoPedido(d),
    }
  })

  const cardsDiretos = diretos.map((d) => {
    const dono = d.socialId ?? d.solicitanteId
    const linhasDela = linhasDaSocial.get(dono) ?? []
    // A linha é a da demanda; sem ela, a da social que pediu — se ela tiver uma
    // linha só. Com várias, fica "sem linha" e aparece no filtro.
    const linhaId = d.linhaProjetoId ?? (linhasDela.length === 1 ? linhasDela[0] : null)
    return {
      id: `d-${d.id}`,
      titulo: d.titulo,
      descricao: null,
      linkReferencia: null,
      area: d.area,
      // Pedido direto não tem data de postagem: o prazo faz esse papel no
      // quadro e no calendário.
      dataPostagem: d.dataLimite,
      linhaProjetoId: linhaId,
      createdAt: d.createdAt,
      formulario: null,
      direto: true,
      linha: linhaId ? porId.get(linhaId)?.nome ?? d.linhaProjetoRef?.nome ?? null : null,
      enviadaPor: null,
      solicitacao: false,
      socialId: dono,
      socialNome: nomeDaSocial.get(dono) ?? null,
      podeEditar: false,
      podeMexer: dono === usuarioId && minhas.size > 0,
      demanda: resumoDoPedido(d),
    }
  })

  return NextResponse.json({
    usuarioId,
    veTodas,
    podeCriar: minhas.size > 0 || gestor,
    // Para o primeiro uso: sem social ligada a linha nenhuma, o quadro não tem
    // de onde tirar nada, e quem configura precisa saber disso.
    temSocialLigada: linhasDaSocial.size > 0,
    linhas: linhas.map((l) => ({ id: l.id, nome: l.nome, minha: minhas.has(l.id), socials: l.socials.map((x) => x.nome) })),
    cards: [...cardsDeIdeia, ...cardsDiretos],
  })
}
