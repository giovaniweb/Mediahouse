import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { analisarComClaude, extrairJSON, MODELO_RAPIDO } from "@/lib/claude"

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  // Find all unanalyzed ideas
  const ideias = await prisma.ideiaVideo.findMany({
    where: {
      scoreIA: null,
      status: { in: ["nova", "em_analise"] },
    },
    include: {
      produto: { select: { nome: true, peso: true, totalConteudos: true, ultimoConteudo: true, alertaDias: true } },
    },
    take: 20, // Limit batch size
  })

  if (ideias.length === 0) {
    return NextResponse.json({ message: "Nenhuma ideia para analisar", analisadas: 0 })
  }

  const execucao = await prisma.agenteExecucao.create({
    data: {
      agente: "analise_ideias_batch",
      status: "executando",
      criadoPor: session.user.id,
      ferramentas: [],
    },
  })

  let analisadas = 0
  let totalTokens = 0
  const erros: string[] = []

  for (const ideia of ideias) {
    try {
      let contextoProduto = ""
      if (ideia.produto) {
        const diasSemConteudo = ideia.produto.ultimoConteudo
          ? Math.floor((Date.now() - ideia.produto.ultimoConteudo.getTime()) / (1000 * 60 * 60 * 24))
          : 999
        contextoProduto = `\nProduto: ${ideia.produto.nome} (peso: ${ideia.produto.peso}, ${diasSemConteudo}d sem conteúdo, ${ideia.produto.totalConteudos} vídeos)`
      }

      const prompt = `Analise esta ideia de vídeo. Retorne APENAS JSON:
Título: ${ideia.titulo}
Descrição: ${ideia.descricao || "N/A"}
Link: ${ideia.linkReferencia || "N/A"}
Plataforma: ${ideia.plataforma || "N/A"}${contextoProduto}

JSON: {"score": 0-100, "analise": "2 frases", "sugestao_tipo": "tipo_video", "sugestao_prioridade": "alta|normal|baixa"}`

      const { texto, tokens } = await analisarComClaude(prompt, "", MODELO_RAPIDO)
      totalTokens += tokens

      const resultado = extrairJSON(texto) as {
        score?: number
        analise?: string
        sugestao_tipo?: string
        sugestao_prioridade?: string
      } | null

      if (resultado && typeof resultado.score === "number") {
        await prisma.ideiaVideo.update({
          where: { id: ideia.id },
          data: {
            scoreIA: resultado.score,
            analiseIA: resultado.analise || null,
            sugestaoTipo: resultado.sugestao_tipo || null,
            sugestaoPrioridade: resultado.sugestao_prioridade || null,
            analisadoEm: new Date(),
            status: ideia.status === "nova" ? "em_analise" : ideia.status,
          },
        })
        analisadas++
      } else {
        erros.push(`Ideia ${ideia.id}: resposta inválida`)
      }
    } catch (e) {
      erros.push(`Ideia ${ideia.id}: ${(e as Error).message}`)
    }
  }

  await prisma.agenteExecucao.update({
    where: { id: execucao.id },
    data: {
      status: erros.length > 0 ? "erro" : "concluido",
      resultado: { analisadas, erros, totalIdeias: ideias.length },
      tokens: totalTokens,
      finishedAt: new Date(),
      erro: erros.length > 0 ? erros.join("; ") : null,
    },
  })

  return NextResponse.json({ analisadas, total: ideias.length, tokens: totalTokens, erros })
}
