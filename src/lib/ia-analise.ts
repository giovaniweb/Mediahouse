import Anthropic from "@anthropic-ai/sdk"
import type { PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { criarOrcamentoIA, LimiteIA, type ContextoConsumoIA } from "@/lib/ia-orcamento"

const MODELOS = ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-6"]
const SYSTEM = "Você analisa dados autorizados do NuFlow. Responda em português. Não invente fatos, números ou informações ausentes. Não execute ações."
type Pedido = { model: string; max_tokens: number; system: string; messages: { role: "user"; content: string }[] }
type Resposta = { id: string; content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } }
export class FalhaAnaliseIA extends Error { constructor() { super("Não foi possível confirmar a análise de IA. Confira o consumo no painel: a confirmação pode estar pendente.") } }

/** Adaptador de texto. Não aceita imagens, ferramentas, loops nem fallback de modelo. */
export function criarAnaliseIA(db: PrismaClient, enviar: (pedido: Pedido) => Promise<Resposta>) {
  const orcamento = criarOrcamentoIA(db)
  return async (prompt: string, contexto: string, modelo: string, consumo: ContextoConsumoIA) => {
    if (!MODELOS.includes(modelo)) throw new LimiteIA("indisponivel")
    const pedido: Pedido = { model: modelo, max_tokens: 4096, system: SYSTEM, messages: [{ role: "user", content: contexto ? `${contexto}\n\n${prompt}` : prompt }] }
    const bytes = Buffer.byteLength(JSON.stringify(pedido), "utf8")
    const reserva = await orcamento.reservar(consumo, modelo, bytes, pedido.max_tokens)
    try {
      await orcamento.iniciar(reserva)
    } catch (e) {
      // Apenas antes do checkpoint. Se o commit for ambíguo, liberar falha fechado.
      await orcamento.liberar(reserva).catch(() => {})
      throw e
    }
    try {
      const response = await enviar(pedido)
      await orcamento.reconciliar(reserva, { entrada: response.usage.input_tokens, saida: response.usage.output_tokens, cacheLeitura: response.usage.cache_read_input_tokens ?? null, cacheEscrita: response.usage.cache_creation_input_tokens ?? null, provedorId: response.id })
      const tokens = response.usage.input_tokens + response.usage.output_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0)
      return { texto: response.content.filter(b => b.type === "text").map(b => b.text ?? "").join("\n"), tokens }
    } catch {
      // Inclusive resposta recebida cujo uso não foi persistido: nada de reenviar.
      await orcamento.desconhecido(reserva).catch(() => {})
      throw new FalhaAnaliseIA()
    }
  }
}

export async function analisarComOrcamento(prompt: string, contexto: string, modelo: string, consumo: ContextoConsumoIA) {
  if (!process.env.ANTHROPIC_API_KEY) throw new LimiteIA("indisponivel")
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 90_000 })
  return criarAnaliseIA(prisma, pedido => client.messages.create(pedido))(prompt, contexto, modelo, consumo)
}
