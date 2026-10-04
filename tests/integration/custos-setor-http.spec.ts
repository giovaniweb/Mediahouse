import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const {estado}=vi.hoisted(()=>({estado:{sessao:null as null|{user:{id:string;organizacaoId:string;tipo:string}}}}))
const {email}=vi.hoisted(()=>({email:vi.fn(async()=>({ok:false,error:"Falha sintética"}))}))
vi.mock("@/lib/email",()=>({sendEmailFinanceiro:email}))
vi.mock("@/lib/auth",()=>({auth:async()=>estado.sessao}))
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>undefined})}))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET, POST } from "@/app/api/custos-setor/route"
import { GET as externosGet, POST as externo } from "@/app/api/custos-videomaker/route"
import { DELETE as excluir, PATCH as editar } from "@/app/api/custos-videomaker/[id]/route"
import { POST as aprovar } from "@/app/api/custos-videomaker/[id]/aprovar/route"
import { POST as retroativo } from "@/app/api/admin/backfill-custos/route"
import { GET as pagamentoGet, POST as pagamentoPost } from "@/app/api/demandas/[id]/pagamento/route"
import { POST as tokenNF } from "@/app/api/me/nf-token/route"
import { POST as uploadNF } from "@/app/api/nf-upload/[token]/route"
import { encryptSecret } from "@/lib/secret-crypto"
import { PRESETS } from "@/lib/permissoes"
const p=`custos-http-${randomUUID()}`,org=`${p}-org`,user=`${p}-u`,vm=`${p}-vm`
const req=(body:unknown,headers={})=>new NextRequest("http://localhost/api/custos",{method:"POST",headers,body:JSON.stringify(body)})
beforeAll(async()=>{
 vi.stubEnv("EMAIL_ENCRYPTION_KEY","chave-sintetica-financeiro-http")
 await db.organizacao.create({data:{id:org,nome:p,slug:p}});await db.usuario.create({data:{id:user,nome:p,tipo:"admin",senhaHash:"teste"}});await db.usuarioOrganizacao.create({data:{usuarioId:user,organizacaoId:org,papel:"admin",areas:[]}})
 await db.videomaker.create({data:{id:vm,nome:"Teste",redesSociais:[],areasAtuacao:[],habilidades:[],equipamentos:[]}});await db.videomakerOrganizacao.create({data:{videomakerId:vm,organizacaoId:org}})
})
beforeEach(async()=>{await db.usuarioOrganizacao.update({where:{usuarioId_organizacaoId:{usuarioId:user,organizacaoId:org}},data:{papel:"admin"}});estado.sessao={user:{id:user,organizacaoId:org,tipo:"admin"}};await db.permissaoUsuario.deleteMany({where:{usuarioId:user,organizacaoId:org}})})
afterAll(async()=>{await db.organizacao.delete({where:{id:org}});await db.videomaker.delete({where:{id:vm}});await db.usuario.delete({where:{id:user}});await Promise.all([db.$disconnect(),prismaAuth.$disconnect()])})
it("sem verCustos não lê nem grava cifras; competência inválida é 400",async()=>{
 expect((await GET(new NextRequest("http://localhost/api/custos-setor?competencia=errado"))).status).toBe(400)
 await db.permissaoUsuario.create({data:{usuarioId:user,organizacaoId:org,...PRESETS.admin,verCustos:false}})
 expect((await GET(new NextRequest("http://localhost/api/custos-setor?competencia=2026-10"))).status).toBe(403);expect((await POST(req({}))).status).toBe(403)
 estado.sessao=null;expect((await GET(new NextRequest("http://localhost/api/custos-setor?competencia=2026-10"))).status).toBe(401)
})
it("retroativo antigo é recusado sem criar gastos",async()=>{expect((await retroativo()).status).toBe(409)})
it("retry concorrente de externo não duplica e mudança de valor conflita",async()=>{
 const body={videomakerId:vm,valor:50,dataReferencia:"2026-10-10"},key=randomUUID()
 const [a,b]=await Promise.all([externo(req(body,{"Idempotency-Key":key})),externo(req(body,{"Idempotency-Key":key}))]);expect(a.status).toBe(201);expect(b.status).toBe(201)
 const c=(await a.json()).custo;expect((await b.json()).custo.id).toBe(c.id);expect((await externo(req({...body,valor:99},{"Idempotency-Key":key}))).status).toBe(409)
 expect(await db.custoVideomaker.count({where:{organizacaoId:org,fatoOrigem:key}})).toBe(1)
 const r=await editar(req({pago:true}),{params:Promise.resolve({id:c.id})});expect(r.status).toBe(200);expect((await r.json()).custo).toMatchObject({pago:true,statusPagamento:"pago"})
 expect((await aprovar(req({acao:"aprovar_pagamento"}),{params:Promise.resolve({id:c.id})})).status).toBe(409)
})
it("zero novo comprova valor; pago nasce com estado coerente",async()=>{
 const r=await externo(req({videomakerId:vm,valor:0,pago:true,dataReferencia:"2026-10-11"}));expect(r.status).toBe(201);const c=(await r.json()).custo;expect(c).toMatchObject({valor:0,pago:true,statusPagamento:"pago"});expect(c.valorConfirmadoEm).toBeTruthy()
})

it("rotas do job não entregam finanças nem contestam sem permissão atual",async()=>{
 const params={params:Promise.resolve({id:"qualquer-job"})}
 await db.permissaoUsuario.create({data:{usuarioId:user,organizacaoId:org,...PRESETS.admin,verCustos:false}})
 expect((await pagamentoGet(req({}),params)).status).toBe(403)
 expect((await pagamentoPost(req({acao:"contestar"}),params)).status).toBe(403)
 // O cargo global da sessão não vence o papel revogado na empresa.
 await db.permissaoUsuario.deleteMany({where:{usuarioId:user,organizacaoId:org}})
 await db.usuarioOrganizacao.update({where:{usuarioId_organizacaoId:{usuarioId:user,organizacaoId:org}},data:{papel:"solicitante"}})
 expect((await pagamentoPost(req({acao:"aprovar_pagamento"}),params)).status).toBe(403)
})
it("URL arbitrária pelo fluxo antigo de NF não grava custo ou PIX",async()=>{
 const antes=await db.custoVideomaker.count({where:{organizacaoId:org}})
 const r=await pagamentoPost(req({acao:"enviar_nf",notaFiscalUrl:"https://example.invalid/alheia.pdf",chavePix:"ataque@example.invalid"}),{params:Promise.resolve({id:"job"})})
 expect(r.status).toBe(410);expect(await db.custoVideomaker.count({where:{organizacaoId:org}})).toBe(antes)
 expect(await db.videomakerDadosFiscais.count({where:{organizacaoId:org}})).toBe(0)
})
it("pago não pode ser editado, reaberto ou excluído; retry não altera data",async()=>{
 const c=await db.custoVideomaker.create({data:{organizacaoId:org,videomakerId:vm,valor:700,pago:true,statusPagamento:"pago",dataPagamento:new Date("2026-10-01T12:00Z"),dataReferencia:new Date()}})
 const params={params:Promise.resolve({id:c.id})}
 for(const body of [{valor:5},{pago:false},{descricao:"substituir"}])expect((await editar(req(body),params)).status).toBe(409)
 expect((await excluir(req({}),params)).status).toBe(409)
 expect((await editar(req({pago:true,dataPagamento:new Date().toISOString()}),params)).status).toBe(200)
 expect((await db.custoVideomaker.findUniqueOrThrow({where:{id:c.id}})).dataPagamento?.toISOString()).toBe("2026-10-01T12:00:00.000Z")
})
it("job exige aprovação antes de pagar e mudança de valor invalida a aprovação",async()=>{
 const d=await db.demanda.create({data:{organizacaoId:org,codigo:`${p}-pag`,titulo:"Teste",descricao:"Teste",cidade:"Teste",departamento:"growth",tipoVideo:"reels",solicitanteId:user,videomakerId:vm}})
 const c=await db.custoVideomaker.create({data:{organizacaoId:org,videomakerId:vm,demandaId:d.id,valor:500,valorConfirmadoEm:new Date(),dataReferencia:new Date()}}),params={params:Promise.resolve({id:c.id})}
 expect((await editar(req({pago:true}),params)).status).toBe(409)
 expect((await externo(req({videomakerId:vm,demandaId:d.id,valor:500,pago:true,dataReferencia:"2026-10-01"}))).status).toBe(409)
 await db.custoVideomaker.update({where:{id:c.id},data:{statusPagamento:"aguardando_pagamento",notaFiscalUrl:"/api/midia/nf",emailFinanceiroAt:new Date()}})
 const r=await editar(req({valor:750}),params);expect(r.status).toBe(200)
 expect((await r.json()).custo).toMatchObject({statusPagamento:"nf_enviada",emailFinanceiroAt:null,pago:false})
})
it("token de NF exige autoria do job; chamadas concorrentes retornam o mesmo token",async()=>{
 const d=await db.demanda.create({data:{organizacaoId:org,codigo:`${p}-nf`,titulo:"Teste",descricao:"Teste",cidade:"Teste",departamento:"growth",tipoVideo:"reels",solicitanteId:user,videomakerId:vm,statusInterno:"brutos_enviados"}})
 expect((await tokenNF(req({demandaId:d.id}))).status).toBe(404)
 await db.videomaker.update({where:{id:vm},data:{usuarioId:user}})
 try {
   const [a,b]=await Promise.all([tokenNF(req({demandaId:d.id})),tokenNF(req({demandaId:d.id}))])
   expect(a.status).toBe(200);const token=(await a.json()).token;expect((await b.json()).token).toBe(token)
   expect(await db.notaFiscalUpload.count({where:{demandaId:d.id}})).toBe(1)
   await db.demanda.update({where:{id:d.id},data:{videomakerId:null}})
   expect((await uploadNF(req({}),{params:Promise.resolve({token})})).status).toBe(404)
 } finally {await db.videomaker.update({where:{id:vm},data:{usuarioId:null}})}
})

it("falha de e-mail mantém decisão pendente de pagamento e retry não duplica envio",async()=>{
 await db.videomakerDadosFiscais.upsert({where:{organizacaoId_videomakerId:{organizacaoId:org,videomakerId:vm}},create:{organizacaoId:org,videomakerId:vm,chavePix:encryptSecret("financeiro@example.invalid")},update:{chavePix:encryptSecret("financeiro@example.invalid")}})
 const c=await db.custoVideomaker.create({data:{organizacaoId:org,videomakerId:vm,valor:500,dataReferencia:new Date(),statusPagamento:"nf_enviada",notaFiscalUrl:`/api/midia/org/${org}/nf/a/nf.pdf`}})
 const params={params:Promise.resolve({id:c.id})};email.mockClear()
 const r=await aprovar(req({acao:"aprovar_pagamento"}),params);expect(r.status).toBe(200);expect((await r.json()).emailEnviado).toBe(false)
 expect((await aprovar(req({acao:"aprovar_pagamento"}),params)).status).toBe(200)
 expect(email).toHaveBeenCalledTimes(1)
 expect(await db.custoVideomaker.findUniqueOrThrow({where:{id:c.id}})).toMatchObject({pago:false,statusPagamento:"aguardando_pagamento",emailFinanceiroAt:null})
 expect(await db.alertaIA.count({where:{organizacaoId:org,tipoAlerta:"financeiro_email_pendente"}})).toBe(1)
})
it("NF pública recusa HTML disfarçado de PDF antes de armazenar",async()=>{
 const d=await db.demanda.create({data:{organizacaoId:org,codigo:`${p}-arquivo`,titulo:"Teste",descricao:"Teste",cidade:"Teste",departamento:"growth",tipoVideo:"reels",solicitanteId:user,videomakerId:vm,statusInterno:"brutos_enviados"}})
 const nf=await db.notaFiscalUpload.create({data:{demandaId:d.id,videomakerId:vm}}),form=new FormData()
 form.set("arquivo",new File(["<html>inválido</html>"],"nota.pdf",{type:"application/pdf"}))
 const r=await uploadNF(new NextRequest("http://localhost/api/nf-upload/teste",{method:"POST",body:form}),{params:Promise.resolve({token:nf.token})})
 expect(r.status).toBe(400)
 expect((await db.notaFiscalUpload.findUniqueOrThrow({where:{id:nf.id}})).status).toBe("pendente")
})
it("zero desconhecido não entra no comparativo; confirmar gratuidade muda a cobertura",async()=>{
 const d=await db.demanda.create({data:{organizacaoId:org,codigo:`${p}-zero`,titulo:"Teste",descricao:"Teste",cidade:"Teste",departamento:"growth",tipoVideo:"reels",solicitanteId:user,videomakerId:vm}})
 const c=await db.custoVideomaker.create({data:{organizacaoId:org,videomakerId:vm,demandaId:d.id,valor:0,dataReferencia:new Date()}})
 const consulta=()=>externosGet(new NextRequest(`http://localhost/api/custos-videomaker?demandaId=${d.id}`))
 const antes=await (await consulta()).json();expect(antes.porVideomaker).toEqual([]);expect(antes.custos[0].valorPendenteConfirmacao).toBe(true)
 expect((await editar(req({valor:"0"}),{params:Promise.resolve({id:c.id})})).status).toBe(200)
 const depois=await (await consulta()).json();expect(depois.porVideomaker).toHaveLength(1);expect(depois.custos[0].valorPendenteConfirmacao).toBe(false)
})
