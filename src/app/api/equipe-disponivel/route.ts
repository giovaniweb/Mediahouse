import { CONTRATO_INTERNO, contratoEfetivo } from "@/lib/quadro-do-card"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { bloqueadosDaEmpresa } from "@/lib/videomaker-vinculo"
import { scoresDaRede, textoScore, type ScoreRede } from "@/lib/rede"

// GET /api/equipe-disponivel?papel=captacao|edicao
// Lista unificada e deduplicada de pessoas atribuíveis a um papel.
//   captacao → Videomakers + Editores(fazCaptacao) + Usuarios(social)
//   edicao   → Editores + Videomakers(podeEditar) + Usuarios(social)
// Cada opção: { value: token, label, subtitle, tipoContrato, origem }
//
// ?papel=captacao&externos=1 — só os videomakers EXTERNOS desta empresa (com
// vínculo aqui, ativos, sem bloqueio). É o "Quem grava" do "+ Novo Job":
// videomaker interno faria o card morar em Demandas (lib/quadro-do-card.ts), e
// o job sumiria do quadro em que foi criado.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const papel = req.nextUrl.searchParams.get("papel") === "edicao" ? "edicao" : "captacao"

  if (papel === "captacao" && req.nextUrl.searchParams.get("externos") === "1") {
    const vinculos = await prisma.videomakerOrganizacao.findMany({
      where: {
        organizacaoId,
        emListaNegra: false,
        status: { not: "inativo" },
        videomaker: { status: { not: "inativo" } },
      },
      select: {
        tipoContrato: true,
        videomaker: { select: { id: true, nome: true, cidade: true, tipoContrato: true, usuarioId: true } },
      },
      orderBy: { videomaker: { nome: "asc" } },
    })
    const opcoes = vinculos
      .map((v) => ({ v: v.videomaker, contrato: contratoEfetivo(v.tipoContrato, v.videomaker.tipoContrato) ?? "externo" }))
      .filter(({ contrato }) => contrato !== CONTRATO_INTERNO)
      .map(({ v, contrato }) => ({
        value: `vm:${v.id}`,
        label: v.nome,
        subtitle: v.cidade ?? "",
        tipoContrato: contrato,
        origem: "vm" as const,
        usuarioId: v.usuarioId,
      }))
    return NextResponse.json({ opcoes })
  }

  type Opcao = {
    value: string
    label: string
    subtitle: string
    tipoContrato: string
    origem: "vm" | "ed" | "user"
    usuarioId: string | null
    score?: ScoreRede
    scoreTexto?: string
  }

  const opcoes: Opcao[] = []
  // Dedup: pessoas com usuarioId aparecem uma vez (fonte primária do papel primeiro)
  const usuariosVistos = new Set<string>()
  const nomesVistos = new Set<string>()

  function add(o: Opcao) {
    if (o.usuarioId) {
      if (usuariosVistos.has(o.usuarioId)) return
      usuariosVistos.add(o.usuarioId)
    } else {
      const key = o.label.trim().toLowerCase()
      if (nomesVistos.has(key)) return
      nomesVistos.add(key)
    }
    opcoes.push(o)
  }

  if (papel === "captacao") {
    // Fonte primária: Videomakers.
    //
    // O bloqueio é de QUEM CONSULTA, não da rede: antes o filtro era
    // `emListaNegra` do perfil global, coluna com zero registros — bloquear
    // alguém não o tirava desta lista. E se alguém marcasse ali, o profissional
    // sumiria para todas as empresas de uma vez.
    //
    // E a escala é da LISTA da empresa (vínculo), não da rede inteira. Antes,
    // escolher aqui alguém que nunca trabalhou com a empresa criava o vínculo
    // sozinho e entregava o telefone dele. Pelos Termos do Profissional, quem é
    // de fora entra pelo convite da rede (/videomakers/rede) e decide se aceita.
    const bloqueados = await bloqueadosDaEmpresa(organizacaoId)
    const vms = await prisma.videomaker.findMany({
      where: {
        status: { not: "inativo" },
        vinculos: { some: { organizacaoId, status: { in: ["ativo", "preferencial"] }, emListaNegra: false } },
        ...(bloqueados.length ? { id: { notIn: bloqueados } } : {}),
      },
      select: {
        id: true, nome: true, cidade: true, tipoContrato: true, usuarioId: true,
        vinculos: { where: { organizacaoId }, select: { tipoContrato: true } },
      },
      orderBy: { nome: "asc" },
    })
    for (const v of vms) {
      add({
        value: `vm:${v.id}`,
        label: v.nome,
        subtitle: v.cidade ?? "",
        tipoContrato: contratoEfetivo(v.vinculos[0]?.tipoContrato, v.tipoContrato) ?? "externo",
        origem: "vm",
        usuarioId: v.usuarioId,
      })
    }
    // Editores que captam
    const eds = await prisma.editor.findMany({
      // `fazCaptacao` é do perfil (habilidade da pessoa); status e bloqueio são
      // do vínculo. Mesmo tratamento que o videomaker já recebe nesta tela.
      where: {
        fazCaptacao: true,
        vinculos: { some: { organizacaoId, status: "ativo", emListaNegra: false } },
      },
      select: { id: true, nome: true, cidade: true, tipoContrato: true, usuarioId: true },
      orderBy: { nome: "asc" },
    })
    for (const e of eds) {
      add({
        value: `ed:${e.id}`,
        label: e.nome,
        subtitle: e.cidade ?? "",
        tipoContrato: e.tipoContrato,
        origem: "ed",
        usuarioId: e.usuarioId,
      })
    }
  } else {
    // Fonte primária: Editores
    const eds = await prisma.editor.findMany({
      where: { vinculos: { some: { organizacaoId, status: "ativo", emListaNegra: false } } },
      select: { id: true, nome: true, especialidade: true, tipoContrato: true, usuarioId: true },
      orderBy: { nome: "asc" },
    })
    for (const e of eds) {
      add({
        value: `ed:${e.id}`,
        label: e.nome,
        subtitle: e.especialidade?.[0] ?? "",
        tipoContrato: e.tipoContrato,
        origem: "ed",
        usuarioId: e.usuarioId,
      })
    }
    // Videomakers que editam — também só os da lista da empresa.
    const vms = await prisma.videomaker.findMany({
      where: {
        podeEditar: true,
        status: { not: "inativo" },
        vinculos: { some: { organizacaoId, status: { in: ["ativo", "preferencial"] }, emListaNegra: false } },
      },
      select: {
        id: true, nome: true, cidade: true, tipoContrato: true, usuarioId: true,
        vinculos: { where: { organizacaoId }, select: { tipoContrato: true } },
      },
      orderBy: { nome: "asc" },
    })
    for (const v of vms) {
      add({
        value: `vm:${v.id}`,
        label: v.nome,
        subtitle: v.cidade ?? "",
        tipoContrato: contratoEfetivo(v.vinculos[0]?.tipoContrato, v.tipoContrato) ?? "externo",
        origem: "vm",
        usuarioId: v.usuarioId,
      })
    }
  }

  // Usuários social (comuns aos dois papéis)
  const socials = await prisma.usuario.findMany({
    where: {
      tipo: "social",
      status: "ativo",
      organizacoes: {
        some: {
          organizacaoId,
          categoria: "interna",
        },
      },
    },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  })
  for (const u of socials) {
    add({
      value: `user:${u.id}`,
      label: u.nome,
      subtitle: "Social media",
      tipoContrato: "interno",
      origem: "user",
      usuarioId: u.id,
    })
  }

  // O score da rede vai junto: é aqui que a empresa escolhe quem escalar e, com
  // isso, para quem sai o convite de diária. Só média e quantidade.
  const [scoresVm, scoresEd] = await Promise.all([
    scoresDaRede("videomaker", opcoes.filter(o => o.origem === "vm").map(o => o.value.slice(3))),
    scoresDaRede("editor", opcoes.filter(o => o.origem === "ed").map(o => o.value.slice(3))),
  ])
  for (const o of opcoes) {
    const sc = o.origem === "vm" ? scoresVm.get(o.value.slice(3)) : o.origem === "ed" ? scoresEd.get(o.value.slice(3)) : undefined
    if (!sc) continue
    o.score = sc
    // Na lista de opções, "Novo na rede" em todo mundo seria ruído; só a nota.
    if (sc.media != null) o.scoreTexto = textoScore(sc)
  }

  opcoes.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
  return NextResponse.json({ opcoes })
}
