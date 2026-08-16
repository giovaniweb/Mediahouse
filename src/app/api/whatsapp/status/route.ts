import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { getOrgId } from "@/lib/org"

// GET /api/whatsapp/status — estado da conexão WhatsApp da organização do usuário logado
export async function GET() {
  const session = await auth()
  const organizacaoId = session ? await getOrgId(session) : null
  const config = organizacaoId
    ? await prisma.configWhatsapp.findFirst({ where: { organizacaoId, ativo: true } })
    : null
  // Avisos que não chegaram nas últimas 24h. Uma queda da instância vira silêncio
  // para quem esperava a mensagem, então o indicador precisa dizer quantas se
  // perderam — não só se a conexão está de pé agora. Vem antes da checagem de
  // config de propósito: empresa sem configuração é justamente a que acumula
  // falhas "sem_config", e sair aqui esconderia todas elas.
  const naoEnviadas = organizacaoId
    ? await prisma.mensagemWhatsapp.count({
        where: {
          organizacaoId,
          direcao: "saida",
          status: { in: ["falhou", "sem_config"] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }).catch(() => 0)
    : 0

  // Quando chegou a última mensagem DE ALGUÉM.
  //
  // `state: "open"` diz só que o servidor da Evolution responde HTTP — não que
  // exista sessão de WhatsApp viva. Foi por acreditar nesse "open" que as
  // respostas dos videomakers ficaram cinco meses mudas sem ninguém notar: a
  // tela dizia "recebendo e respondendo mensagens" enquanto a última entrada
  // real era de 23/03. Silêncio de entrada é o único sinal que não mente.
  const ultimaEntrada = organizacaoId
    ? await prisma.mensagemWhatsapp
        .findFirst({
          where: { organizacaoId, direcao: "entrada" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
        .then((m) => m?.createdAt ?? null)
        .catch(() => null)
    : null

  // A conta de "há quantos dias" sai daqui, e não da tela: no componente ela
  // dependeria de Date.now() durante o render, que é impuro e reprovado pelo lint.
  const diasSemResposta = ultimaEntrada
    ? Math.floor((Date.now() - ultimaEntrada.getTime()) / 86_400_000)
    : null

  // Quantas vezes a instância voltou do zero nas últimas 24h.
  //
  // Cada reinício apaga o histórico da própria Evolution e mata as sessões de
  // criptografia — é a explicação mais provável para mensagens que somem no
  // caminho. Sem este número, mexer no servidor é chutar: não dá para saber se
  // a mudança melhorou alguma coisa.
  const reiniciosEm24h = organizacaoId
    ? await prisma.alertaIA.count({
        where: {
          organizacaoId,
          tipoAlerta: "whatsapp_reconectou",
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }).catch(() => 0)
    : 0

  // Mensagens que a Evolution entregou e o NuFlow recusou. É o ponto cego mais
  // perigoso do caminho de entrada: tudo parece certo dos dois lados e a
  // mensagem morre no meio, sem deixar nada além de um log na Vercel.
  const webhookRejeitado = organizacaoId
    ? await prisma.alertaIA.count({
        where: {
          organizacaoId,
          tipoAlerta: "whatsapp_webhook_rejeitado",
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }).catch(() => 0)
    : 0

  const recebimento = { naoEnviadas, ultimaEntrada, diasSemResposta, reiniciosEm24h, webhookRejeitado }

  if (!config) {
    return NextResponse.json({ connected: false, reason: "no_config", ...recebimento })
  }

  try {
    const res = await fetch(
      `${config.instanceUrl}/instance/connectionState/${config.instanceId}`,
      {
        headers: { apikey: config.apiKey },
        signal: AbortSignal.timeout(5000),
      }
    )

    if (!res.ok) {
      return NextResponse.json({ connected: false, reason: "api_error", status: res.status, ...recebimento })
    }

    const json = await res.json()
    const state = json?.instance?.state ?? "unknown"

    return NextResponse.json({
      connected: state === "open",
      state,
      instanceName: config.instanceId,
      ...recebimento,
    })
  } catch (e) {
    return NextResponse.json({
      connected: false,
      reason: "network_error",
      error: e instanceof Error ? e.message : String(e),
      ...recebimento,
    })
  }
}
