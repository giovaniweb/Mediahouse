import { beforeAll, afterAll, expect, it } from "vitest"
import { randomBytes } from "node:crypto"
import { createServer, request } from "node:http"
import pg from "pg"
import { prismaBase as db } from "@/lib/prisma"
import { criarColetorPg } from "../../scripts/lib/coleta-midia-pg.mjs"
import { criarListadorStorage } from "../../scripts/lib/coleta-midia-storage.mjs"
import { coletarInventario } from "../../scripts/lib/coleta-midia.mjs"
const prefix = `inv-${randomBytes(5).toString("hex")}`, org = `${prefix}-a`, outra = `${prefix}-b`, user = `${prefix}-u`
const role = `teste_inv_${randomBytes(6).toString("hex")}`, senha = randomBytes(24).toString("hex")
const admin = new pg.Client({connectionString:process.env.DATABASE_URL_TEST})
let connectionString: string, origin: string, falhar = false
const requests: string[] = []
const chave = `org/${org}/videos/${prefix}-d/previews/${prefix}-arquivo/1/h264-720p-v1/job-lease.mp4`
const server = createServer(async (req,res) => {
  if(req.method!=="POST" || req.url!=="/storage/v1/object/list/midia" || req.headers.authorization!=="Bearer sintetico") {res.writeHead(403);res.end("{}");return}
  const chunks=[];for await(const c of req)chunks.push(c)
  const {prefix:p,offset,limit,sortBy}=JSON.parse(Buffer.concat(chunks).toString());requests.push(p)
  expect(sortBy).toEqual({column:"name",order:"asc"})
  if(falhar){res.writeHead(503);res.end(JSON.stringify({message:"teste"}));return}
  const resto=chave.startsWith(p+"/")?chave.slice(p.length+1):null
  const row=resto?(resto.includes("/")?{name:resto.split("/")[0],id:null,metadata:null}:{name:resto,id:"obj",metadata:{size:123},created_at:"2026-09-20T00:00:00Z"}):null
  res.setHeader("content-type","application/json");res.end(JSON.stringify(row?[row].slice(offset,offset+limit):[]))
})
const fetchLocal = async (url: string | URL | Request, init?: RequestInit) => {
  if(new URL(String(url)).origin!==origin)throw new Error("somente_local")
  return new Promise<Response>((resolve,reject)=>{
    const req=request(String(url),{method:init?.method,headers:Object.fromEntries(new Headers(init?.headers)),signal:init?.signal??undefined},res=>{
      const chunks:Buffer[]=[];res.on("data",c=>chunks.push(c));res.on("end",()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:{"content-type":"application/json"}})))
    });req.on("error",reject);req.end(init?.body as string)
  })
}
beforeAll(async()=>{
  await admin.connect();await admin.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${senha}'`);await admin.query(`GRANT app_user TO "${role}"`)
  const u=new URL(process.env.DATABASE_URL_TEST!);u.username=role;u.password=senha;connectionString=u.toString()
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`
  await db.organizacao.createMany({data:[org,outra].map(id=>({id,nome:id,slug:id}))})
  await db.usuario.create({data:{id:user,nome:user,tipo:"admin",senhaHash:"sem-login"}})
  for(const [organizacaoId,id] of [[org,`${prefix}-d`],[outra,`${prefix}-fora`]])await db.demanda.create({data:{id,organizacaoId,solicitanteId:user,codigo:id,titulo:id,descricao:"sintético",departamento:"growth",cidade:"teste",tipoVideo:"reels",linkFinal:`/api/midia/${chave}`}})
  await db.arquivo.create({data:{id:`${prefix}-arquivo`,demandaId:`${prefix}-d`,tipoArquivo:"final",nomeArquivo:"fonte.mov",url:`/api/midia/${chave}`,fonteBucket:"midia",fonteObjectKey:`org/${org}/videos/${prefix}-d/fonte.mov`,fonteProvedor:"supabase",fonteVersao:1,previewObjectKey:chave}})
  await db.jobAutomacao.create({data:{id:`${prefix}-job`,organizacaoId:org,tipo:"midia.converter",referencia:`${prefix}-arquivo`,chave:"coleta",payload:{fonteVersao:1,perfil:"h264-720p-v1"},estado:"executando",leaseToken:"NAO_EXPORTAR_LEASE",leaseAte:new Date(Date.now()+60000),expiraEm:new Date(Date.now()+3600000)}})
  await db.aprovacaoVideo.create({data:{id:`${prefix}-aprovacao`,demandaId:`${prefix}-d`,urlVideo:`/api/midia/${chave}?token=NAO_EXPORTAR`,status:"aprovado"}})
})
afterAll(async()=>{
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))
  await db.organizacao.deleteMany({where:{id:{in:[org,outra]}}});await db.usuario.deleteMany({where:{id:user}});await db.$disconnect()
  await admin.query(`DROP ROLE IF EXISTS "${role}"`);await admin.end()
})
it("coleta paginada usa login sem bypass, não cruza empresa nem exporta tokens",async()=>{
  const banco=criarColetorPg({connectionString,storageOrigin:origin,tamanhoPagina:1})
  const b=await banco(org)
  expect(b.arquivos).toHaveLength(1);expect(b.jobs[0].leaseToken).toBe("presente");expect(b.cobertura).toEqual({arquivos:true,demandas:true,aprovacoes:true,jobs:true})
  expect(b.referencias.some(r=>r.tipo==="aprovacao")).toBe(true)
  expect(JSON.stringify(b)).not.toContain("NAO_EXPORTAR");expect(JSON.stringify(b)).not.toContain(`${prefix}-fora`)
  const listar=criarListadorStorage({origem:origin,key:"sintetico",organizacaoId:org,permitirHttpLocal:true,fetchImpl:fetchLocal})
  const r=await coletarInventario({banco,listar,organizacaoId:org,carenciaHoras:48,limites:{tamanhoPagina:1}})
  expect(r.relatorio.resumo.preservar.objetos).toBe(1);expect(r.coleta.storageEstavel).toBe(true)
  expect(r.snapshot.evidencia.referenciasCompletas).toBe(false);expect(r.relatorio.autorizaExclusao).toBe(false)
  expect(requests.every(p=>p.startsWith(`org/${org}/videos`))).toBe(true)
  await expect(listar(`org/${outra}/videos`,{offset:0,limit:1})).rejects.toThrow("prefixo_recusado")
})
it("rejeita login administrativo e marca limite de páginas sem completar referências",async()=>{
  await expect(criarColetorPg({connectionString:process.env.DATABASE_URL_TEST!,storageOrigin:origin})(org)).rejects.toThrow("login_restrito_obrigatorio")
  const b=await criarColetorPg({connectionString,storageOrigin:origin,tamanhoPagina:1,maxPaginas:1})(org)
  expect(b.cobertura.arquivos).toBe(false);expect(b.jobsCompletos).toBe(false)
})
it("falha de listagem não produz candidato nem vaza erro do provedor",async()=>{
  falhar=true
  try{
    const r=await coletarInventario({banco:criarColetorPg({connectionString,storageOrigin:origin}),listar:criarListadorStorage({origem:origin,key:"sintetico",organizacaoId:org,permitirHttpLocal:true,fetchImpl:fetchLocal}),organizacaoId:org,carenciaHoras:48})
    expect(r.snapshot.evidencia.storageCompleto).toBe(false);expect(r.coleta.motivoStorage).toBe("storage_indisponivel");expect(r.relatorio.resumo.revisar.objetos).toBe(0)
  }finally{falhar=false}
})
