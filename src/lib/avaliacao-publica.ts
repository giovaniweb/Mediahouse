// As travas da avaliação pública por convite: uma por serviço e um teto por IP.
//
// "Uma por serviço" é conferido em dois lugares, porque cada um cobre o buraco
// do outro: a avaliação guarda a demanda do convite, e a rota recusa se já
// existe avaliação pública daquele profissional por aquele serviço; e o limite
// do banco (consumir_limite_publico) aceita um envio por serviço por dia, o que
// barra dois envios simultâneos que passariam juntos pela primeira conferência.
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { consumirLimitePublico, hashDoIp } from "@/lib/limite-publico"
import { MSG_CONVITE, type TipoProfissional } from "@/lib/convite-avaliacao"

const POR_IP = { max: 10, janelaSeg: 60 * 60 }

export async function servicoJaAvaliado(tipo: TipoProfissional, profissionalId: string, demandaId: string): Promise<boolean> {
  // Avaliação pública nasce sem empresa (organizacaoId nulo), por desenho: é a
  // reputação do profissional na rede. É só entre elas que se procura.
  const where = { demandaId, origem: "qr_publico", organizacaoId: null }
  const existe = tipo === "videomaker"
    ? await prisma.avaliacaoVideomaker.findFirst({ where: { ...where, videomakerId: profissionalId }, select: { id: true } })
    : await prisma.avaliacaoEditor.findFirst({ where: { ...where, editorId: profissionalId }, select: { id: true } })
  return !!existe
}

/** null para seguir; 409 se o serviço já foi avaliado, 429/503 para excesso ou banco fora. */
export async function barrarAvaliacao(headers: Headers, tipo: TipoProfissional, profissionalId: string, demandaId: string): Promise<NextResponse | null> {
  try {
    const ip = await consumirLimitePublico(`avaliar:ip:${hashDoIp(headers) ?? "desconhecido"}`, POR_IP.max, POR_IP.janelaSeg)
    if (!ip) return NextResponse.json({ error: "Muitas avaliações em pouco tempo. Tente de novo mais tarde." }, { status: 429, headers: { "Retry-After": "900" } })
    if (await servicoJaAvaliado(tipo, profissionalId, demandaId)) return NextResponse.json({ error: MSG_CONVITE.usado }, { status: 409 })
    const unico = await consumirLimitePublico(`avaliar:servico:${tipo}:${profissionalId}:${demandaId}`.slice(0, 200), 1, 86400)
    if (!unico) return NextResponse.json({ error: MSG_CONVITE.usado }, { status: 409 })
  } catch (e) {
    console.error("[avaliacao-publica] trava indisponível — avaliação recusada.", (e as Error).message)
    return NextResponse.json({ error: "Não foi possível registrar agora. Tente de novo em alguns minutos." }, { status: 503 })
  }
  return null
}
