import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Anthropic from "@anthropic-ai/sdk"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const produtos = await prisma.produto.findMany({
    where: { ativo: true },
    include: {
      _count: { select: { demandas: true } },
    },
  })

  const now = new Date()

  const scored = produtos.map((p) => {
    const refDate = p.ultimoConteudo ?? p.createdAt
    const diasSemConteudo = Math.floor(
      (now.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    const score = p.peso * (diasSemConteudo / Math.max(p.alertaDias, 1))

    return {
      id: p.id,
      nome: p.nome,
      categoria: p.categoria,
      diasSemConteudo,
      peso: p.peso,
      alertaDias: p.alertaDias,
      totalConteudos: p.totalConteudos,
      score: Math.round(score * 100) / 100,
      sugestao: "",
    }
  })

  // Sort by score DESC, take top 10
  scored.sort((a, b) => b.score - a.score)
  const top10 = scored.slice(0, 10)

  // Use Claude API to generate suggestions for top 5
  const top5 = top10.slice(0, 5)

  if (top5.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const produtosInfo = top5
        .map(
          (p, i) =>
            `${i + 1}. "${p.nome}" (categoria: ${p.categoria || "sem categoria"}, ${p.diasSemConteudo} dias sem conteúdo, peso: ${p.peso}, score: ${p.score})`
        )
        .join("\n")

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20250315",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Você é um especialista em marketing de conteúdo audiovisual. Para cada produto abaixo, sugira UMA ideia breve e criativa de conteúdo em vídeo (máximo 2 frases). Responda APENAS em JSON array, sem markdown, sem explicação. Formato: [{"nome": "...", "sugestao": "..."}]

Produtos que precisam de conteúdo urgentemente:
${produtosInfo}`,
          },
        ],
      })

      const text =
        response.content[0].type === "text" ? response.content[0].text : ""

      try {
        // Extract JSON from response (handle potential markdown wrapping)
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const sugestoes: { nome: string; sugestao: string }[] = JSON.parse(
            jsonMatch[0]
          )

          for (const sug of sugestoes) {
            const match = top5.find(
              (p) => p.nome.toLowerCase() === sug.nome.toLowerCase()
            )
            if (match) {
              match.sugestao = sug.sugestao
            }
          }

          // If exact name match fails, assign by index
          for (let i = 0; i < Math.min(sugestoes.length, top5.length); i++) {
            if (!top5[i].sugestao && sugestoes[i]?.sugestao) {
              top5[i].sugestao = sugestoes[i].sugestao
            }
          }
        }
      } catch {
        // If JSON parsing fails, just continue without suggestions
      }
    } catch {
      // If Claude API fails, continue without AI suggestions
    }
  }

  return NextResponse.json({ sugestoes: top10 })
}
