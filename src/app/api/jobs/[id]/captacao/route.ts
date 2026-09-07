import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { EVENTO_CAPTACAO_INICIADA } from "@/lib/status"

// POST /api/jobs/[id]/captacao — registra o INÍCIO real da captação (§14).
//
// Por que uma rota própria e não `PATCH /demandas/[id]/status`: aquela rota
// grava status, e começar a gravar NÃO é mudança de status. O §14 pede
// `capture_started_at` e um evento `capture_started`; não pede transição. A bola
// continua com o videomaker e o card continua na mesma coluna.
//
// Onde o timestamp mora: `HistoricoStatus.createdAt`. `statusNovo` é String, e o
// projeto já usa isso para registrar fatos que não são etapa — `edicao_campos`
// (69 linhas) e `responsavel_alterado` (93). Nenhuma coluna nova, nenhuma
// migration, e a timeline ganha o evento de graça.
//
// O FIM da captação não passa por aqui: `captacao_realizada` é um status de
// verdade, com o significado certo, e vai pelo caminho normal.

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const { organizacaoId } = guard

  const [vinculo, perfil, demanda] = await Promise.all([
    permissoesEfetivas(session.user.id, organizacaoId),
    prisma.videomaker.findFirst({ where: { usuarioId: session.user.id }, select: { id: true } }),
    prisma.demanda.findUnique({
      where: { id },
      select: { id: true, statusInterno: true, videomakerId: true },
    }),
  ])

  // Fail-closed, como a guarda de transição: sem vínculo determinável, nada.
  if (!vinculo) {
    return NextResponse.json({ error: "Não foi possível determinar suas permissões nesta empresa." }, { status: 403 })
  }
  if (!demanda) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  // Quem capta é o videomaker do job. Gestão também pode registrar — é ela que
  // corrige quando o videomaker não registrou na hora.
  const ehGestao = vinculo.papel === "admin" || vinculo.papel === "gestor"
  const ehDono = !!perfil && !!demanda.videomakerId && perfil.id === demanda.videomakerId
  if (!ehGestao && !ehDono) {
    return NextResponse.json({ error: "Este job não está atribuído a você." }, { status: 403 })
  }

  // Só faz sentido depois do aceite e antes de a captação terminar.
  const ELEGIVEIS = ["videomaker_aceitou", "captacao_agendada"]
  if (!ELEGIVEIS.includes(demanda.statusInterno)) {
    return NextResponse.json(
      { error: "A captação só pode ser iniciada depois do aceite do videomaker." },
      { status: 400 }
    )
  }

  // Idempotência (§53): registrar duas vezes criaria dois "capture_started" e
  // o primeiro deixaria de ser o início. Se já existe, devolve o que existe.
  const jaIniciada = await prisma.historicoStatus.findFirst({
    where: { demandaId: id, statusNovo: EVENTO_CAPTACAO_INICIADA },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  })
  if (jaIniciada) {
    return NextResponse.json({ iniciadaEm: jaIniciada.createdAt, jaRegistrada: true })
  }

  const evento = await prisma.historicoStatus.create({
    data: {
      demandaId: id,
      // O status NÃO muda: o "anterior" e o estado real continuam os mesmos.
      statusAnterior: demanda.statusInterno,
      statusNovo: EVENTO_CAPTACAO_INICIADA,
      usuarioId: session.user.id,
      origem: "manual",
      observacao: "Captação iniciada",
    },
    select: { createdAt: true },
  })

  return NextResponse.json({ iniciadaEm: evento.createdAt, jaRegistrada: false })
}
