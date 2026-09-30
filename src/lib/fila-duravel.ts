import { randomUUID } from "node:crypto"
import { Prisma, type PrismaClient, type JobAutomacao } from "@prisma/client"
import { comOrg } from "@/lib/org-contexto"

type Tx = Prisma.TransactionClient
export type LeaseJob = Pick<JobAutomacao, "id" | "organizacaoId"> & { leaseToken: string }
export const LIMITE_POR_EMPRESA = 2
const LEASE_MS = 60_000
const MOTIVOS = ["falha_temporaria", "tipo_desconhecido", "objeto_invalido", "cancelado", "tentativas_esgotadas", "empresa_inativa", "validade_expirada"] as const
export type MotivoJob = typeof MOTIVOS[number]
export class LeasePerdido extends Error { constructor() { super("Lease não vigente") } }
const validarMotivo = (m: MotivoJob) => { if (!MOTIVOS.includes(m)) throw new Error("Motivo de fila inválido"); return m }
async function agora(tx: Tx) {
  const [r] = await tx.$queryRaw<{ agora: Date }[]> `SELECT (clock_timestamp() AT TIME ZONE 'UTC') AS agora`
  return r.agora
}
// Mesmo lock em claim, cancelamento e conclusão: limita workers entre processos,
// e impede pausa da empresa no meio do efeito local. Nunca manter durante rede.
async function empresa(tx: Tx, organizacaoId: string) {
  const [r] = await tx.$queryRaw<{ ativo: boolean }[]>`SELECT ativo FROM organizacoes WHERE id=${organizacaoId} FOR UPDATE`
  return r?.ativo === true
}
async function evento(tx: Tx, j: JobAutomacao, nome: string, motivo?: MotivoJob) {
  await tx.eventoJob.create({ data: { organizacaoId: j.organizacaoId, jobId: j.id, tentativa: j.tentativas, evento: nome, motivo } })
}
async function encerrar(tx: Tx, j: JobAutomacao, estado: string, motivo: MotivoJob | null, data: Date) {
  await tx.jobAutomacao.update({ where: { id: j.id, organizacaoId: j.organizacaoId }, data: {
    estado, erro: motivo, leaseToken: null, leaseAte: null, finishedAt: data,
  } })
  await evento(tx,j,estado,motivo ?? undefined)
}

/** Chame dentro da MESMA transação da mutação de negócio. Só referências, sem segredos/textos livres.
 * Duplicata devolve a intenção original; não altera payload, versão ou validade de job existente.
 */
export async function enfileirar(tx: Tx, entrada: {
  organizacaoId: string; tipo: string; versao?: number; referencia: string; chave: string;
  payload?: Record<string, string | number | boolean>; agendadoPara?: Date; expiraEm: Date; maxTentativas?: number
}) {
  const { organizacaoId, tipo, referencia, chave, expiraEm } = entrada
  const versao = entrada.versao ?? 1, maxTentativas = entrada.maxTentativas ?? 5, payload = entrada.payload ?? {}
  if (!organizacaoId || !/^[a-z][a-z0-9_.-]{1,79}$/.test(tipo) || !referencia || referencia.length > 128 || !chave || chave.length > 128 ||
      !Number.isSafeInteger(versao) || versao < 1 || !Number.isInteger(maxTentativas) || maxTentativas < 1 || maxTentativas > 5 ||
      !Number.isFinite(expiraEm.getTime()) || Buffer.byteLength(JSON.stringify(payload)) > 2048 ||
      Object.entries(payload).some(([k,v]) => !/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(k) ||
        (typeof v !== "string" && typeof v !== "boolean" && !(typeof v === "number" && Number.isFinite(v))) ||
        (typeof v === "string" && v.length > 128))) throw new Error("Intenção inválida")
  const agoraDb = await agora(tx), agendadoPara = entrada.agendadoPara ?? agoraDb
  if (!Number.isFinite(agendadoPara.getTime()) || expiraEm <= agendadoPara) throw new Error("Validade inválida")
  const id = randomUUID()
  // ON CONFLICT evita abortar a transação do produtor numa duplicata concorrente.
  const criado = await tx.jobAutomacao.createMany({ data: { id, organizacaoId, tipo, referencia, chave, payload, versao, expiraEm, agendadoPara, maxTentativas }, skipDuplicates: true })
  const j = await tx.jobAutomacao.findUniqueOrThrow({ where: { organizacaoId_tipo_chave: { organizacaoId, tipo, chave } } })
  if (criado.count) await evento(tx,j,"pendente")
  return j
}

/** Serviço interno. org vem do servidor, nunca diretamente de payload público. */
export function criarFila(db: PrismaClient) {
  const transacao = <T>(org: string, fn: (tx: Tx) => Promise<T>) => comOrg(org, () => db.$transaction(fn))
  async function vigente(tx: Tx, lease: LeaseJob) {
    const ativo = await empresa(tx,lease.organizacaoId)
    const [j] = await tx.$queryRaw<JobAutomacao[]>`SELECT * FROM jobs_automacao WHERE id=${lease.id} AND "organizacaoId"=${lease.organizacaoId} FOR UPDATE`
    const data = await agora(tx)
    if (!j || j.estado !== "executando" || j.leaseToken !== lease.leaseToken || !j.leaseAte || j.leaseAte <= data) return null
    if (!ativo || j.expiraEm <= data) {
      await encerrar(tx,j,!ativo ? "cancelado" : "expirado",!ativo ? "empresa_inativa" : "validade_expirada",data)
      return null
    }
    return { j, data }
  }
  return {
    async reivindicar(organizacaoId: string, limite = 1, tipos?: string[], tetoEmpresa = LIMITE_POR_EMPRESA) {
      if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_POR_EMPRESA) throw new Error("Lote inválido")
      if (!Number.isInteger(tetoEmpresa) || tetoEmpresa < 1 || tetoEmpresa > LIMITE_POR_EMPRESA) throw new Error("Teto inválido")
      return transacao(organizacaoId, async tx => {
        const ativo = await empresa(tx,organizacaoId), data = await agora(tx)
        // Manutenção limitada; retomadas seguintes drenam o restante sem perder jobs.
        const vencidos = await tx.jobAutomacao.findMany({ where: { organizacaoId, estado: { in: ["pendente","executando"] },
          ...(ativo ? { OR: [{ expiraEm: { lte: data } }, { estado: "executando", leaseAte: { lte: data } }] } : {}) },
          orderBy: [{ agendadoPara: "asc" },{ id: "asc" }], take: 50 })
        for (const j of vencidos) {
          if (!ativo || j.expiraEm <= data || j.tentativas >= j.maxTentativas) {
            await encerrar(tx,j,!ativo ? "cancelado" : j.expiraEm <= data ? "expirado" : "falhou",
              !ativo ? "empresa_inativa" : j.expiraEm <= data ? "validade_expirada" : "tentativas_esgotadas",data)
          } else {
            await tx.jobAutomacao.update({ where: { id: j.id, organizacaoId }, data: { estado: "pendente", leaseAte: null, leaseToken: null } })
            await evento(tx,j,"lease_vencido")
          }
        }
        if (!ativo) return []
        const emCurso = await tx.jobAutomacao.count({ where: { organizacaoId, estado: "executando", leaseAte: { gt: data }, expiraEm: { gt: data } } })
        const quantidade = Math.min(limite, tetoEmpresa-emCurso)
        if (quantidade <= 0) return []
        const candidatos = await tx.$queryRaw<JobAutomacao[]>`
          SELECT * FROM jobs_automacao WHERE "organizacaoId"=${organizacaoId} AND estado='pendente'
          AND (${tipos === undefined} OR tipo IN (${Prisma.join(tipos?.length ? tipos : [""])}))
          AND "agendadoPara"<=${data} AND "expiraEm">${data} AND tentativas<"maxTentativas"
          ORDER BY "agendadoPara",id LIMIT ${quantidade} FOR UPDATE SKIP LOCKED`
        const jobs: JobAutomacao[] = []
        for (const j of candidatos) {
          const novo = await tx.jobAutomacao.update({ where: { id: j.id, organizacaoId }, data: { estado: "executando",
            tentativas: { increment: 1 }, leaseToken: randomUUID(), leaseAte: new Date(Math.min(data.getTime()+LEASE_MS,j.expiraEm.getTime())) } })
          await evento(tx,novo,"executando")
          jobs.push(novo)
        }
        return jobs
      })
    },
    async comLease<T>(lease: LeaseJob, efeito: (tx: Tx, job: JobAutomacao) => Promise<T>) {
      return transacao(lease.organizacaoId, async tx => {
        const v = await vigente(tx,lease)
        if (!v) return null
        const resultado = await efeito(tx,v.j)
        const fim = await agora(tx)
        if(v.j.leaseAte! <= fim || v.j.expiraEm <= fim) throw new LeasePerdido()
        return resultado
      })
    },
    async renovar(lease: LeaseJob) {
      return transacao(lease.organizacaoId, async tx => {
        const v = await vigente(tx,lease)
        if (!v) return false
        await tx.jobAutomacao.update({ where: { id: lease.id, organizacaoId: lease.organizacaoId }, data: { leaseAte: new Date(Math.min(v.data.getTime()+LEASE_MS,v.j.expiraEm.getTime())) } })
        return true
      })
    },
    /** Somente efeitos LOCAIS usando tx; rede e LLM são proibidos neste callback.
     * O handler revalida referência/versão/estado de negócio antes de alterar.
     * Efeito e conclusão são atômicos. Se o lease vencer, rollback de ambos.
     */
    async concluirLocal(lease: LeaseJob, efeito: (tx: Tx, job: JobAutomacao) => Promise<void>) {
      return transacao(lease.organizacaoId, async tx => {
        const v = await vigente(tx,lease)
        if (!v) return false
        await efeito(tx,v.j)
        const fim = await agora(tx)
        if (v.j.leaseAte! <= fim || v.j.expiraEm <= fim) throw new LeasePerdido()
        await encerrar(tx,v.j,"concluido",null,fim)
        return true
      })
    },
    async falhar(lease: LeaseJob, motivo: MotivoJob = "falha_temporaria", recuperavel = true) {
      validarMotivo(motivo)
      return transacao(lease.organizacaoId, async tx => {
        const v = await vigente(tx,lease)
        if (!v) return false
        const proxima = new Date(v.data.getTime()+Math.min(900_000,30_000*2**(v.j.tentativas-1)))
        if (!recuperavel || v.j.tentativas >= v.j.maxTentativas || proxima >= v.j.expiraEm) {
          await encerrar(tx,v.j,"falhou",motivo,v.data)
        } else {
          await tx.jobAutomacao.update({ where: { id: lease.id, organizacaoId: lease.organizacaoId }, data: {
            estado: "pendente", erro: motivo, agendadoPara: proxima, leaseAte: null, leaseToken: null,
          } })
          await evento(tx,v.j,"nova_tentativa",motivo)
        }
        return true
      })
    },
    async cancelar(organizacaoId: string, id: string) {
      return transacao(organizacaoId, async tx => {
        await empresa(tx,organizacaoId)
        const j = await tx.jobAutomacao.findFirst({ where: { organizacaoId, id, estado: { in: ["pendente","executando"] } } })
        if (!j) return false
        await encerrar(tx,j,"cancelado","cancelado",await agora(tx))
        return true
      })
    },
  }
}
