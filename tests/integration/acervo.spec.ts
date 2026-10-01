import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { randomBytes } from "node:crypto"
import pg from "pg"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { prismaBase as adminDb } from "@/lib/prisma"
import { comRls } from "@/lib/prisma-rls"
import { comOrg } from "@/lib/org-contexto"
import { simularAcervo, aplicarAcervo } from "@/lib/acervo-recuperacao"
import { filtroFilaTrabalho } from "@/lib/acervo-regras"
const prefix=`acervo-${randomBytes(5).toString("hex")}`,org=`${prefix}-a`,outra=`${prefix}-b`,user=`${prefix}-u`
const ator={organizacaoId:org,usuarioId:user},role=`teste_acervo_${randomBytes(5).toString("hex")}`,senha=randomBytes(16).toString("hex")
const admin = new pg.Client({connectionString:process.env.DATABASE_URL_TEST})
let db:PrismaClient,raw:PrismaClient
async function demanda(nome:string,extras={}) { return adminDb.demanda.create({data:{id:`${prefix}-${nome}`,organizacaoId:org,solicitanteId:user,codigo:`${prefix}-${nome}`,titulo:nome,descricao:"sintético",cidade:"teste",departamento:"growth",tipoVideo:"reels",statusVisivel:"finalizado",...extras}}) }
beforeAll(async()=>{
  await admin.connect();await admin.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${senha}'`);await admin.query(`GRANT app_user TO "${role}"`)
  const url=new URL(process.env.DATABASE_URL_TEST!);url.username=role;url.password=senha;raw=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});db=comRls(raw)
  await adminDb.organizacao.createMany({data:[org,outra].map(id=>({id,nome:id,slug:id}))});await adminDb.usuario.create({data:{id:user,nome:user,tipo:"admin",senhaHash:"sem-login"}})
})
beforeEach(async()=>{
  await adminDb.loteAcervo.deleteMany({where:{organizacaoId:org}});await adminDb.demanda.deleteMany({where:{organizacaoId:org}})
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://storage.test");vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("Nenhuma rede permitida")}))
})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
afterAll(async()=>{await raw?.$disconnect();await adminDb.organizacao.deleteMany({where:{id:{in:[org,outra]}}});await adminDb.usuario.delete({where:{id:user}});await adminDb.$disconnect();await admin.query(`DROP ROLE IF EXISTS "${role}"`);await admin.end()})
it("simula sem escrever arquivos; aplicação idempotente preserva fonte e publicação",async()=>{
  const d=await demanda("final",{linkFinal:`/api/midia/org/${org}/videos/${prefix}-final/original.mov`})
  const plano=await simularAcervo(db,ator);expect(plano.itens[0]).toMatchObject({classe:"final_nao_vinculado",aplicavel:true});expect(await adminDb.arquivo.count({where:{demandaId:d.id}})).toBe(0)
  const r=await aplicarAcervo(db,ator,plano.loteId);expect(r).toMatchObject({recuperados:1,armazenamentoVerificado:false});expect(await aplicarAcervo(db,ator,plano.loteId)).toEqual(r)
  const arquivos=await adminDb.arquivo.findMany({where:{demandaId:d.id}});expect(arquivos).toHaveLength(1);expect(arquivos[0]).toMatchObject({publicadoEm:null,url:d.linkFinal,fonteVersao:1})
  expect((await adminDb.demanda.findUniqueOrThrow({where:{id:d.id}})).linkFinal).toBe(d.linkFinal);expect(fetch).not.toHaveBeenCalled()
})
it("serviço Growth, bruto e ausência de dados não viram final por suposição",async()=>{
  const d=await demanda("bruto",{linkFinal:"https://externo.test/grande.mov"});await adminDb.arquivo.create({data:{demandaId:d.id,tipoArquivo:"bruto",nomeArquivo:"final-grande.mov",url:d.linkFinal!}})
  await demanda("administrativo",{area:"design",tipoVideo:"administrativo"});await demanda("sem-dado")
  const p=await simularAcervo(db,ator);expect(p.itens.map(i=>i.classe).sort()).toEqual(["legado_sem_dado","revisao_manual","tipo_sem_arquivo"])
  expect((await aplicarAcervo(db,ator,p.loteId))).toMatchObject({recuperados:0});expect(await adminDb.arquivo.count({where:{tipoArquivo:"final",demanda:{organizacaoId:org}}})).toBe(0)
})
it("aprovação externa única recupera referência sem atestar armazenamento",async()=>{
  const d=await demanda("aprovada");await adminDb.aprovacaoVideo.create({data:{demandaId:d.id,urlVideo:"https://externo.test/final",status:"aprovado"}})
  const p=await simularAcervo(db,ator);expect(p.itens[0]).toMatchObject({classe:"entrega_externa",confianca:"referencia_explicita"});expect(await aplicarAcervo(db,ator,p.loteId)).toMatchObject({recuperados:1})
})
it("aprovação posterior rejeitada e referência interna de outra empresa não recuperam",async()=>{
  const d=await demanda("rejeitada");await adminDb.aprovacaoVideo.createMany({data:[{demandaId:d.id,urlVideo:"https://externo.test/final",status:"aprovado",createdAt:new Date(0)},{demandaId:d.id,urlVideo:"https://externo.test/final",status:"feedback",createdAt:new Date()}]})
  await demanda("outra-origem",{linkFinal:`/api/midia/org/${outra}/videos/fora/final.mp4`})
  const truncada=await demanda("historico-extenso",{linkFinal:"https://externo.test/final-antigo"})
  await adminDb.aprovacaoVideo.createMany({data:Array.from({length:21},(_,i)=>({demandaId:truncada.id,urlVideo:`https://externo.test/outro-${i}`,status:"pendente"}))})
  expect((await simularAcervo(db,ator)).itens.every(i=>!i.aplicavel)).toBe(true)
})
it.each(["link","reabertura","arquivo"])("precondição %s alterada exige nova simulação",async campo=>{
  const d=await demanda("muda",{linkFinal:"https://externo.test/final"});const p=await simularAcervo(db,ator)
  if(campo==="arquivo")await adminDb.arquivo.create({data:{demandaId:d.id,tipoArquivo:"final",url:d.linkFinal!,nomeArquivo:"real"}})
  else await adminDb.demanda.update({where:{id:d.id},data:campo==="link"?{linkFinal:"https://externo.test/outro"}:{statusVisivel:"edicao"}})
  expect(await aplicarAcervo(db,ator,p.loteId)).toMatchObject({recuperados:0,relatorio:[{resultado:"precondicao_alterada"}]})
})
it("lote expira, pertence ao operador e não atravessa empresas",async()=>{
  await demanda("seguro",{linkFinal:"https://externo.test/final"});const p=await simularAcervo(db,ator)
  await expect(aplicarAcervo(db,{...ator,usuarioId:"outro"},p.loteId)).rejects.toThrow("não encontrado")
  await expect(aplicarAcervo(db,{...ator,organizacaoId:outra},p.loteId)).rejects.toThrow("não encontrado")
  expect(await comOrg(outra,()=>db.loteAcervo.findUnique({where:{id:p.loteId}}))).toBeNull()
  await expect(comOrg(org,()=>db.loteAcervo.delete({where:{id:p.loteId}}))).rejects.toThrow()
  await adminDb.loteAcervo.update({where:{id:p.loteId},data:{expiraEm:new Date(0)}});await expect(aplicarAcervo(db,ator,p.loteId)).rejects.toThrow("expirada")
})
it("dois lotes concorrentes não duplicam o final",async()=>{
  const d=await demanda("concorrente",{linkFinal:"https://externo.test/final"});const [a,b]=await Promise.all([simularAcervo(db,ator),simularAcervo(db,ator)])
  const r=await Promise.allSettled([aplicarAcervo(db,ator,a.loteId),aplicarAcervo(db,ator,b.loteId)]);expect(r.some(x=>x.status==="fulfilled")).toBe(true)
  expect(await adminDb.arquivo.count({where:{demandaId:d.id,tipoArquivo:"final"}})).toBe(1)
})
it("29/30/31 dias, legado e reabertura: consulta oculta sem apagar serviço",async()=>{
  const agora=new Date();for(const dias of [29,30,31])await demanda(`dia-${dias}`,{finalizadaEm:new Date(agora.getTime()-dias*86400000)})
  await demanda("legado");await demanda("reaberta",{statusVisivel:"edicao",finalizadaEm:new Date(0)})
  const fila=await comOrg(org,()=>db.demanda.findMany({where:{organizacaoId:org,AND:[filtroFilaTrabalho(agora)]},select:{titulo:true}}))
  expect(fila.map(d=>d.titulo).sort()).toEqual(["dia-29","legado","reaberta"]);expect(await adminDb.demanda.count({where:{organizacaoId:org}})).toBe(5)
})
it("paginação de simulação cobre todos os registros sem duplicação",async()=>{
  for(let i=0;i<27;i++)await demanda(`pag-${String(i).padStart(3,"0")}`)
  const a=await simularAcervo(db,ator);expect(a.itens).toHaveLength(25);const b=await simularAcervo(db,ator,a.proximoCursor!);expect(b.itens).toHaveLength(2);expect(b.proximoCursor).toBeNull()
})
