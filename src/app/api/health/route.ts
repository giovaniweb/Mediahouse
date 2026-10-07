import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { conferirSaude } from "@/lib/saude-sistema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/health — vivo, com banco respondendo e o essencial funcionando.
// Existe para monitoramento externo saber que a aplicação está de pé sem depender
// de alguém abrir a tela. Não exige sessão e, de propósito, NÃO devolve dado de
// negócio, contagem de registros nem nome de empresa: é um sinal, não um relatório.
//
// Dois níveis, para não quebrar quem já lê esta página:
//   ok / banco / latenciaMs — só o banco, como sempre (a virada do RLS e o
//     indicador de versão do menu leem isto; a latência é só a do banco).
//   situacao — "ok" ou "atencao", com a lista curta de `problemas`: fila do
//     WhatsApp parada ou com falhas na última hora, rotina automática atrasada
//     ou com erro, e-mail sem configuração (lib/saude-sistema). É o que o
//     monitor do celular procura.
//
// A parte nova fica guardada por um minuto em cada servidor: o menu de cada
// pessoa logada consulta esta página a cada 5 minutos.
let guardado: { em: number; dados: Awaited<ReturnType<typeof conferirSaude>> } | null = null

async function saudeGuardada() {
  if (guardado && Date.now() - guardado.em < 60_000) return guardado.dados
  const dados = await conferirSaude()
  guardado = { em: Date.now(), dados }
  return dados
}

export async function GET() {
  const inicio = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    // Sem detalhe do erro na resposta — mensagem de driver vaza host e usuário.
    return NextResponse.json(
      { ok: false, banco: "indisponivel", latenciaMs: Date.now() - inicio, situacao: "atencao", problemas: ["banco:indisponivel"] },
      { status: 503 }
    )
  }
  const latenciaMs = Date.now() - inicio

  let extra: { situacao: "ok" | "atencao"; problemas: string[]; whatsapp?: string; rotinas?: Record<string, string>; email?: string }
  try {
    const s = await saudeGuardada()
    extra = { situacao: s.problemas.length ? "atencao" : "ok", problemas: s.problemas, whatsapp: s.whatsapp, rotinas: s.rotinas, email: s.email }
  } catch {
    extra = { situacao: "atencao", problemas: ["verificacao:falhou"] }
  }

  return NextResponse.json({
    ok: true,
    banco: "ok",
    latenciaMs,
    ...extra,
    versao: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    em: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } })
}
