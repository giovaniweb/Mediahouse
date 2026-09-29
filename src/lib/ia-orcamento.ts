import { randomUUID } from "node:crypto"
import type { ConsumoIA, Prisma, PrismaClient } from "@prisma/client"
import { comOrg } from "@/lib/org-contexto"

export const PADRAO_IA = { habilitada: true, tokensDia: 100_000, simultaneas: 2, entradaBytes: 32_768, saidaTokens: 4096 } as const
const RESERVA_MS = 60_000, ENVIO_MS = 180_000
export class LimiteIA extends Error {
  constructor(public readonly codigo: "indisponivel" | "entrada" | "orcamento" | "simultaneas" | "reserva") {
    super(({ indisponivel: "A análise de IA está desativada ou indisponível para esta empresa.", entrada: "O conteúdo excede o limite permitido para análise de IA.", orcamento: "O limite diário de IA foi atingido. O relatório de dados continua disponível.", simultaneas: "Há análises de IA em andamento. Aguarde antes de solicitar outra.", reserva: "Esta autorização de IA expirou ou já foi utilizada." })[codigo])
  }
}
export type ContextoConsumoIA = { organizacaoId: string; usuarioId: string; finalidade: string }
export type ReservaIA = { id: string; organizacaoId: string; token: string }
export type UsoIA = { entrada: number; saida: number; cacheLeitura: number | null; cacheEscrita: number | null; provedorId: string }
type Tx = Prisma.TransactionClient
const ref = (r: ConsumoIA): ReservaIA => ({ id: r.id, organizacaoId: r.organizacaoId, token: r.token })

/** Serviço interno. Contexto vem da autorização do servidor, nunca de um body público. */
export function criarOrcamentoIA(db: PrismaClient) {
  const transacao = <T>(org: string, fn: (tx: Tx, data: Date, empresa: { ativo: boolean; ambienteTeste: boolean }) => Promise<T>) => comOrg(org, () => db.$transaction(async tx => {
    // Todas as transições usam o mesmo lock. A rede sempre ocorre fora dele.
    const [empresa] = await tx.$queryRaw<{ ativo: boolean; ambienteTeste: boolean }[]>`SELECT ativo, "ambienteTeste" FROM organizacoes WHERE id=${org} FOR UPDATE`
    if (!empresa) throw new LimiteIA("indisponivel")
    const [r] = await tx.$queryRaw<{ data: Date }[]>`SELECT (clock_timestamp() AT TIME ZONE 'UTC') AS data`
    return fn(tx, r.data, empresa)
  }))
  const politica = async (tx: Tx, organizacaoId: string) => (await tx.politicaIA.findUnique({ where: { organizacaoId } })) ?? PADRAO_IA
  async function limpar(tx: Tx, organizacaoId: string, data: Date) {
    await tx.consumoIA.updateMany({ where: { organizacaoId, estado: "reservado", expiraEm: { lte: data } }, data: { estado: "liberado", debitoTokens: 0, concluidoEm: data } })
    // Timeout depois do checkpoint não prova ausência de cobrança. Mantém débito.
    await tx.consumoIA.updateMany({ where: { organizacaoId, estado: "enviando", expiraEm: { lte: data } }, data: { estado: "desconhecido" } })
  }
  async function membro(tx: Tx, organizacaoId: string, usuarioId: string) {
    return !!await tx.usuarioOrganizacao.findFirst({ where: { organizacaoId, usuarioId, usuario: { status: "ativo" } }, select: { usuarioId: true } })
  }
  async function obter(tx: Tx, r: ReservaIA) {
    const consumo = await tx.consumoIA.findFirst({ where: { id: r.id, organizacaoId: r.organizacaoId, token: r.token } })
    if (!consumo) throw new LimiteIA("reserva")
    return consumo
  }
  const periodo = (data: Date) => new Date(`${data.toISOString().slice(0, 10)}T00:00:00Z`)
  async function saldo(tx: Tx, organizacaoId: string, data: Date) {
    // Incertezas de dias anteriores continuam comprometendo orçamento até conciliação.
    const r = await tx.consumoIA.aggregate({ where: { organizacaoId, OR: [{ periodo: periodo(data) }, { estado: { in: ["reservado", "enviando", "desconhecido"] } }] }, _sum: { debitoTokens: true } })
    return r._sum.debitoTokens ?? 0
  }
  return {
    async reservar(c: ContextoConsumoIA, modelo: string, entradaBytes: number, limiteSaida: number, documento?: { limiteEntradaTokens: number }) {
      if (!c.organizacaoId || !c.usuarioId || !/^[a-z][a-z0-9_.-]{1,79}$/.test(c.finalidade) || !/^[a-zA-Z0-9_.-]{1,80}$/.test(modelo)) throw new LimiteIA("indisponivel")
      if (!Number.isInteger(entradaBytes) || entradaBytes < 1 || entradaBytes > 65536 || !Number.isInteger(limiteSaida) || limiteSaida < 1 || limiteSaida > 8192) throw new LimiteIA("entrada")
      if (documento && (!Number.isInteger(documento.limiteEntradaTokens) || documento.limiteEntradaTokens < 1 || documento.limiteEntradaTokens > 32768)) throw new LimiteIA("entrada")
      return transacao(c.organizacaoId, async (tx, data, empresa) => {
        const p = await politica(tx, c.organizacaoId)
        if (!empresa.ativo || empresa.ambienteTeste || !p.habilitada || !await membro(tx, c.organizacaoId, c.usuarioId)) throw new LimiteIA("indisponivel")
        if (entradaBytes > p.entradaBytes || limiteSaida > p.saidaTokens) throw new LimiteIA("entrada")
        await limpar(tx, c.organizacaoId, data)
        // Texto usa bytes UTF-8. Documento usa teto próprio reservado antes da contagem remota.
        // entradaBytes registra apenas o prompt textual; tamanho binário é limitado pelo adaptador PDF.
        // Uso acima da reserva é contabilizado integralmente, nunca truncado ao teto.
        const reservaTokens = (documento?.limiteEntradaTokens ?? entradaBytes) + limiteSaida + 1024
        if ((await saldo(tx, c.organizacaoId, data)) + reservaTokens > p.tokensDia) throw new LimiteIA("orcamento")
        const ativos = await tx.consumoIA.count({ where: { organizacaoId: c.organizacaoId, OR: [{ estado: { in: ["reservado", "enviando"] } }, { estado: "desconhecido", expiraEm: { gt: data } }] } })
        if (ativos >= p.simultaneas) throw new LimiteIA("simultaneas")
        return ref(await tx.consumoIA.create({ data: { ...c, modelo, entradaBytes, limiteSaida, reservaTokens, debitoTokens: reservaTokens, token: randomUUID(), periodo: periodo(data), expiraEm: new Date(+data + RESERVA_MS) } }))
      })
    },
    async iniciar(r: ReservaIA) {
      return transacao(r.organizacaoId, async (tx, data, empresa) => {
        const consumo = await obter(tx, r), p = await politica(tx, r.organizacaoId)
        if (consumo.estado !== "reservado" || consumo.expiraEm <= data) throw new LimiteIA("reserva")
        if (!empresa.ativo || empresa.ambienteTeste || !p.habilitada || !await membro(tx, r.organizacaoId, consumo.usuarioId)) throw new LimiteIA("indisponivel")
        await limpar(tx, r.organizacaoId, data)
        if (consumo.entradaBytes > p.entradaBytes || consumo.limiteSaida > p.saidaTokens || await saldo(tx, r.organizacaoId, data) > p.tokensDia) throw new LimiteIA("orcamento")
        const ativos = await tx.consumoIA.count({ where: { organizacaoId: r.organizacaoId, estado: { in: ["reservado", "enviando", "desconhecido"] }, expiraEm: { gt: data } } })
        if (ativos > p.simultaneas) throw new LimiteIA("simultaneas")
        await tx.consumoIA.update({ where: { id: r.id, organizacaoId: r.organizacaoId }, data: { estado: "enviando", iniciadoEm: data, expiraEm: new Date(+data + ENVIO_MS) } })
      })
    },
    async liberar(r: ReservaIA) {
      return transacao(r.organizacaoId, async (tx, data) => {
        const consumo = await obter(tx, r)
        if (consumo.estado === "liberado") return
        if (consumo.estado !== "reservado") throw new LimiteIA("reserva")
        await tx.consumoIA.update({ where: { id: r.id, organizacaoId: r.organizacaoId }, data: { estado: "liberado", debitoTokens: 0, concluidoEm: data } })
      })
    },
    async desconhecido(r: ReservaIA) {
      return transacao(r.organizacaoId, async tx => {
        const consumo = await obter(tx, r)
        if (consumo.estado === "desconhecido" || consumo.estado === "concluido") return
        if (consumo.estado !== "enviando") throw new LimiteIA("reserva")
        await tx.consumoIA.update({ where: { id: r.id, organizacaoId: r.organizacaoId }, data: { estado: "desconhecido" } })
      })
    },
    async reconciliar(r: ReservaIA, uso: UsoIA) {
      const valores = [uso.entrada, uso.saida, uso.cacheLeitura ?? 0, uso.cacheEscrita ?? 0]
      const total = valores.reduce((a, b) => a + b, 0)
      if (valores.some(v => !Number.isInteger(v) || v < 0) || total > 2_000_000_000 || !uso.provedorId || uso.provedorId.length > 128) throw new Error("Uso de IA inválido")
      return transacao(r.organizacaoId, async (tx, data) => {
        const consumo = await obter(tx, r)
        if (consumo.estado === "concluido") {
          if (consumo.entradaTokens !== uso.entrada || consumo.saidaTokens !== uso.saida || consumo.cacheLeituraTokens !== uso.cacheLeitura || consumo.cacheEscritaTokens !== uso.cacheEscrita || consumo.provedorId !== uso.provedorId) throw new Error("Conciliação de IA divergente")
          return // Repetição da mesma evidência não cobra novamente.
        }
        if (!["enviando", "desconhecido"].includes(consumo.estado) || !consumo.iniciadoEm) throw new LimiteIA("reserva")
        await tx.consumoIA.update({ where: { id: r.id, organizacaoId: r.organizacaoId }, data: { estado: "concluido", debitoTokens: total, entradaTokens: uso.entrada, saidaTokens: uso.saida, cacheLeituraTokens: uso.cacheLeitura, cacheEscritaTokens: uso.cacheEscrita, provedorId: uso.provedorId, concluidoEm: data, duracaoMs: Math.min(2_000_000_000, Math.max(0, +data - +consumo.iniciadoEm)) } })
      })
    },
    async resumo(organizacaoId: string) {
      return transacao(organizacaoId, async (tx, data, empresa) => {
        await limpar(tx, organizacaoId, data)
        const p = await politica(tx, organizacaoId), comprometidos = await saldo(tx, organizacaoId, data)
        const medido = await tx.consumoIA.aggregate({ where: { organizacaoId, periodo: periodo(data), estado: "concluido" }, _sum: { debitoTokens: true } })
        const pendente = await tx.consumoIA.aggregate({ where: { organizacaoId, estado: { in: ["reservado", "enviando", "desconhecido"] } }, _sum: { debitoTokens: true }, _count: true })
        const desconhecido = await tx.consumoIA.aggregate({ where: { organizacaoId, estado: "desconhecido" }, _sum: { debitoTokens: true } })
        return { politica: { habilitada: p.habilitada, tokensDia: p.tokensDia, simultaneas: p.simultaneas, entradaBytes: p.entradaBytes, saidaTokens: p.saidaTokens }, habilitadaEfetiva: empresa.ativo && !empresa.ambienteTeste && p.habilitada, periodoUTC: periodo(data).toISOString().slice(0, 10), tokensMedidos: medido._sum.debitoTokens ?? 0, tokensComprometidos: comprometidos, tokensPendentes: pendente._sum.debitoTokens ?? 0, tokensResultadoDesconhecido: desconhecido._sum.debitoTokens ?? 0, chamadasPendentes: pendente._count, tokensDisponiveis: Math.max(0, p.tokensDia - comprometidos), custoMonetario: null, precificacao: "desconhecida" as const }
      })
    },
  }
}
