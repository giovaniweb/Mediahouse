require('dotenv').config({path:'.env.local',quiet:true});
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const url=new URL(process.env.DATABASE_URL);assert(url.hostname==='127.0.0.1'&&url.port==='55437'&&url.pathname==='/nuflow_local');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
const base='http://127.0.0.1:3108',name='QA linha '+Date.now();let id,demandaId;
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
async function login(user){const c=await browser.newContext({viewport:{width:390,height:844}});await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const p=await c.newPage();await p.goto(base+'/login');await p.locator('[name=login]').fill(user);await p.locator('[name=password]').fill('NuFlow-Local-2026!');await p.getByRole('button',{name:'Entrar',exact:true}).click();await p.waitForURL('**/dashboard');return {c,p}}
const {c,p}=await login('admin-a@nuflow.test');await p.goto(base+'/configuracoes/linhas-projetos?visual=novo');
await p.getByLabel('Nome *',{exact:true}).fill(name);await p.getByLabel('Descrição',{exact:true}).fill('Registro temporário de teste local');
let response=p.waitForResponse(r=>r.url().endsWith('/api/growth/linhas-projetos')&&r.request().method()==='POST');await p.getByRole('button',{name:'Adicionar',exact:true}).click();assert.equal((await response).status(),201);
const record=await db.linhaProjeto.findFirstOrThrow({where:{nome:name}});id=record.id;
await p.getByRole('button',{name:'Editar '+name,exact:true}).click();await p.getByLabel('Editar nome da linha').fill(name+' editada');response=p.waitForResponse(r=>r.url().endsWith('/'+id)&&r.request().method()==='PATCH');await p.getByRole('button',{name:'Salvar nome',exact:true}).click();assert.equal((await response).status(),200);
await p.reload();await p.getByText(name+' editada',{exact:true}).waitFor();assert.equal((await db.linhaProjeto.findUniqueOrThrow({where:{id}})).nome,name+' editada');
const row=p.getByRole('button',{name:'Editar '+name+' editada',exact:true}).locator('..');
response=p.waitForResponse(r=>r.url().endsWith('/'+id)&&r.request().method()==='PATCH');await row.getByRole('button',{name:'Desativar',exact:true}).click();assert.equal((await response).status(),200);await row.getByRole('button',{name:'Ativar',exact:true}).waitFor();assert.equal((await db.linhaProjeto.findUniqueOrThrow({where:{id}})).ativo,false);
await row.scrollIntoViewIfNeeded();await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:'/tmp/nuflow-linhas-filled-mobile.png'});
const other=await login('admin-b@nuflow.test');const list=await other.c.request.get(base+'/api/growth/linhas-projetos?incluirInativas=1');assert.equal(list.status(),200);assert(!(await list.json()).linhas.some(l=>l.id===id));assert.equal((await other.c.request.patch(base+'/api/growth/linhas-projetos/'+id,{data:{nome:'indevido'}})).status(),404);assert.equal((await other.c.request.delete(base+'/api/growth/linhas-projetos/'+id)).status(),404);
const user=await db.usuario.findUniqueOrThrow({where:{email:'admin-a@nuflow.test'}});
const job=await db.demanda.create({data:{organizacaoId:record.organizacaoId,solicitanteId:user.id,linhaProjetoId:id,codigo:'QA-LINHA-'+Date.now(),titulo:'QA vínculo temporário',descricao:'Fixture local',departamento:'outros',tipoVideo:'outro',cidade:'Belo Horizonte'}});demandaId=job.id;
// Reativa antes de remover para comprovar a transição feita pelo DELETE.
response=p.waitForResponse(r=>r.url().endsWith('/'+id)&&r.request().method()==='PATCH');await row.getByRole('button',{name:'Ativar',exact:true}).click();assert.equal((await response).status(),200);await row.getByRole('button',{name:'Desativar',exact:true}).waitFor();
p.once('dialog',d=>d.accept());response=p.waitForResponse(r=>r.url().endsWith('/'+id)&&r.request().method()==='DELETE');await row.getByRole('button',{name:'Remover '+name+' editada',exact:true}).click();const removed=await response;assert.equal(removed.status(),200);assert.deepEqual(await removed.json(),{ok:true,hardDelete:false,demandasVinculadas:1});
await p.getByText('Desativada (1 demanda(s) vinculada(s)).',{exact:true}).waitFor();
assert.equal((await db.linhaProjeto.findUniqueOrThrow({where:{id}})).ativo,false);assert.equal((await db.demanda.findUniqueOrThrow({where:{id:demandaId}})).linhaProjetoId,id);
await p.reload();await p.getByRole('button',{name:'Editar '+name+' editada',exact:true}).waitFor();
assert(await p.getByRole('button',{name:'Ativar',exact:true}).isVisible());
console.log('PASS: linha com demanda é desativada, histórico e vínculo preservados após reload; reativação e isolamento A/B confirmados');
}finally{if(demandaId)await db.demanda.deleteMany({where:{id:demandaId}});if(id)await db.linhaProjeto.deleteMany({where:{id}});else await db.linhaProjeto.deleteMany({where:{nome:name}});await db.$disconnect();await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
