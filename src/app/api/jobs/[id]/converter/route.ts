import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { EVENTO_EDICAO } from "@/lib/status"
import { conversaoDeFluxo, descricaoDaConversao, fluxoAtual, type FluxoDoRegistro } from "@/lib/job-fase"

// POST /api/jobs/[id]/converter — move o registro entre o fluxo de Demandas e o
// de Jobs (cobertura).
//
// NÃO DUPLICA NADA. É um UPDATE de dois campos no mesmo registro: id,
// solicitante, briefing, arquivos, comentários, histórico, datas e responsáveis
// continuam intocados. A classificação já existia e já era o que o quadro de
// Jobs consulta (`ehSolicitacaoDeCobertura`); converter é virar essa chave.
//
// Por que aqui e não em /api/demandas: a rota decide de que fluxo o registro é,
// e isso é regra do módulo de Jobs. O módulo de Demandas segue sem saber que
// esta conversão existe.

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const { organizacaoId } = guard

  const body = await req.json().catch(() => ({}))
  const para = body.para as FluxoDoRegistro | undefined
  if (para !== "job" && para !== "demanda") {
    return NextResponse.json({ error: 'Destino inválido: use "job" ou "demanda".' }, { status: 400 })
  }

  const [vinculo, demanda] = await Promise.all([
    permissoesEfetivas(session.user.id, organizacaoId),
    prisma.demanda.findUnique({
      where: { id },
      select: { id: true, area: true, statusInterno: true, departamento: true, tipoVideo: true },
    }),
  ])

  // Fail-closed, como a guarda de transição.
  if (!vinculo) {
    return NextResponse.json({ error: "Não foi possível determinar suas permissões nesta empresa." }, { status: 403 })
  }
  if (!demanda) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  // Reclassificar decide de qual esteira o registro é: é ato de gestão, não de
  // execução. Quem edita demanda também pode, porque são os mesmos campos que
  // ele já altera pelo formulário.
  const ehGestao = vinculo.papel === "admin" || vinculo.papel === "gestor"
  if (!ehGestao && !vinculo.permissoes.editarDemanda) {
    return NextResponse.json({ error: "Você não tem permissão para converter." }, { status: 403 })
  }

  // Cobertura é operação audiovisual. Uma peça de Growth (area=design) tem
  // outro quadro e outro time — mandá-la para Jobs a faria sumir do lugar onde
  // é acompanhada.
  if (para === "job" && demanda.area !== "audiovisual") {
    return NextResponse.json(
      { error: "Só demandas de audiovisual podem virar Job. Esta é de Growth/design." },
      { status: 400 }
    )
  }

  const mudanca = conversaoDeFluxo(demanda, para, {
    departamento: body.departamento,
    tipoVideo: body.tipoVideo,
  })

  // Já estava no fluxo pedido: responde sucesso sem gravar nem duplicar
  // histórico (§53). Converter duas vezes não pode fazer efeito duas vezes.
  if (!mudanca) {
    return NextResponse.json({ fluxo: fluxoAtual(demanda), jaEstava: true })
  }

  const anterior = { departamento: demanda.departamento, tipoVideo: demanda.tipoVideo }

  // Update + histórico na mesma transação: um registro reclassificado sem
  // rastro é exatamente o que o §27 proíbe.
  const [atualizada] = await prisma.$transaction([
    prisma.demanda.update({ where: { id }, data: mudanca }),
    prisma.historicoStatus.create({
      data: {
        demandaId: id,
        // O status não muda: converter é trocar de esteira, não de etapa.
        statusAnterior: demanda.statusInterno,
        // EVENTO_EDICAO em vez de um marcador novo: departamento e tipoVideo
        // SÃO campos, e as duas timelines (Job e Demanda) já sabem renderizar
        // este marcador usando a observação como texto.
        statusNovo: EVENTO_EDICAO,
        usuarioId: session.user.id,
        origem: "manual",
        // Guarda de onde veio — é a única coisa que a troca apaga.
        observacao: descricaoDaConversao(anterior, para),
      },
    }),
  ])

  return NextResponse.json({
    fluxo: fluxoAtual(atualizada),
    jaEstava: false,
    departamento: atualizada.departamento,
    tipoVideo: atualizada.tipoVideo,
  })
}
