import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { analisarComClaude, extrairJSON, MODELO_RAPIDO } from "@/lib/claude"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const ideia = await prisma.ideiaVideo.findUnique({
    where: { id },
    include: {
      produto: { select: { nome: true, peso: true, totalConteudos: true, ultimoConteudo: true, alertaDias: true } },
    },
  })

  if (!ideia) return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })

  // Build context about the product
  let contextoProduto = "Nenhum produto associado."
  if (ideia.produto) {
    const diasSemConteudo = ideia.produto.ultimoConteudo
      ? Math.floor((Date.now() - ideia.produto.ultimoConteudo.getTime()) / (1000 * 60 * 60 * 24))
      : 999
    contextoProduto = `Produto: ${ideia.produto.nome}
- Total de vídeos já feitos: ${ideia.produto.totalConteudos}
- Dias sem conteúdo: ${diasSemConteudo}
- Peso/prioridade: ${ideia.produto.peso}
- Limite de alerta: ${ideia.produto.alertaDias} dias`
  }

  const prompt = `Analise esta ideia de vídeo e retorne APENAS um JSON (sem markdown, sem texto extra):

IDEIA:
- Título: ${ideia.titulo}
- Descrição: ${ideia.descricao || "Sem descrição"}
- Link de referência: ${ideia.linkReferencia || "Nenhum"}
- Plataforma origem: ${ideia.plataforma || "desconhecida"}
- Classificação: ${ideia.classificacao || "não definida"}
- Tags: ${ideia.tags?.join(", ") || "nenhuma"}

${contextoProduto}

Retorne o JSON:
{
  "score": <número 0-100>,
  "analise": "<texto de 2-3 frases explicando o potencial>",
  "sugestao_tipo": "<tipo de vídeo sugerido: social_media, institucional, tutorial, unboxing, review, cobertura, etc>",
  "sugestao_prioridade": "<alta|normal|baixa>",
  "motivos_score": ["<razão 1>", "<razão 2>", "<razão 3>"]
}

Critérios de score:
- Relevância para o produto/marca (0-25)
- Tendência/viralidade da referência (0-25)
- Gap de conteúdo (produto sem vídeo há muito tempo = score alto) (0-25)
- Viabilidade de produção (0-25)`

  const { texto, tokens } = await analisarComClaude(prompt, "", MODELO_RAPIDO)
  const resultado = extrairJSON(texto) as {
    score?: number
    analise?: string
    sugestao_tipo?: string
    sugestao_prioridade?: string
    motivos_score?: string[]
  } | null

  if (!resultado || typeof resultado.score !== "number") {
    return NextResponse.json({ error: "Falha ao analisar — resposta inválida da IA", raw: texto }, { status: 500 })
  }

  const updated = await prisma.ideiaVideo.update({
    where: { id },
    data: {
      scoreIA: resultado.score,
      analiseIA: resultado.analise || texto,
      sugestaoTipo: resultado.sugestao_tipo || null,
      sugestaoPrioridade: resultado.sugestao_prioridade || null,
      analisadoEm: new Date(),
      status: ideia.status === "nova" ? "em_analise" : ideia.status,
    },
  })

  // Log agent execution
  await prisma.agenteExecucao.create({
    data: {
      agente: "analise_ideia",
      status: "concluido",
      resultado: resultado as object,
      tokens,
      ferramentas: [],
      criadoPor: session.user.id,
      finishedAt: new Date(),
    },
  })

  return NextResponse.json({
    scoreIA: updated.scoreIA,
    analiseIA: updated.analiseIA,
    sugestaoTipo: updated.sugestaoTipo,
    sugestaoPrioridade: updated.sugestaoPrioridade,
    tokens,
  })
}
