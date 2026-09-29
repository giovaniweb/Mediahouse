import { receberEntrada, processarInbox } from "@/lib/whatsapp-inbox"
import { encryptSecret } from "@/lib/secret-crypto"
import { criarFila, enfileirar } from "@/lib/fila-duravel"
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
vi.mock("@/lib/auth", () => ({ auth: async () => null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { comRls } from "@/lib/prisma-rls"
import { comOrg } from "@/lib/org-contexto"
import { prismaAuth } from "@/lib/prisma-auth"
import { orgPorCredencial } from "@/lib/org-por-credencial"
import { prismaBase } from "@/lib/prisma"
import { criarEstadoDrive, consumirEstadoDrive } from "@/lib/drive-oauth"
import { NextRequest } from "next/server"
import { POST as redefinirSenha } from "@/app/api/auth/redefinir-senha/route"
import { GET as demandaPublica } from "@/app/api/publico/demanda/[token]/route"
import { getOrgId } from "@/lib/org"
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST }) })
// Uma conexão força reuso; duas permitem concorrência real sem pool irrestrito.
const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) })
const db = comRls(base)
const p = `runtime-${randomUUID()}`, a = `${p}-a`, b = `${p}-b`, u = `${p}-u`, da = `${p}-da`, dbid = `${p}-db`
beforeAll(async () => {
  await admin.organizacao.createMany({ data: [a,b].map(id => ({ id, nome: id, slug: id })) })
  await admin.usuario.create({ data: { id: u, nome: "Sintético", email: `${u}@example.invalid`, tipo: "admin", senhaHash: "sem-login-real" } })
  await admin.usuarioOrganizacao.createMany({ data: [a,b].map(organizacaoId => ({ organizacaoId, usuarioId: u, papel: "admin", areas: [] })) })
  await admin.demanda.createMany({ data: [[a,da],[b,dbid]].map(([organizacaoId,id]) => ({ id, organizacaoId, codigo: id, titulo: id, descricao: "Teste", departamento: "growth", tipoVideo: "reels", cidade: "Teste", solicitanteId: u, publicToken: `${id}-token`, publicTokenAtivo: true })) })
  await admin.historicoStatus.createMany({ data: [da,dbid].map(demandaId => ({ demandaId, usuarioId: u, statusNovo: "entrada" })) })
  await admin.arquivo.createMany({ data: [da,dbid].map(demandaId => ({ demandaId, tipoArquivo: "final", nomeArquivo: "Teste", url: "https://example.invalid/video.mp4" })) })
})
afterAll(async () => {
  await admin.organizacao.deleteMany({ where: { id: { in: [a,b] } } })
  await admin.passwordResetToken.deleteMany({ where: { email: `${u}@example.invalid` } })
  await admin.usuario.deleteMany({ where: { id: u } })
  await Promise.all([admin.$disconnect(), base.$disconnect(), prismaAuth.$disconnect(), prismaBase.$disconnect()])
})
describe("Prisma conectado como runtime sem bypass", () => {
  it("conecta com login próprio, sem admin nem ownership", async () => {
    const [r] = await base.$queryRaw<{ current_user: string; session_user: string; rolsuper: boolean; rolbypassrls: boolean; dono: boolean }[]>`SELECT current_user, session_user, rolsuper, rolbypassrls, EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=pg_roles.oid) AS dono FROM pg_roles WHERE rolname=current_user`
    expect(r.current_user).toMatch(/^teste_app_/); expect(r.current_user).toBe(r.session_user)
    expect(r.rolsuper || r.rolbypassrls || r.dono).toBe(false)
  })
  it("nega sem empresa e isola leituras/joins com pool reutilizado", async () => {
    for (let i = 0; i < 4; i++) {
      const [ra,rb] = await Promise.all([a,b].map(org => comOrg(org, () => db.demanda.findMany({ include: { arquivos: true, historicos: true } }))))
      expect(ra.map(d => d.id)).toEqual([da]); expect(rb.map(d => d.id)).toEqual([dbid])
      expect(ra[0].arquivos).toHaveLength(1); expect(ra[0].historicos).toHaveLength(1); expect(ra[0].historicos[0].demandaId).toBe(da)
      expect(await comOrg(null, () => db.demanda.count())).toBe(0)
    }
  })
  it("isola SQL parametrizado e SQL cru sem contexto", async () => {
    expect(await comOrg(a, () => db.$queryRaw<{ id: string }[]>`SELECT id FROM demandas WHERE id IN (${da},${dbid})`)).toEqual([{ id: da }])
    expect(await comOrg(null, () => db.$queryRawUnsafe('SELECT id FROM demandas'))).toEqual([])
  })
  it("declara contexto na transação em lote e preserva ordem dos resultados", async () => {
    const r = await comOrg(a, () => db.$transaction([db.demanda.count(), db.demanda.findMany(), db.$queryRaw`SELECT current_setting('app.org_id',true) AS org`]))
    expect(r[0]).toBe(1); expect(r[1][0].id).toBe(da); expect(r[2]).toEqual([{ org: a }])
  })
  it("callback usa a mesma conexão e rollback desfaz nested writes", async () => {
    await expect(comOrg(a, () => db.$transaction(async tx => {
      expect(await tx.demanda.count()).toBe(1)
      await tx.demanda.update({ where: { id: da }, data: { titulo: "rollback", arquivos: { create: { tipoArquivo: "documento", nomeArquivo: "rollback", url: "https://example.invalid/a" } } } })
      throw new Error("rollback esperado")
    }))).rejects.toThrow("rollback esperado")
    expect((await admin.demanda.findUniqueOrThrow({ where: { id: da } })).titulo).toBe(da)
    expect(await admin.arquivo.count({ where: { demandaId: da } })).toBe(1)
  })
  it("recusa writes e nested writes na outra empresa", async () => {
    await expect(comOrg(a, () => db.demanda.update({ where: { id: dbid }, data: { titulo: "invadido" } }))).rejects.toThrow()
    await expect(comOrg(a, () => db.arquivo.create({ data: { demandaId: dbid, tipoArquivo: "final", nomeArquivo: "invadido", url: "https://example.invalid/a" } }))).rejects.toThrow()
    await expect(comOrg(null, () => db.demanda.update({ where: { id: da }, data: { titulo: "sem contexto" } }))).rejects.toThrow()
  })
  it("consulta global dentro de callback não herda bypass da extensão", async () => {
    await comOrg(a, () => db.$transaction(async tx => {
      expect(await tx.demanda.count()).toBe(1)
      expect(await comOrg(b, () => db.demanda.findMany({ select: { id: true } }))).toEqual([{ id: dbid }])
    }))
  })
  it("auth resolve identidade e empresa mas não lê demanda", async () => {
    expect((await prismaAuth.usuario.findUnique({ where: { id: u } }))?.id).toBe(u)
    expect(await getOrgId({ user: { id: u, organizacaoId: a } })).toBe(a)
    await expect(prismaAuth.demanda.count()).rejects.toThrow()
  })
  it("bootstrap público resolve só empresa e permite callback com escopo", async () => {
    expect(await orgPorCredencial("demanda_publica", `${da}-token`)).toBe(a)
    expect(await orgPorCredencial("demanda_publica", "invalido")).toBeNull()
    expect(await comOrg(a, () => db.demanda.findMany({ select: { id: true } }))).toEqual([{ id: da }])
  })
  it("OAuth consome estado uma única vez e não atravessa empresa", async () => {
    const state = await criarEstadoDrive({ usuarioId: u, organizacaoId: a })
    expect(await comOrg(b, () => db.oAuthDriveEstado.count())).toBe(0)
    expect(await consumirEstadoDrive(state, { usuarioId: u, organizacaoId: b })).toBe(false)
    expect(await consumirEstadoDrive(state, { usuarioId: u, organizacaoId: a })).toBe(true)
    expect(await consumirEstadoDrive(state, { usuarioId: u, organizacaoId: a })).toBe(false)
  })
  it("acompanhamento público funciona pelo handler com runtime restrito", async () => {
    const r = await comOrg(null, () => demandaPublica(new NextRequest("http://localhost/api/publico/demanda/x"), { params: Promise.resolve({ token: `${da}-token` }) }))
    expect(r.status).toBe(200); expect((await r.json()).demanda.codigo).toBe(da)
  })
  it("recuperação de senha funciona sem conceder edição de privilégio", async () => {
    const token = `${p}-reset`
    await prismaAuth.passwordResetToken.create({ data: { email: `${u}@example.invalid`, token, expiresAt: new Date(Date.now()+600000) } })
    const r = await redefinirSenha(new NextRequest("http://localhost/api/auth/redefinir-senha", { method: "POST", body: JSON.stringify({ token, novaSenha: "senha-sintetica-123" }) }))
    expect(r.status).toBe(200)
    expect((await admin.passwordResetToken.findUniqueOrThrow({ where: { token } })).usedAt).not.toBeNull()
    await expect(prismaAuth.usuario.update({ where: { id: u }, data: { superAdmin: true } })).rejects.toThrow()
  })
  it("lote com erro desfaz escrita anterior", async () => {
    await expect(comOrg(a, () => db.$transaction([
      db.demanda.update({ where: { id: da }, data: { titulo: "nao-persistir" } }),
      db.demanda.update({ where: { id: dbid }, data: { titulo: "negado" } }),
    ]))).rejects.toThrow()
    expect((await admin.demanda.findUniqueOrThrow({ where: { id: da } })).titulo).toBe(da)
  })
  it("contexto vazio é declarado mesmo com resíduo na sessão do pool", async () => {
    const unica = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) })
    try {
      await unica.$executeRaw`SELECT set_config('app.org_id', ${a}, false)`
      expect(await unica.demanda.count()).toBe(1)
      const protegida = comRls(unica)
      expect(await comOrg(null, () => protegida.demanda.count())).toBe(0)
      expect(await comOrg(b, () => protegida.demanda.findMany({ select: { id: true } }))).toEqual([{ id: dbid }])
      expect(await comOrg(null, () => protegida.$transaction(tx => tx.demanda.count()))).toBe(0)
    } finally { await unica.$disconnect() }
  })

  it("função de senha recusa token inválido/expirado e corrida consome uma vez", async () => {
    const hash = "$2b$12$" + "a".repeat(53)
    const chamar = (token: string) => prismaAuth.$queryRaw<{ trocou: boolean }[]>`SELECT public.redefinir_senha_por_token(${token},${hash}) AS trocou`
    const token = `${p}-concorrente`, expirado = `${p}-expirado`
    await prismaAuth.passwordResetToken.createMany({ data: [
      { token, email: `${u}@example.invalid`, expiresAt: new Date(Date.now()+600000) },
      { token: expirado, email: `${u}@example.invalid`, expiresAt: new Date(0) },
    ] })
    expect(await chamar("invalido")).toEqual([{ trocou: false }])
    expect(await chamar(expirado)).toEqual([{ trocou: false }])
    const r = await Promise.all([chamar(token),chamar(token)])
    expect(r.flat().filter(v => v.trocou)).toHaveLength(1)
    await expect(base.$queryRaw`SELECT public.redefinir_senha_por_token(${token},${hash})`).rejects.toThrow()
    await expect(prismaAuth.usuario.update({ where: { id: u }, data: { senhaHash: hash } })).rejects.toThrow()
  })
  it("parceria ativa permite espelho; revogação remove acesso no runtime", async () => {
    const parceria = await admin.parceriaOrganizacao.create({ data: { organizacaoConvidanteId: a, organizacaoConvidadaId: b, nomeConvidante: "A", nomeConvidada: "B", status: "aceita", criadoPorId: u } })
    try {
      const edge = await admin.demandaCompartilhamento.create({ data: { demandaId: da, organizacaoOrigemId: a, organizacaoDestinoId: b, nomeOrigem: "A", nomeDestino: "B", criadoPorId: u } })
      expect(await comOrg(b, () => db.demanda.findUnique({ where: { id: da }, select: { id: true } }))).toEqual({ id: da })
      await admin.demandaCompartilhamento.update({ where: { id: edge.id }, data: { revogadoEm: new Date() } })
      expect(await comOrg(b, () => db.demanda.findUnique({ where: { id: da } }))).toBeNull()
      await admin.demandaCompartilhamento.delete({ where: { id: edge.id } })
    } finally { await admin.parceriaOrganizacao.delete({ where: { id: parceria.id } }) }
  })

  it("auditoria é append-only e isolada no role do runtime", async () => {
    await comOrg(a, () => registrarAuditoria(db, { organizacaoId: a, usuarioId: u }, {
      acao: "configuracao.alterada", recurso: "config_empresa", recursoId: a, correlationId: correlacaoAuditoria(), depois: { conectado: true },
    }))
    const evento = await comOrg(a, () => db.eventoAuditoria.findFirstOrThrow())
    expect(await comOrg(b, () => db.eventoAuditoria.count())).toBe(0)
    expect(await comOrg(null, () => db.eventoAuditoria.count())).toBe(0)
    await expect(comOrg(a, () => db.eventoAuditoria.update({ where: { id: evento.id }, data: { resultado: "falha" } }))).rejects.toThrow()
    await expect(comOrg(a, () => db.eventoAuditoria.delete({ where: { id: evento.id } }))).rejects.toThrow()
    await expect(prismaAuth.eventoAuditoria.count()).rejects.toThrow()
    await expect(comOrg(a, () => db.organizacao.delete({ where: { id: a } }))).rejects.toThrow()
    expect(await comOrg(a, () => db.eventoAuditoria.count())).toBe(1)
    await expect(comOrg(b, () => registrarAuditoria(db, { organizacaoId: a, tecnico: "rotina" }, {
      acao: "configuracao.alterada", recurso: "config_empresa", recursoId: a, correlationId: correlacaoAuditoria(),
    }))).rejects.toThrow()
  })
  it("falha na auditoria reverte a escrita sensível no runtime", async () => {
    await expect(comOrg(a, () => db.$transaction(async tx => {
      await tx.demanda.update({ where: { id: da }, data: { titulo: "nao-commitar" } })
      await registrarAuditoria(tx, { organizacaoId: b, usuarioId: u }, { acao: "configuracao.alterada", recurso: "config_empresa", recursoId: a, correlationId: correlacaoAuditoria() })
    }))).rejects.toThrow()
    expect((await admin.demanda.findUniqueOrThrow({ where: { id: da } })).titulo).toBe(da)
  })

})

describe("fila sob login runtime sem bypass", () => {
  it("isola jobs/eventos, recusa contexto ausente e completa efeito local", async () => {
    const fila = criarFila(db)
    const criar = (org: string) => comOrg(org,()=>db.$transaction(tx=>enfileirar(tx,{
      organizacaoId:org,tipo:"teste.runtime",referencia:org,chave:"runtime",expiraEm:new Date(Date.now()+60_000),
    })))
    const [ja,jb] = await Promise.all([criar(a),criar(b)])
    expect(await comOrg(null,()=>db.jobAutomacao.count())).toBe(0)
    expect((await comOrg(a,()=>db.jobAutomacao.findMany())).map(j=>j.id)).toEqual([ja.id])
    await expect(comOrg(a,()=>db.$transaction(tx=>enfileirar(tx,{
      organizacaoId:b,tipo:"teste.runtime",referencia:b,chave:"forjada",expiraEm:new Date(Date.now()+60_000),
    })))).rejects.toThrow()
    const [j] = await fila.reivindicar(a)
    expect(j.id).toBe(ja.id)
    expect(await fila.concluirLocal({id:j.id,organizacaoId:b,leaseToken:j.leaseToken!},async()=>{})).toBe(false)
    expect(await fila.concluirLocal({id:j.id,organizacaoId:a,leaseToken:j.leaseToken!},async tx=>{
      await tx.organizacao.update({where:{id:a},data:{nome:"efeito runtime"}})
    })).toBe(true)
    expect((await comOrg(b,()=>db.jobAutomacao.findUniqueOrThrow({where:{id:jb.id}}))).estado).toBe("pendente")
    expect(await comOrg(b,()=>db.eventoJob.count({where:{jobId:ja.id}}))).toBe(0)
    await expect(comOrg(a,()=>db.eventoJob.deleteMany({where:{jobId:ja.id}}))).rejects.toThrow()
    await expect(comOrg(a,()=>db.jobAutomacao.delete({where:{id:ja.id}}))).rejects.toThrow()
  })
})

describe("bootstrap e inbox WhatsApp sob RLS",()=>{
  it("resolve só a instância, autentica e persiste com isolamento sem credencial de dono",async()=>{
    vi.stubEnv("EMAIL_ENCRYPTION_KEY","chave-sintetica-runtime-inbox")
    const instance = `${p}-whatsapp`
    try {
      await admin.configWhatsapp.create({data:{organizacaoId:a,instanceId:instance,instanceUrl:"https://example.invalid",apiKey:"nao-usar",webhookSecret:encryptSecret("segredo-runtime")}})
      const payload={instance,event:"messages.upsert",data:{key:{id:"ID-SINTETICO",fromMe:false,remoteJid:"5511999990001@s.whatsapp.net"},message:{conversation:"Olá"}}}
      await expect(receberEntrada(payload,"errado")).rejects.toThrow("nao_autorizado")
      expect((await receberEntrada(payload,"segredo-runtime")).resultado).toBe("persistido")
      expect(await comOrg(null,()=>db.inboxWhatsapp.count())).toBe(0)
      expect(await comOrg(b,()=>db.inboxWhatsapp.count())).toBe(0)
      expect(await comOrg(a,()=>db.inboxWhatsapp.count())).toBe(1)
      expect((await processarInbox(a)).concluidos).toBe(1)
      await expect(prismaAuth.$queryRaw`SELECT * FROM public.whatsapp_instancia_org(${instance})`).rejects.toThrow()
      await expect(prismaAuth.inboxWhatsapp.count()).rejects.toThrow()
      await expect(comOrg(a,()=>db.inboxWhatsapp.deleteMany())).rejects.toThrow()
    } finally {vi.unstubAllEnvs()}
  })
})

describe("outbox sob RLS",()=>{
  it("envia pelo runtime, isola recibos e bloqueia exclusão da trilha",async()=>{
    const {criarSaida,processarSaidas}=await import("@/lib/whatsapp-outbox")
    vi.stubEnv("EMAIL_ENCRYPTION_KEY","chave-sintetica-runtime-inbox")
    vi.stubEnv("WHATSAPP_EVOLUTION_CONTRATO","2.3.7")
    const http=vi.mocked(fetch)
    http.mockResolvedValueOnce(Response.json({key:{id:"PROV-RUNTIME"}}))
    try {
      await admin.usuario.update({where:{id:u},data:{telefone:"5511999990001"}})
      await admin.configWhatsapp.update({where:{organizacaoId:a},data:{ativo:true}})
      const s=await comOrg(a,()=>db.$transaction(tx=>criarSaida(tx,{organizacaoId:a,origem:"manual",referencia:u,chave:"runtime-saida",telefone:"5511999990001",texto:"Sintético",expiraEm:new Date(Date.now()+60000)})))
      expect((await processarSaidas(a)).aceitos).toBe(1)
      expect(await comOrg(b,()=>db.saidaWhatsapp.count())).toBe(0)
      expect(await comOrg(null,()=>db.tentativaWhatsapp.count())).toBe(0)
      const instance=`${p}-whatsapp`
      await receberEntrada({instance,event:"messages.update",data:{keyId:"PROV-RUNTIME",remoteJid:"5511999990001@s.whatsapp.net",fromMe:true,status:"READ"}},"segredo-runtime")
      expect((await comOrg(a,()=>db.saidaWhatsapp.findUniqueOrThrow({where:{id:s.id}}))).estado).toBe("lido")
      await expect(comOrg(a,()=>db.reciboWhatsapp.deleteMany())).rejects.toThrow()
      await expect(comOrg(a,()=>db.saidaWhatsapp.delete({where:{id:s.id}}))).rejects.toThrow()
      await expect(prismaAuth.saidaWhatsapp.count()).rejects.toThrow()
    } finally {vi.unstubAllEnvs()}
  })
})


describe("regras O04 no runtime",()=>{
  it("deriva notificarEm sob role restrito e cria intenção com isolamento",async()=>{
    vi.stubEnv("EMAIL_ENCRYPTION_KEY","chave-sintetica-runtime-inbox")
    try {
      const {executarRotina}=await import("@/lib/automacoes-regras")
      const e=await comOrg(a,()=>db.evento.create({data:{organizacaoId:a,titulo:"Runtime sintético",usuarioId:u,inicio:new Date(Date.now()+30*60000),fim:new Date(Date.now()+90*60000),lembreteMinutos:120}}))
      expect(e.notificarEm?.getTime()).toBe(e.inicio.getTime()-120*60000)
      const adulterado=await comOrg(a,()=>db.evento.update({where:{id:e.id},data:{notificarEm:new Date(0)}}))
      expect(adulterado.notificarEm).toEqual(e.notificarEm)
      const r=await executarRotina(a,"lembretes")
      expect(r.intencoesCriadas).toBe(1)
      expect(await comOrg(b,()=>db.saidaWhatsapp.count({where:{origem:"regra"}}))).toBe(0)
      expect(await comOrg(null,()=>db.evento.count())).toBe(0)
      await comOrg(a,()=>db.organizacao.update({where:{id:a},data:{ambienteTeste:true}}))
      expect(await executarRotina(a,"alertas")).toHaveProperty("ignorada")
    } finally {vi.unstubAllEnvs()}
  })
})
