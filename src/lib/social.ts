// Área Social Media (/social) — o que precisa de banco.
//
// Quem vê o quê:
//   - a social media vê e mexe só nas linhas em que está (SocialLinha);
//   - gestor e admin veem todas as linhas e também anotam ideias e abrem pedidos
//     em qualquer uma (05/10, à tarde: o quadro vazio não servia para quem
//     configura). Priorizar, cobrar e aprovar continuam só da social que pediu.
//     Quem é gestor E está ligado a uma linha mexe nela por inteiro, porque ali
//     ele é a social. Quem ganhou "Ver Social Media" nas permissões sem ser
//     social também vê todas, só ver.
import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import type { AreaDemanda } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ehGestor, papelNaOrg } from "@/lib/papel"
import { getOrgId, semOrg } from "@/lib/org"
import { quemRecebeTudo } from "@/lib/notificados"
import { permissoesEfetivas } from "@/lib/permissoes-server"

export type LinhaSocial = { id: string; nome: string; socials: { usuarioId: string; nome: string }[] }

export type EscopoSocial = {
  organizacaoId: string
  usuarioId: string
  veTodas: boolean
  /** Gestor ou admin: anota ideia e abre pedido em qualquer linha. */
  gestor: boolean
  /** Linhas que aparecem para esta pessoa. */
  linhas: LinhaSocial[]
  /** Linhas em que ela é a social — onde pode mexer. */
  minhas: Set<string>
}

/** Resolve o escopo, ou devolve a resposta de erro pronta para a rota. */
export async function escopoSocial(session: Session | null): Promise<EscopoSocial | NextResponse> {
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const usuarioId = session.user.id
  const papel = papelNaOrg(session)
  const vinculo = ehGestor(session) ? null : await permissoesEfetivas(usuarioId, organizacaoId)
  const veTodas = ehGestor(session) || (!!vinculo?.permissoes.verSocial && vinculo.papel !== "social")

  // Só a ligação de quem está ativo conta: inativo continua no cadastro, mas
  // não é mais a social de linha nenhuma.
  const linhas = (await prisma.linhaProjeto.findMany({
    where: {
      organizacaoId, ativo: true,
      ...(veTodas ? {} : { socials: { some: { vinculo: { usuarioId, usuario: { status: "ativo" } } } } }),
    },
    select: {
      id: true, nome: true,
      socials: {
        where: { vinculo: { usuario: { status: "ativo" } } },
        select: { vinculo: { select: { usuarioId: true, usuario: { select: { nome: true } } } } },
      },
    },
    orderBy: { nome: "asc" },
  })).map((l) => ({
    id: l.id, nome: l.nome,
    socials: l.socials.map((s) => ({ usuarioId: s.vinculo.usuarioId, nome: s.vinculo.usuario.nome })),
  }))
  const minhas = new Set(linhas.filter((l) => l.socials.some((s) => s.usuarioId === usuarioId)).map((l) => l.id))

  // Sem linha, sem ser social e sem a permissão não há área. A social recém-
  // cadastrada passa (a tela explica que falta ligá-la a uma linha).
  if (!veTodas && minhas.size === 0 && papel !== "social") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  return { organizacaoId, usuarioId, veTodas, gestor: ehGestor(session), linhas, minhas }
}

/** Pode anotar, editar e pedir ideias desta linha: a social dela, ou gestor/admin. */
export function podeEditarLinha(escopo: EscopoSocial, linhaId: string | null | undefined): boolean {
  if (!linhaId) return false
  return escopo.minhas.has(linhaId) || (escopo.gestor && escopo.linhas.some((l) => l.id === linhaId))
}

export function semLinha() {
  return NextResponse.json(
    { error: "Só a social media desta linha pode mexer aqui." },
    { status: 403 },
  )
}

/**
 * Pedido em que esta pessoa age como a social: o que ela pediu (pelo quadro ou
 * direto no Audiovisual/Growth, antes de o quadro existir) ou o que saiu do
 * quadro de uma linha dela. Priorizar e cobrar só valem aqui.
 */
export async function pedidoDaSocial(escopo: EscopoSocial, id: string) {
  const d = await prisma.demanda.findFirst({
    where: { id, organizacaoId: escopo.organizacaoId },
    select: {
      id: true, codigo: true, titulo: true, area: true, linhaProjetoId: true,
      statusVisivel: true, cobrancas: true, cobradoEm: true, dataLimite: true,
      socialId: true, solicitanteId: true,
      ideia: { select: { dataPostagem: true } },
    },
  })
  if (!d) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 })
  const eDela = escopo.minhas.size > 0 && (d.socialId === escopo.usuarioId || d.solicitanteId === escopo.usuarioId)
  const daLinhaDela = !!d.socialId && !!d.linhaProjetoId && escopo.minhas.has(d.linhaProjetoId)
  if (!eDela && !daLinhaDela) return semLinha()
  return d
}

// ── Cobrança ────────────────────────────────────────────────────────────────

export type Pessoa = { usuarioId?: string; nome: string; telefone?: string | null }

/**
 * Quem está com o card. No audiovisual pode ser videomaker, editor ou um
 * responsável interno; no Growth, responsáveis e designer. Cobra-se todo mundo
 * que está ligado ao pedido — é quem pode responder.
 */
export async function responsaveisDoPedido(demandaId: string): Promise<Pessoa[]> {
  const d = await prisma.demanda.findUnique({
    where: { id: demandaId },
    select: {
      responsavel: { select: { id: true, nome: true, telefone: true, status: true } },
      responsaveis: { select: { usuario: { select: { id: true, nome: true, telefone: true, status: true } } } },
      editor: { select: { nome: true, telefone: true, whatsapp: true, usuarioId: true } },
      videomaker: { select: { nome: true, telefone: true, usuarioId: true } },
      designer: { select: { nome: true, telefone: true, whatsapp: true, usuarioId: true } },
    },
  })
  if (!d) return []
  const usuarios = [d.responsavel, ...d.responsaveis.map((r) => r.usuario)]
    .filter((u): u is NonNullable<typeof u> => !!u && u.status === "ativo")
    .map((u) => ({ usuarioId: u.id, nome: u.nome, telefone: u.telefone }))
  const perfis: Pessoa[] = []
  if (d.videomaker) perfis.push({ usuarioId: d.videomaker.usuarioId ?? undefined, nome: d.videomaker.nome, telefone: d.videomaker.telefone })
  if (d.editor) perfis.push({ usuarioId: d.editor.usuarioId ?? undefined, nome: d.editor.nome, telefone: d.editor.whatsapp || d.editor.telefone })
  if (d.designer) perfis.push({ usuarioId: d.designer.usuarioId ?? undefined, nome: d.designer.nome, telefone: d.designer.whatsapp || d.designer.telefone })
  return unicas([...usuarios, ...perfis])
}

/**
 * O gestor da área do pedido: no audiovisual, os líderes do audiovisual e os
 * gestores/admins que atuam no audiovisual; no Growth (area "design"), os
 * gestores/admins que atuam no Growth. Empresa que não marcou área em ninguém
 * cai em quem recebe todos os avisos — alguém precisa ser avisado.
 */
export async function gestoresDaArea(organizacaoId: string, area: AreaDemanda): Promise<Pessoa[]> {
  const atuacao = area === "audiovisual" ? "audiovisual" : "growth"
  const membros = await prisma.usuarioOrganizacao.findMany({
    where: {
      organizacaoId,
      usuario: { status: "ativo" },
      OR: [
        { papel: { in: ["admin", "gestor"] }, areas: { has: atuacao } },
        ...(area === "audiovisual" ? [{ liderAudiovisual: true }] : []),
      ],
    },
    select: { usuario: { select: { id: true, nome: true, telefone: true } } },
  })
  if (membros.length > 0) {
    return unicas(membros.map((m) => ({ usuarioId: m.usuario.id, nome: m.usuario.nome, telefone: m.usuario.telefone })))
  }
  return (await quemRecebeTudo(organizacaoId)).map((p) => ({ usuarioId: p.id, nome: p.nome, telefone: p.telefone }))
}

/** Uma pessoa por usuário e por número (últimos 8 dígitos, como no resto do app). */
export function unicas(pessoas: Pessoa[]): Pessoa[] {
  const ids = new Set<string>()
  const fones = new Set<string>()
  const saida: Pessoa[] = []
  for (const p of pessoas) {
    const fone = p.telefone?.replace(/\D/g, "").slice(-8) || ""
    if ((p.usuarioId && ids.has(p.usuarioId)) || (fone && fones.has(fone))) continue
    if (p.usuarioId) ids.add(p.usuarioId)
    if (fone) fones.add(fone)
    saida.push(p)
  }
  return saida
}

/** Meia-noite de hoje em Brasília, como instante. O Brasil não tem horário de verão desde 2019. */
export function inicioDeHojeEmBrasilia(hoje: string): Date {
  return new Date(`${hoje}T00:00:00-03:00`)
}

// ── Pedido a partir de uma ideia do quadro ──────────────────────────────────
//
// O pedido sai pelo formulário de demanda de sempre (POST /api/demandas), com o
// id da ideia junto. Aqui se confere que a ideia é desta social e ainda não
// virou pedido; a linha da demanda passa a ser a da ideia, e `socialId` marca
// o pedido como dela (o selo "Social" no card da equipe).

export async function ideiaParaPedido(ideiaId: string, organizacaoId: string, usuarioId: string, gestor: boolean) {
  const ideia = await prisma.ideiaVideo.findFirst({
    where: { id: ideiaId, organizacaoId },
    select: {
      id: true, demandaId: true,
      linhaProjeto: {
        select: {
          id: true, nome: true,
          socials: { where: { vinculo: { usuario: { status: "ativo" } } }, select: { vinculo: { select: { usuarioId: true } } } },
        },
      },
    },
  })
  if (!ideia) return { erro: "Ideia não encontrada.", status: 404 } as const
  if (ideia.demandaId) return { erro: "Esta ideia já virou pedido.", status: 409 } as const
  if (!ideia.linhaProjeto) return { erro: "A ideia está sem linha de produto.", status: 400 } as const
  const socials = ideia.linhaProjeto.socials.map((s) => s.vinculo.usuarioId)
  if (!socials.includes(usuarioId) && !gestor) {
    return { erro: "Só a social media desta linha pode pedir esta ideia.", status: 403 } as const
  }
  // O pedido é da social da linha mesmo quando o gestor envia: é ela quem
  // prioriza, cobra e aprova. Linha ainda sem social fica com quem enviou.
  const socialId = socials.includes(usuarioId) ? usuarioId : socials[0] ?? usuarioId
  return { linha: { id: ideia.linhaProjeto.id, nome: ideia.linhaProjeto.nome }, socialId } as const
}

/** Liga a ideia à demanda recém-criada. `demandaId: null` no filtro segura dois envios simultâneos. */
export async function ligarIdeiaAoPedido(ideiaId: string, demanda: { id: string; area: AreaDemanda; titulo: string }) {
  await prisma.ideiaVideo.updateMany({
    where: { id: ideiaId, demandaId: null },
    data: { demandaId: demanda.id, status: "em_producao", convertidoEm: new Date(), area: demanda.area, titulo: demanda.titulo },
  })
}
