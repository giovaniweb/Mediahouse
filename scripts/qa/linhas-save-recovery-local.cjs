require('dotenv').config({path:'.env.local',quiet:true});
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const url=new URL(process.env.DATABASE_URL);assert(url.hostname==='127.0.0.1'&&url.port==='55437'&&url.pathname==='/nuflow_local');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
const base='http://127.0.0.1:3108',name='QA linha '+Date.now();let id;
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
async function login(user){const c=await browser.newContext({viewport:{width:390,height:844}});await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const p=await c.newPage();await p.goto(base+'/login');await p.locator('[name=login]').fill(user);await p.locator('[name=password]').fill('NuFlow-Local-2026!');await p.getByRole('button',{name:'Entrar',exact:true}).click();await p.waitForURL('**/dashboard');return {c,p}}
const {c,p}=await login('admin-a@nuflow.test');await p.goto(base+'/configuracoes/linhas-projetos?visual=novo');
await p.getByLabel('Nome *',{exact:true}).fill(name);await p.getByLabel('Descrição',{exact:true}).fill('Registro temporário de teste local');
let response=p.waitForResponse(r=>r.url().endsWith('/api/growth/linhas-projetos')&&r.request().method()==='POST');await p.getByRole('button',{name:'Adicionar',exact:true}).click();assert.equal((await response).status(),201);
const record=await db.linhaProjeto.findFirstOrThrow({where:{nome:name}});id=record.id;
await p.getByRole('button',{name:'Editar '+name,exact:true}).click();await p.getByLabel('Editar nome da linha').fill(name+' editada');let fail=true;
await p.route('**/api/growth/linhas-projetos/'+id,r=>fail&&r.request().method()==='PATCH'?r.abort():r.continue());
await p.getByRole('button',{name:'Salvar nome',exact:true}).click();
await p.getByText('Não foi possível salvar. Verifique sua conexão e tente novamente.',{exact:true}).waitFor();
assert.equal(await p.getByLabel('Editar nome da linha').inputValue(),name+' editada');
assert.equal((await db.linhaProjeto.findUniqueOrThrow({where:{id}})).nome,name);
fail=false;
response=p.waitForResponse(r=>r.url().endsWith('/'+id)&&r.request().method()==='PATCH');await p.getByRole('button',{name:'Salvar nome',exact:true}).click();assert.equal((await response).status(),200);
await p.reload();await p.getByText(name+' editada',{exact:true}).waitFor();assert.equal((await db.linhaProjeto.findUniqueOrThrow({where:{id}})).nome,name+' editada');
const row=p.getByRole('button',{name:'Editar '+name+' editada',exact:true}).locator('..');
response=p.waitForResponse(r=>r.url().endsWith('/'+id)&&r.request().method()==='PATCH');await row.getByRole('button',{name:'Desativar',exact:true}).click();assert.equal((await response).status(),200);await row.getByRole('button',{name:'Ativar',exact:true}).waitFor();assert.equal((await db.linhaProjeto.findUniqueOrThrow({where:{id}})).ativo,false);
await row.scrollIntoViewIfNeeded();await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:'/tmp/nuflow-linhas-filled-mobile.png'});
const other=await login('admin-b@nuflow.test');const list=await other.c.request.get(base+'/api/growth/linhas-projetos?incluirInativas=1');assert.equal(list.status(),200);assert(!(await list.json()).linhas.some(l=>l.id===id));assert.equal((await other.c.request.patch(base+'/api/growth/linhas-projetos/'+id,{data:{nome:'indevido'}})).status(),404);assert.equal((await other.c.request.delete(base+'/api/growth/linhas-projetos/'+id)).status(),404);
p.once('dialog',d=>d.accept());response=p.waitForResponse(r=>r.url().endsWith('/'+id)&&r.request().method()==='DELETE');await row.getByRole('button',{name:'Remover '+name+' editada',exact:true}).click();assert.equal((await response).status(),200);assert.equal(await db.linhaProjeto.findUnique({where:{id}}),null);
console.log('PASS: falha de rede preserva rascunho e banco; retry salva; criação, edição persistida, desativação e remoção UI local; empresa B sem acesso à linha; mobile sem overflow');
}finally{if(id)await db.linhaProjeto.deleteMany({where:{id}});else await db.linhaProjeto.deleteMany({where:{nome:name}});await db.$disconnect();await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
