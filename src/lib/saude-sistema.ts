// O que /api/health confere além do banco (Onda 1, 07/10/2026).
//
// A página de saúde só testava o banco: o WhatsApp podia passar o dia sem
// enviar, um aviso automático parar de rodar, e ninguém sabia até um cliente
// reclamar. Aqui entram os sinais que um monitor externo (UptimeRobot) precisa
// para avisar no celular, todos agregados: nenhum nome de empresa, contagem de
// negócio, telefone ou texto de mensagem sai daqui.
import { prisma } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { comOrg } from "@/lib/org-contexto"
import { cadenciaMinutos } from "@/lib/automacoes-saude"
import { statusEmailGlobal } from "@/lib/email"

/** Cadência de cada rotina, em minutos, tirada do vercel.json (o pior intervalo entre duas rodadas). */
export const CADENCIAS_PADRAO: Record<string, number> = {
  "whatsapp-inbox": 5,
  "agentes:lembretes": 10,
  "agentes:alertas": 1440,
  "agentes:cobranca": 1440,
  "agentes:briefing": 1440,
  "agentes:limpeza": 1440,
  "agentes:prazos": 3 * 1440, // seg, qua e sex: de sexta a segunda são 3 dias
  "agentes:vistoria": 7 * 1440,
}

/** Sem rodada nenhuma registrada, só a do WhatsApp é problema: as outras podem não ter tido o que fazer ainda. */
const ROTINAS_QUE_NAO_PODEM_FALTAR = new Set(["whatsapp-inbox"])

export type EstadoRotina = "ok" | "atrasada" | "erro" | "sem_registro"
export type EstadoWhatsapp = "ok" | "parada" | "falhas" | "sem_configuracao"

/** Atrasada depois de duas cadências mais meia hora de folga (a Vercel não roda cron no segundo exato). */
export function estadoDaRotina(ultima: { createdAt: Date; status: string } | null, cadencia: number, agora = Date.now()): EstadoRotina {
  if (!ultima) return "sem_registro"
  if (agora - ultima.createdAt.getTime() > (cadencia * 2 + 30) * 60000) return "atrasada"
  if (ultima.status === "erro") return "erro"
  return "ok"
}

const QUINZE_MIN = 15 * 60000
const FALHAS_PARA_ALERTA = 3

async function empresasAtivas(): Promise<string[]> {
  const orgs = await prismaAuth.organizacao.findMany({ where: { ativo: true }, select: { id: true }, take: 100 })
  return orgs.map((o) => o.id)
}

export async function conferirSaude(agora = new Date()) {
  const orgs = await empresasAtivas()
  const ultimas = new Map<string, { createdAt: Date; status: string }>()
  let whatsappConfigurado = false
  let filaParada = false
  let falhasRecentes = 0

  for (const org of orgs) {
    await comOrg(org, async () => {
      const [cfg, parada, falhas, batidas] = await Promise.all([
        prisma.configWhatsapp.findUnique({ where: { organizacaoId: org }, select: { ativo: true } }),
        // Mensagem esperando há mais de 15 minutos, sem pausa, sem nova tentativa marcada para depois e ainda válida.
        prisma.saidaWhatsapp.findFirst({
          where: {
            organizacaoId: org, estado: "aguardando", pausada: false,
            createdAt: { lt: new Date(agora.getTime() - QUINZE_MIN) },
            expiraEm: { gt: agora },
            OR: [{ proximaTentativa: null }, { proximaTentativa: { lt: new Date(agora.getTime() - QUINZE_MIN) } }],
          },
          select: { id: true },
        }),
        prisma.saidaWhatsapp.count({
          where: { organizacaoId: org, estado: { in: ["falhou", "desconhecido", "expirado"] }, updatedAt: { gt: new Date(agora.getTime() - 60 * 60000) } },
        }),
        prisma.agenteExecucao.findMany({
          where: { organizacaoId: org, agente: { in: Object.keys(CADENCIAS_PADRAO).map((c) => `heartbeat:${c}`) } },
          orderBy: { createdAt: "desc" },
          distinct: ["agente"],
          select: { agente: true, createdAt: true, status: true },
        }),
      ])
      if (cfg?.ativo) whatsappConfigurado = true
      if (cfg?.ativo && parada) filaParada = true
      falhasRecentes += falhas
      for (const b of batidas) {
        const nome = b.agente.replace(/^heartbeat:/, "")
        const atual = ultimas.get(nome)
        if (!atual || b.createdAt > atual.createdAt) ultimas.set(nome, { createdAt: b.createdAt, status: b.status })
      }
    })
  }

  const rotinas: Record<string, EstadoRotina> = {}
  for (const [nome, padrao] of Object.entries(CADENCIAS_PADRAO)) {
    rotinas[nome] = estadoDaRotina(ultimas.get(nome) ?? null, cadenciaMinutos(nome) ?? padrao, agora.getTime())
  }
  const whatsapp: EstadoWhatsapp = !whatsappConfigurado ? "sem_configuracao"
    : filaParada ? "parada"
    : falhasRecentes >= FALHAS_PARA_ALERTA ? "falhas"
    : "ok"
  const email = statusEmailGlobal().ativo ? "configurado" : "ausente"

  const problemas = [
    ...(whatsapp === "parada" || whatsapp === "falhas" ? [`whatsapp:${whatsapp}`] : []),
    ...Object.entries(rotinas)
      .filter(([nome, e]) => e === "atrasada" || e === "erro" || (e === "sem_registro" && ROTINAS_QUE_NAO_PODEM_FALTAR.has(nome)))
      .map(([nome, e]) => `${nome}:${e}`),
    ...(email === "ausente" ? ["email:ausente"] : []),
  ]
  return { whatsapp, rotinas, email, problemas }
}
