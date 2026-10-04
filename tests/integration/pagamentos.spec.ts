import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { randomBytes } from "node:crypto"
import pg from "pg"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { prismaBase as adminDb } from "@/lib/prisma"
import { comRls } from "@/lib/prisma-rls"
import { comOrg } from "@/lib/org-contexto"
import { decidirPagamento, receberNotaFiscal } from "@/lib/pagamentos"
import { encryptSecret } from "@/lib/secret-crypto"
const prefix=`pagamentos-${randomBytes(5).toString("hex")}`,org=`${prefix}-a`,outra=`${prefix}-b`,user=`${prefix}-u`,vm=`${prefix}-vm`
const ator={organizacaoId:org,usuarioId:user},role=`teste_pag_${randomBytes(5).toString("hex")}`,senha=randomBytes(16).toString("hex")
const admin=new pg.Client({connectionString:process.env.DATABASE_URL_TEST})
let db:PrismaClient,raw:PrismaClient
beforeAll(async()=>{
  vi.stubEnv("EMAIL_ENCRYPTION_KEY","chave-sintetica-pagamentos")
  await admin.connect();await admin.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${senha}'`);await admin.query(`GRANT app_user TO "${role}"`)
  const url=new URL(process.env.DATABASE_URL_TEST!);url.username=role;url.password=senha;raw=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});db=comRls(raw)
  await adminDb.organizacao.createMany({data:[org,outra].map(id=>({id,nome:id,slug:id}))});await adminDb.usuario.create({data:{id:user,nome:user,tipo:"admin",senhaHash:"sem-login"}})
  await adminDb.usuarioOrganizacao.create({data:{usuarioId:user,organizacaoId:org,papel:"admin",areas:[]}})
  await adminDb.videomaker.create({data:{id:vm,nome:"Profissional sintético",redesSociais:[],areasAtuacao:[],habilidades:[],equipamentos:[]}})
  await adminDb.videomakerOrganizacao.create({data:{videomakerId:vm,organizacaoId:org,valorDiaria:9999}})
  await adminDb.videomakerDadosFiscais.create({data:{videomakerId:vm,organizacaoId:org,chavePix:encryptSecret("financeiro@example.invalid")}})
})
beforeEach(async()=>{
  await adminDb.lancamentoSetor.deleteMany({where:{organizacaoId:{in:[org,outra]}}});await adminDb.custoVideomaker.deleteMany({where:{organizacaoId:org}});await adminDb.demanda.deleteMany({where:{organizacaoId:org}})
})
afterAll(async()=>{await raw?.$disconnect();await adminDb.organizacao.deleteMany({where:{id:{in:[org,outra]}}});await adminDb.videomaker.delete({where:{id:vm}});await adminDb.usuario.delete({where:{id:user}});await adminDb.$disconnect();await admin.query(`DROP ROLE IF EXISTS "${role}"`);await admin.end()})
const job=()=>adminDb.demanda.create({data:{organizacaoId:org,codigo:prefix,titulo:"Job",descricao:"Teste",cidade:"Teste",departamento:"growth",tipoVideo:"reels",solicitanteId:user,videomakerId:vm,statusInterno:"brutos_enviados"}})
const custo=(extra={})=>adminDb.custoVideomaker.create({data:{organizacaoId:org,videomakerId:vm,valor:500,dataReferencia:new Date(),notaFiscalUrl:`/api/midia/org/${org}/nf/original/nf.pdf`,statusPagamento:"nf_enviada",...extra}})
const receber=(id:string,url=`/api/midia/org/${org}/nf/sintetica/nf.pdf`,empresa=org)=>comOrg(empresa,()=>db.$transaction(tx=>receberNotaFiscal(tx,{organizacaoId:empresa,notaId:id,url,nomeArquivo:"nf.pdf",ator:{organizacaoId:empresa,usuarioId:user}})))
it("aprovação concorrente produz uma decisão auditada e não marca pago",async()=>{
 const c=await custo();const r=await Promise.all([decidirPagamento(db,ator,c.id,"aprovar_pagamento"),decidirPagamento(db,ator,c.id,"aprovar_pagamento")])
 expect(r.filter(x=>x.alterado)).toHaveLength(1)
 expect(await adminDb.custoVideomaker.findUniqueOrThrow({where:{id:c.id}})).toMatchObject({pago:false,statusPagamento:"aguardando_pagamento",emailFinanceiroAt:null})
 expect(await adminDb.eventoAuditoria.count({where:{organizacaoId:org,recursoId:c.id}})).toBe(1)
 expect(fetch).not.toHaveBeenCalled()
})
it("aprovação exige documento e total conhecido, zero confirmado é válido",async()=>{
 const ausente=await custo({valor:0});await expect(decidirPagamento(db,ator,ausente.id,"aprovar_pagamento")).rejects.toThrow("Confirme o valor")
 const semDoc=await custo({notaFiscalUrl:null});await expect(decidirPagamento(db,ator,semDoc.id,"aprovar_pagamento")).rejects.toThrow("nota fiscal")
 const gratuito=await custo({valor:0,valorConfirmadoEm:new Date()});expect((await decidirPagamento(db,ator,gratuito.id,"aprovar_pagamento")).alterado).toBe(true)
})
it("outra empresa e estados pagos ou conflitantes não podem ser alterados",async()=>{
 const c=await custo({pago:true,statusPagamento:"pago"})
 await expect(decidirPagamento(db,{...ator,organizacaoId:outra},c.id,"contestar")).rejects.toThrow("não encontrado")
 await expect(decidirPagamento(db,ator,c.id,"contestar")).rejects.toThrow("registrado")
 const conflito=await custo({pago:false,statusPagamento:"pago"});await expect(decidirPagamento(db,ator,conflito.id,"aprovar_pagamento")).rejects.toThrow("conflito")
})
it("NF concorrente persiste uma submissão, um custo e um alerta",async()=>{
 const d=await job(),nf=await adminDb.notaFiscalUpload.create({data:{demandaId:d.id,videomakerId:vm}})
 const r=await Promise.allSettled([receber(nf.id),receber(nf.id)])
 expect(r.filter(x=>x.status==="fulfilled")).toHaveLength(1)
 expect(await adminDb.custoVideomaker.count({where:{demandaId:d.id}})).toBe(1)
 expect(await adminDb.alertaIA.count({where:{demandaId:d.id,tipoAlerta:"nf_recebida"}})).toBe(1)
 expect(await adminDb.custoVideomaker.findFirstOrThrow({where:{demandaId:d.id}})).toMatchObject({valor:0,valorConfirmadoEm:null,statusPagamento:"nf_enviada"})
})
it("não substitui documentos pagos nem escolhe arbitrariamente entre parcelas",async()=>{
 const d=await job(),nf=await adminDb.notaFiscalUpload.create({data:{demandaId:d.id,videomakerId:vm}})
 const c=await custo({demandaId:d.id,pago:true,statusPagamento:"pago"})
 await expect(receber(nf.id)).rejects.toThrow("registrado")
 expect((await adminDb.notaFiscalUpload.findUniqueOrThrow({where:{id:nf.id}})).status).toBe("pendente")
 await adminDb.custoVideomaker.update({where:{id:c.id},data:{pago:false,statusPagamento:"pendente_nf"}})
 await custo({demandaId:d.id,statusPagamento:"pendente_nf"})
 await expect(receber(nf.id)).rejects.toThrow("vários lançamentos")
})
it("profissional removido, empresa errada e arquivo alheio não recebem NF",async()=>{
 const d=await job(),nf=await adminDb.notaFiscalUpload.create({data:{demandaId:d.id,videomakerId:vm}})
 await expect(receber(nf.id,`/api/midia/org/${outra}/nf/a/nf.pdf`)).rejects.toThrow("fora da empresa")
 await expect(receber(nf.id,`/api/midia/org/${outra}/nf/a/nf.pdf`,outra)).rejects.toThrow("não encontrada")
 await adminDb.demanda.update({where:{id:d.id},data:{videomakerId:null}})
 await expect(receber(nf.id)).rejects.toThrow("não está autorizado")
})
it("erro de auditoria reverte nota, custo e alerta",async()=>{
 const d=await job(),nf=await adminDb.notaFiscalUpload.create({data:{demandaId:d.id,videomakerId:vm}})
 await expect(comOrg(org,()=>db.$transaction(tx=>receberNotaFiscal(tx,{organizacaoId:org,notaId:nf.id,url:`/api/midia/org/${org}/nf/a/nf.pdf`,nomeArquivo:"nf.pdf",ator:{organizacaoId:org,usuarioId:"x".repeat(129)}})))).rejects.toThrow("auditoria inválido")
 expect(await adminDb.custoVideomaker.count({where:{demandaId:d.id}})).toBe(0)
 expect((await adminDb.notaFiscalUpload.findUniqueOrThrow({where:{id:nf.id}})).status).toBe("pendente")
})
