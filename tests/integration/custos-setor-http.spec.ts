import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const {estado}=vi.hoisted(()=>({estado:{sessao:null as null|{user:{id:string;organizacaoId:string;tipo:string}}}}))
vi.mock("@/lib/auth",()=>({auth:async()=>estado.sessao}))
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>undefined})}))
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET, POST } from "@/app/api/custos-setor/route"
import { POST as externo } from "@/app/api/custos-videomaker/route"
import { PATCH as editar } from "@/app/api/custos-videomaker/[id]/route"
import { POST as aprovar } from "@/app/api/custos-videomaker/[id]/aprovar/route"
import { POST as retroativo } from "@/app/api/admin/backfill-custos/route"
import { PRESETS } from "@/lib/permissoes"
const p=`custos-http-${randomUUID()}`,org=`${p}-org`,user=`${p}-u`,vm=`${p}-vm`
const req=(body:unknown,headers={})=>new NextRequest("http://localhost/api/custos",{method:"POST",headers,body:JSON.stringify(body)})
beforeAll(async()=>{
 await db.organizacao.create({data:{id:org,nome:p,slug:p}});await db.usuario.create({data:{id:user,nome:p,tipo:"admin",senhaHash:"teste"}});await db.usuarioOrganizacao.create({data:{usuarioId:user,organizacaoId:org,papel:"admin",areas:[]}})
 await db.videomaker.create({data:{id:vm,nome:"Teste",redesSociais:[],areasAtuacao:[],habilidades:[],equipamentos:[]}});await db.videomakerOrganizacao.create({data:{videomakerId:vm,organizacaoId:org}})
})
beforeEach(async()=>{estado.sessao={user:{id:user,organizacaoId:org,tipo:"admin"}};await db.permissaoUsuario.deleteMany({where:{usuarioId:user,organizacaoId:org}})})
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
