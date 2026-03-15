import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { analisarComClaude, MODELO_POTENTE, extrairJSON } from "@/lib/claude"

export const maxDuration = 60

// POST /api/ia/agentes/triagem
// Agente de Triagem: analisa uma nova demanda e sugere prioridade, videomaker ideal, riscos
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { demandaId } = await req.json()
  if (!demandaId) return NextResponse.json({ error: "demandaId obrigatório" }, { status: 400 })

  const execucao = await prisma.agenteExecucao.create({
    data: { agente: "triagem", status: "executando", criadoPor: session.user?.id },
  })

  try {
    // Busca demanda completa
    const demanda = await prisma.demanda.findUnique({
      where: { id: demandaId },
      include: {
        solicitante: { select: { nome: true, tipo: true } },
        historicos: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    })
    if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

    // Busca videomakers disponíveis para matching
    const videomakers = await prisma.videomaker.findMany({
      where: { status: { in: ["ativo", "preferencial"] }, emListaNegra: false },
      select: {
        id: true,
        nome: true,
        cidade: true,
        valorDiaria: true,
        avaliacao: true,
        areasAtuacao: true,
        habilidades: true,
        demandas: {
          where: { statusInterno: { notIn: ["postado", "entregue_cliente", "encerrado"] } },
          select: { id: true },
        },
      },
    })

    // Demandas similares para benchmarking
    const similares = await prisma.demanda.findMany({
      where: {
        tipoVideo: demanda.tipoVideo,
        statusInterno: { in: ["postado", "entregue_cliente"] },
        id: { not: demandaId },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        titulo: true,
        prioridade: true,
        createdAt: true,
        updatedAt: true,
        videomaker: { select: { nome: true } },
      },
    })

    const vmDisponivel = videomakers
      .filter(vm => vm.demandas.length < 3)
      .map(vm => ({
        id: vm.id,
        nome: vm.nome,
        cidade: vm.cidade,
        valorDiaria: vm.valorDiaria,
        avaliacao: vm.avaliacao,
        habilidades: vm.habilidades,
        areas: vm.areasAtuacao,
        cargaAtual: vm.demandas.length,
      }))

    const contexto = `
DEMANDA PARA TRIAGEM:
- Código: ${demanda.codigo}
- Título: ${demanda.titulo}
- Descrição: ${demanda.descricao}
- Departamento: ${demanda.departamento}
- Tipo de vídeo: ${demanda.tipoVideo}
- Prioridade declarada: ${demanda.prioridade}
- Cidade: ${demanda.cidade}
- Motivo de urgência: ${demanda.motivoUrgencia ?? "N/A"}
- Solicitante: ${demanda.solicitante.nome} (${demanda.solicitante.tipo})
- Data limite: ${demanda.dataLimite ? demanda.dataLimite.toLocaleDateString("pt-BR") : "Não definida"}

VIDEOMAKERS DISPONÍVEIS (carga < 3 demandas):
${JSON.stringify(vmDisponivel, null, 2)}

DEMANDAS SIMILARES CONCLUÍDAS:
${JSON.stringify(similares.map(s => ({
  titulo: s.titulo,
  prioridade: s.prioridade,
  videomaker: s.videomaker?.nome,
  diasParaConcluir: Math.floor((s.updatedAt.getTime() - s.createdAt.getTime()) / 86400000),
})), null, 2)}
    `.trim()

    const prompt = `Analise esta demanda e faça a triagem completa. Retorne JSON com esta estrutura exata:
{
  "score_viabilidade": 85,
  "prioridade_real": "alta",
  "justificativa_prioridade": "string explicando por que",
  "videomaker_recomendado": {
    "id": "string",
    "nome": "string",
    "motivo": "string explicando a escolha"
  },
  "timeline_estimada": {
    "dias_captacao": 2,
    "dias_edicao": 3,
    "total_dias": 5,
    "data_entrega_estimada": "DD/MM/AAAA"
  },
  "riscos": [
    {"risco": "string", "impacto": "alto|medio|baixo", "mitigacao": "string"}
  ],
  "recursos_necessarios": ["string"],
  "pontos_atencao": ["string"],
  "aprovacao_sugerida": "aprovar|solicitar_info|recusar",
  "justificativa_aprovacao": "string"
}`

    const { texto, tokens } = await analisarComClaude(prompt, contexto, MODELO_POTENTE)
    const analise = extrairJSON(texto) as Record<string, unknown> | null

    await prisma.agenteExecucao.update({
      where: { id: execucao.id },
      data: {
        status: "concluido",
        resultado: (analise ?? { texto }) as import("@prisma/client").Prisma.InputJsonValue,
        tokens,
        ferramentas: ["prisma_demanda", "prisma_videomakers", "prisma_similares"],
        finishedAt: new Date(),
      },
    })

    return NextResponse.json({ sucesso: true, analise, tokens, demandaId })
  } catch (err) {
    await prisma.agenteExecucao.update({
      where: { id: execucao.id },
      data: { status: "erro", erro: String(err), finishedAt: new Date() },
    })
    return NextResponse.json({ error: "Erro no agente de triagem" }, { status: 500 })
  }
}
