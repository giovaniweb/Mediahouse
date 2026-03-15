import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { claude, MODELO_POTENTE, SYSTEM_VIDEOOPS, TOOLS_VIDEOOPS } from "@/lib/claude"
import { executarFerramenta } from "@/lib/ia-tools-executor"
import Anthropic from "@anthropic-ai/sdk"

export const maxDuration = 60

// POST /api/ia/chat — streaming chat com tool-use via SSE
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 })
  }

  const { messages } = await req.json() as {
    messages: Anthropic.MessageParam[]
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        let currentMessages: Anthropic.MessageParam[] = [...messages]
        let iteracoes = 0
        const MAX_ITER = 8

        while (iteracoes < MAX_ITER) {
          iteracoes++

          // ── Streaming call ───────────────────────────────────────────────
          const streamCall = claude.messages.stream({
            model: MODELO_POTENTE,
            max_tokens: 4096,
            system: SYSTEM_VIDEOOPS,
            tools: TOOLS_VIDEOOPS,
            messages: currentMessages,
          })

          // Stream text deltas em tempo real
          streamCall.on("text", (delta) => {
            send({ type: "text", text: delta })
          })

          // Indicar quando uma tool está sendo chamada
          streamCall.on("inputJson", (_delta, snapshot) => {
            void snapshot // mantém referência
          })

          const finalMsg = await streamCall.finalMessage()

          if (finalMsg.stop_reason === "end_turn") {
            // Resposta completa — encerra
            send({ type: "done" })
            break
          }

          if (finalMsg.stop_reason === "tool_use") {
            // Adiciona resposta do assistente ao histórico
            currentMessages.push({
              role: "assistant",
              content: finalMsg.content,
            })

            // Executa cada tool call
            const toolResults: Anthropic.ToolResultBlockParam[] = []
            for (const block of finalMsg.content) {
              if (block.type === "tool_use") {
                // Avisa ao cliente que está consultando
                send({ type: "tool_call", name: block.name, label: toolLabel(block.name) })

                const resultado = await executarFerramenta(
                  block.name,
                  block.input as Record<string, unknown>
                )

                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: resultado,
                })

                send({ type: "tool_done", name: block.name })
              }
            }

            // Alimenta resultados de volta
            currentMessages.push({ role: "user", content: toolResults })
          } else {
            send({ type: "done" })
            break
          }
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

function toolLabel(nome: string): string {
  const labels: Record<string, string> = {
    buscar_demandas: "Consultando demandas...",
    buscar_videomakers: "Buscando videomakers...",
    buscar_custos: "Analisando custos...",
    buscar_metricas: "Calculando métricas...",
    buscar_alertas: "Verificando alertas...",
    criar_alerta: "Criando alerta...",
    buscar_historico_demanda: "Buscando histórico...",
  }
  return labels[nome] ?? `Executando ${nome}...`
}
