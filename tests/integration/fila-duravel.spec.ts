import { randomUUID } from "node:crypto"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("@/lib/auth", () => ({ auth: async () => null }))
import { prismaBase as db } from "@/lib/prisma"
import { criarFila, enfileirar, type LeaseJob } from "@/lib/fila-duravel"
import { recuperarExecucoesDuravel } from "@/lib/fila-manutencao"
const p = `fila-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`
const fila = criarFila(db)
const lease = (j: { id: string; organizacaoId: string; leaseToken: string | null }): LeaseJob => ({ ...j, leaseToken: j.leaseToken! })
const entrada = (chave: string = randomUUID(), org = a) => ({ organizacaoId: org, tipo: "teste.local", referencia: org, chave, expiraEm: new Date(Date.now()+3_600_000) })
const criar = (chave?: string, org?: string) => db.$transaction(tx => enfileirar(tx,entrada(chave,org)))
beforeAll(async () => { await db.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) }) })
beforeEach(async () => {
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: { in: [a,b] } } })
  await db.organizacao.updateMany({ where: { id: { in: [a,b] } }, data: { ativo: true } })
})
afterAll(async () => { await db.organizacao.deleteMany({ where: { id: { in: [a,b] } } }); await db.$disconnect() })
describe("fila durável em PostgreSQL", () => {
  it("dois consumidores não recebem o mesmo lease; limite vale entre processos e por empresa", async () => {
    for (let i=0;i<4;i++) await criar()
    await criar(undefined,b)
    const [x,y,z] = await Promise.all([fila.reivindicar(a,2),fila.reivindicar(a,2),fila.reivindicar(b,2)])
    expect(x.length+y.length).toBe(2)
    expect(new Set([...x,...y].map(j=>j.id)).size).toBe(2)
    expect(z).toHaveLength(1)
    expect(await fila.reivindicar(a)).toEqual([])
  })
  it("duplicata concorrente cria uma intenção e preserva dados originais", async () => {
    const e = entrada("duplicata")
    const [x,y] = await Promise.all([db.$transaction(tx=>enfileirar(tx,e)),db.$transaction(tx=>enfileirar(tx,e))])
    expect(x.id).toBe(y.id)
    const repetido = await db.$transaction(tx=>enfileirar(tx,{...e,versao:2,payload:{novo:true}}))
    expect(repetido.versao).toBe(1); expect(repetido.payload).toEqual({})
    expect(await db.eventoJob.count({where:{jobId:x.id}})).toBe(1)
    expect((await criar("duplicata",b)).id).not.toBe(x.id)
  })
  it("rollback do produtor desfaz negócio e intenção juntos", async () => {
    const antes = await db.organizacao.findUniqueOrThrow({where:{id:a}})
    await expect(db.$transaction(async tx=>{
      await tx.organizacao.update({where:{id:a},data:{nome:"rollback"}})
      await enfileirar(tx,entrada("rollback"))
      throw new Error("rollback")
    })).rejects.toThrow("rollback")
    expect((await db.organizacao.findUniqueOrThrow({where:{id:a}})).nome).toBe(antes.nome)
    expect(await db.jobAutomacao.count({where:{organizacaoId:a}})).toBe(0)
  })
  it("reinício retoma lease vencido; worker antigo não conclui, renova ou agenda retry", async () => {
    await criar()
    const [antigo] = await fila.reivindicar(a)
    await db.jobAutomacao.update({where:{id:antigo.id},data:{leaseAte:new Date(0)}})
    const [novo] = await criarFila(db).reivindicar(a)
    expect(novo.id).toBe(antigo.id); expect(novo.leaseToken).not.toBe(antigo.leaseToken); expect(novo.tentativas).toBe(2)
    const efeito = vi.fn()
    expect(await fila.concluirLocal(lease(antigo),efeito)).toBe(false)
    expect(await fila.renovar(lease(antigo))).toBe(false)
    expect(await fila.falhar(lease(antigo))).toBe(false)
    expect(efeito).not.toHaveBeenCalled()
    expect(await fila.concluirLocal(lease(novo),async()=>{})).toBe(true)
    expect(await db.eventoJob.count({where:{jobId:novo.id,evento:"lease_vencido"}})).toBe(1)
  })
  it("efeito local e conclusão são atômicos e não repetem pela mesma chave", async () => {
    await criar("efeito")
    const [j] = await fila.reivindicar(a)
    const executar = async(tx: Parameters<Parameters<typeof fila.concluirLocal>[1]>[0])=>{
      await tx.$executeRaw`UPDATE organizacoes SET nome=nome || ${"-efeito"} WHERE id=${a}`
    }
    const antes = (await db.organizacao.findUniqueOrThrow({where:{id:a}})).nome
    expect((await Promise.all([fila.concluirLocal(lease(j),executar),fila.concluirLocal(lease(j),executar)])).sort()).toEqual([false,true])
    await criar("efeito")
    expect(await fila.reivindicar(a)).toEqual([]); expect((await db.organizacao.findUniqueOrThrow({where:{id:a}})).nome).toBe(antes+"-efeito")
  })
  it("erro no efeito desfaz escrita e deixa lease recuperável", async () => {
    await criar()
    const [j] = await fila.reivindicar(a)
    const antes = await db.organizacao.findUniqueOrThrow({where:{id:a}})
    await expect(fila.concluirLocal(lease(j),async tx=>{
      await tx.organizacao.update({where:{id:a},data:{nome:"nao-confirmar"}})
      throw new Error("segredo-provedor")
    })).rejects.toThrow()
    expect((await db.organizacao.findUniqueOrThrow({where:{id:a}})).nome).toBe(antes.nome)
    await fila.falhar(lease(j))
    const r = await db.jobAutomacao.findUniqueOrThrow({where:{id:j.id}})
    expect(r.estado).toBe("pendente"); expect(r.erro).toBe("falha_temporaria")
    expect(r.agendadoPara.getTime()).toBeGreaterThan(Date.now()+25_000)
    expect(JSON.stringify(await db.eventoJob.findMany({where:{jobId:j.id}}))).not.toContain("segredo")
    expect(await fila.reivindicar(a)).toEqual([])
  })
  it("empresa inativa e validade expirada impedem claim e efeito", async () => {
    const expirado = await criar()
    await db.jobAutomacao.update({where:{id:expirado.id},data:{expiraEm:new Date(0)}})
    expect(await fila.reivindicar(a)).toEqual([])
    expect((await db.jobAutomacao.findUniqueOrThrow({where:{id:expirado.id}})).estado).toBe("expirado")
    await criar()
    const [j] = await fila.reivindicar(a)
    await db.organizacao.update({where:{id:a},data:{ativo:false}})
    const efeito = vi.fn()
    expect(await fila.concluirLocal(lease(j),efeito)).toBe(false); expect(efeito).not.toHaveBeenCalled()
    expect((await db.jobAutomacao.findUniqueOrThrow({where:{id:j.id}})).estado).toBe("cancelado")
    const pendente = await criar()
    expect(await fila.reivindicar(a)).toEqual([])
    expect((await db.jobAutomacao.findUniqueOrThrow({where:{id:pendente.id}})).estado).toBe("cancelado")
  })
  it("expiração após claim impede efeito e renovação", async () => {
    await criar(); const [j] = await fila.reivindicar(a)
    await db.jobAutomacao.update({where:{id:j.id},data:{expiraEm:new Date(0)}})
    expect(await fila.renovar(lease(j))).toBe(false)
    expect(await fila.concluirLocal(lease(j),async()=>{throw new Error("não executar")})).toBe(false)
    expect((await db.jobAutomacao.findUniqueOrThrow({where:{id:j.id}})).estado).toBe("expirado")
  })
  it("renova lease vigente; cancelamento conserva histórico e impede efeito", async () => {
    await criar(); const [j] = await fila.reivindicar(a)
    await db.jobAutomacao.update({where:{id:j.id},data:{leaseAte:new Date(Date.now()+10_000)}})
    expect(await fila.renovar(lease(j))).toBe(true)
    expect((await db.jobAutomacao.findUniqueOrThrow({where:{id:j.id}})).leaseAte!.getTime()).toBeGreaterThan(Date.now()+50_000)
    expect(await fila.cancelar(b,j.id)).toBe(false)
    expect(await fila.cancelar(a,j.id)).toBe(true)
    expect(await fila.concluirLocal(lease(j),async()=>{throw new Error("não executar")})).toBe(false)
    expect(await db.eventoJob.count({where:{jobId:j.id}})).toBe(3)
  })
  it("última tentativa e falha permanente não entram em repetição", async () => {
    await db.$transaction(tx=>enfileirar(tx,{...entrada(),maxTentativas:1}))
    const [j] = await fila.reivindicar(a)
    await db.jobAutomacao.update({where:{id:j.id},data:{leaseAte:new Date(0)}})
    expect(await fila.reivindicar(a)).toEqual([])
    expect((await db.jobAutomacao.findUniqueOrThrow({where:{id:j.id}})).erro).toBe("tentativas_esgotadas")
    await criar(); const [k] = await fila.reivindicar(a)
    await fila.falhar(lease(k),"objeto_invalido",false)
    expect((await db.jobAutomacao.findUniqueOrThrow({where:{id:k.id}})).estado).toBe("falhou")
  })
  it("lease que vence durante o efeito causa rollback da escrita local", async () => {
    await criar(); const [j] = await fila.reivindicar(a)
    await db.jobAutomacao.update({where:{id:j.id},data:{leaseAte:new Date(Date.now()+500)}})
    const antes = (await db.organizacao.findUniqueOrThrow({where:{id:a}})).nome
    await expect(fila.concluirLocal(lease(j),async tx=>{
      await tx.organizacao.update({where:{id:a},data:{nome:"não-persistir"}})
      await tx.$executeRaw`SELECT pg_sleep(0.6)`
    })).rejects.toThrow("Lease não vigente")
    expect((await db.organizacao.findUniqueOrThrow({where:{id:a}})).nome).toBe(antes)
    expect((await db.jobAutomacao.findUniqueOrThrow({where:{id:j.id}})).estado).toBe("executando")
  })
  it("retries respeitam limite e motivos não aceitam erro bruto", async () => {
    await criar()
    for (let n=1;n<=5;n++) {
      const [j] = await fila.reivindicar(a)
      expect(j.tentativas).toBe(n)
      // @ts-expect-error prova de validação de entrada em runtime
      await expect(fila.falhar(lease(j),"token-secreto")).rejects.toThrow("Motivo de fila inválido")
      await fila.falhar(lease(j))
      const r = await db.jobAutomacao.findUniqueOrThrow({where:{id:j.id}})
      expect(r.estado).toBe(n===5 ? "falhou" : "pendente")
      if(n<5) await db.jobAutomacao.update({where:{id:j.id},data:{agendadoPara:new Date(0)}})
    }
    expect(await fila.reivindicar(a)).toEqual([])
  })
  it("trabalho futuro e tipo de outro consumidor não são reivindicados", async () => {
    await db.$transaction(tx=>enfileirar(tx,{...entrada(),agendadoPara:new Date(Date.now()+60_000)}))
    await criar()
    expect(await fila.reivindicar(a,1,["outro.tipo"])).toEqual([])
    expect(await fila.reivindicar(a,2,["teste.local"])).toHaveLength(1)
  })
  it("manutenção real revalida estado, não toca empresa vizinha e não repete intenção", async () => {
    const exec = await db.agenteExecucao.create({data:{organizacaoId:a,agente:"teste",status:"executando",createdAt:new Date(Date.now()-3_600_000)}})
    const viz = await db.agenteExecucao.create({data:{organizacaoId:b,agente:"teste",status:"executando",createdAt:new Date(Date.now()-3_600_000)}})
    const recente = await db.agenteExecucao.create({data:{organizacaoId:a,agente:"teste",status:"executando"}})
    try {
      expect((await recuperarExecucoesDuravel(a)).concluidos).toBe(1)
      expect((await recuperarExecucoesDuravel(a)).reivindicados).toBe(0)
      expect((await db.agenteExecucao.findUniqueOrThrow({where:{id:exec.id}})).status).toBe("erro")
      expect((await db.agenteExecucao.findUniqueOrThrow({where:{id:viz.id}})).status).toBe("executando")
      expect((await db.agenteExecucao.findUniqueOrThrow({where:{id:recente.id}})).status).toBe("executando")
    } finally { await db.agenteExecucao.deleteMany({where:{id:{in:[exec.id,viz.id,recente.id]}}}) }
  })
})
