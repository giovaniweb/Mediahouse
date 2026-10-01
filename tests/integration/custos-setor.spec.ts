import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { randomBytes } from "node:crypto"
import pg from "pg"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { prismaBase as adminDb } from "@/lib/prisma"
import { comRls } from "@/lib/prisma-rls"
import { comOrg } from "@/lib/org-contexto"
import { cancelarCustoSetor, registrarCustoSetor, resumoCustosSetor } from "@/lib/custos-setor"
import { backfillAuditado } from "@/lib/backfill-auditado"
const prefix=`custos-${randomBytes(5).toString("hex")}`,org=`${prefix}-a`,outra=`${prefix}-b`,user=`${prefix}-u`,vm=`${prefix}-vm`
const ator={organizacaoId:org,usuarioId:user},role=`teste_custos_${randomBytes(5).toString("hex")}`,senha=randomBytes(16).toString("hex")
const admin=new pg.Client({connectionString:process.env.DATABASE_URL_TEST})
let db:PrismaClient,raw:PrismaClient
const entrada=(chave:string,valor:string|null="100.00",extras={})=>({competencia:"2026-10",categoria:"interno",descricao:chave,fonte:"Documento sintético",chaveOrigem:chave,valor,...extras})
beforeAll(async()=>{
  await admin.connect();await admin.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${senha}'`);await admin.query(`GRANT app_user TO "${role}"`)
  const url=new URL(process.env.DATABASE_URL_TEST!);url.username=role;url.password=senha;raw=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});db=comRls(raw)
  await adminDb.organizacao.createMany({data:[org,outra].map(id=>({id,nome:id,slug:id}))});await adminDb.usuario.create({data:{id:user,nome:user,tipo:"admin",senhaHash:"sem-login"}})
  await adminDb.usuarioOrganizacao.create({data:{usuarioId:user,organizacaoId:org,papel:"admin",areas:[]}})
  await adminDb.videomaker.create({data:{id:vm,nome:"Profissional sintético",redesSociais:[],areasAtuacao:[],habilidades:[],equipamentos:[]}})
  await adminDb.videomakerOrganizacao.create({data:{videomakerId:vm,organizacaoId:org,valorDiaria:9999}})
})
beforeEach(async()=>{
  await adminDb.lancamentoSetor.deleteMany({where:{organizacaoId:{in:[org,outra]}}});await adminDb.custoVideomaker.deleteMany({where:{organizacaoId:org}});await adminDb.demanda.deleteMany({where:{organizacaoId:org}})
})
afterAll(async()=>{await raw?.$disconnect();await adminDb.organizacao.deleteMany({where:{id:{in:[org,outra]}}});await adminDb.videomaker.delete({where:{id:vm}});await adminDb.usuario.delete({where:{id:user}});await adminDb.$disconnect();await admin.query(`DROP ROLE IF EXISTS "${role}"`);await admin.end()})
it("3000 internos + 500 externos + 100 ferramentas = 3600 parcial, sem somar desconhecido",async()=>{
  await registrarCustoSetor(db,ator,entrada("folha", "3000"));await registrarCustoSetor(db,ator,entrada("ferramenta","100",{categoria:"infraestrutura"}));await registrarCustoSetor(db,ator,entrada("desconhecido",null,{categoria:"outros"}))
  await adminDb.custoVideomaker.create({data:{organizacaoId:org,videomakerId:vm,valor:500,dataReferencia:new Date("2026-10-05T12:00Z"),pago:true,statusPagamento:"pago"}})
  const r=await resumoCustosSetor(db,org,"2026-10");expect(r).toMatchObject({totalConhecido:"3600.00",parcial:true,custoPorEntrega:null,pagamentosExternos:{pago:"500.00",pendente:"0.00"}});expect(r.pendencias).toHaveLength(1)
  expect(await resumoCustosSetor(db,outra,"2026-10")).toMatchObject({totalConhecido:"0.00",registros:[]});expect(fetch).not.toHaveBeenCalled()
})
it("retry concorrente do mesmo fato cria uma linha; fatos distintos são preservados",async()=>{
  const [a,b]=await Promise.all([registrarCustoSetor(db,ator,entrada("diaria-01")),registrarCustoSetor(db,ator,entrada("diaria-01"))]);expect(a.id).toBe(b.id)
  await registrarCustoSetor(db,ator,entrada("diaria-02"));expect((await resumoCustosSetor(db,org,"2026-10")).totalConhecido).toBe("200.00")
  await expect(registrarCustoSetor(db,ator,entrada("diaria-01","999"))).rejects.toThrow("origem")
  expect(await adminDb.eventoAuditoria.count({where:{organizacaoId:org,recursoId:a.id}})).toBe(1)
})
it("salário de outro mês não reescreve o passado; Decimal não acumula erro de float",async()=>{
  await registrarCustoSetor(db,ator,entrada("outubro","0.10"));await registrarCustoSetor(db,ator,entrada("outro-outubro","0.20"));await registrarCustoSetor(db,ator,entrada("novembro","3500",{competencia:"2026-11"}))
  expect((await resumoCustosSetor(db,org,"2026-10")).totalConhecido).toBe("0.30");expect((await resumoCustosSetor(db,org,"2026-11")).totalConhecido).toBe("3500.00")
})
it("zero legado e estados divergentes geram pendências; zero explícito é conhecido",async()=>{
  await registrarCustoSetor(db,ator,entrada("gratuito","0"))
  await adminDb.custoVideomaker.createMany({data:[{valor:0,pago:false,statusPagamento:"pendente_nf" as const},{valor:50,pago:true,statusPagamento:"pendente_nf" as const}].map(c=>({...c,organizacaoId:org,videomakerId:vm,dataReferencia:new Date("2026-10-05T12:00Z")}))})
  const r=await resumoCustosSetor(db,org,"2026-10");expect(r.totalConhecido).toBe("50.00");expect(r.pendencias).toHaveLength(2);expect(r.pagamentosExternos.pago).toBe("0.00")
})
it("imutabilidade e RLS: não edita valor nem apaga nem cancela outra empresa",async()=>{
  const r=await registrarCustoSetor(db,ator,entrada("imutavel"))
  await expect(comOrg(org,()=>db.lancamentoSetor.update({where:{id:r.id},data:{valor:999}}))).rejects.toThrow("imutável")
  await expect(comOrg(org,()=>db.lancamentoSetor.delete({where:{id:r.id}}))).rejects.toThrow()
  expect(await comOrg(outra,()=>db.lancamentoSetor.findUnique({where:{id:r.id}}))).toBeNull()
  await expect(cancelarCustoSetor(db,{...ator,organizacaoId:outra},r.id)).rejects.toThrow("não encontrado")
  await expect(registrarCustoSetor(db,ator,entrada("pessoa-fora","10",{usuarioId:"outra-pessoa"}))).rejects.toThrow("Pessoa")
  await cancelarCustoSetor(db,ator,r.id);await cancelarCustoSetor(db,ator,r.id)
  expect((await resumoCustosSetor(db,org,"2026-10")).totalConhecido).toBe("0.00");expect((await adminDb.lancamentoSetor.findUniqueOrThrow({where:{id:r.id}})).valor?.toFixed(2)).toBe("100.00")
})
it("retroativo não usa diária atual nem reabertura altera gasto pago",async()=>{
  const d=await adminDb.demanda.create({data:{organizacaoId:org,codigo:prefix,titulo:"Serviço",descricao:"Teste",cidade:"Teste",departamento:"growth",tipoVideo:"reels",solicitanteId:user,videomakerId:vm,statusVisivel:"finalizado",finalizadaEm:new Date("2026-10-05T12:00Z")}})
  expect((await resumoCustosSetor(db,org,"2026-10")).pendencias).toHaveLength(1)
  await expect(backfillAuditado("custos")).rejects.toThrow("diária atual");expect(await adminDb.custoVideomaker.count({where:{organizacaoId:org}})).toBe(0)
  await adminDb.custoVideomaker.create({data:{organizacaoId:org,videomakerId:vm,demandaId:d.id,valor:500,pago:true,statusPagamento:"pago",dataReferencia:new Date("2026-10-05T12:00Z")}})
  await adminDb.demanda.update({where:{id:d.id},data:{statusVisivel:"edicao",finalizadaEm:null}})
  expect(await resumoCustosSetor(db,org,"2026-10")).toMatchObject({totalConhecido:"500.00",pagamentosExternos:{pago:"500.00"},pendencias:[]})
})
