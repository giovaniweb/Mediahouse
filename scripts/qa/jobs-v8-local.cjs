// Real HTTP, real credentials login and real local PostgreSQL. No API mocks.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base='http://127.0.0.1:3108';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[];
 async function login(email){
  const context=await browser.newContext({viewport:{width:1440,height:960}});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/login');
  await page.locator('input[name="login"]').fill(email);
  await page.locator('input[name="password"]').fill('NuFlow-Local-2026!');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.waitForURL('**/dashboard',{timeout:30000});
  return {context,page,api:context.request};
 }
 require('dotenv').config({path:'.env.local',quiet:true});
 const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
 const url=new URL(process.env.DATABASE_URL);
 assert(url.hostname==='127.0.0.1'&&url.port==='55437'&&url.pathname==='/nuflow_local','Somente banco local');
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
 const owner=await db.demanda.findFirstOrThrow({where:{codigo:'LOCAL-a-audiovisual'}});
 const job=await db.demanda.create({data:{organizacaoId:owner.organizacaoId,solicitanteId:owner.solicitanteId,codigo:'QA-JOB-'+Date.now(),titulo:'QA Job layout local',descricao:'Fixture temporária de validação local',area:'audiovisual',departamento:'outros',tipoVideo:'cobertura_evento',cidade:'Belo Horizonte',prioridade:'normal',statusInterno:'planejamento',statusVisivel:'producao'}});
 try {
 const a=await login('admin-a@nuflow.test');
 await a.page.goto(base+'/jobs?visual=novo');
 await a.page.getByRole('heading',{name:'Seu próximo job. À vista.'}).waitFor();
 await a.page.getByRole('button',{name:'Lista',exact:true}).click();
 const list=a.page.getByRole('region',{name:'Lista de Jobs'});
 const link=list.getByRole('link',{name:/QA Job layout local/});await link.waitFor();
 assert.equal(await link.getAttribute('href'),'/jobs/'+job.id);
 await a.page.getByRole('textbox',{name:'Buscar jobs por código ou título'}).fill(job.codigo);
 await a.page.waitForResponse(r=>r.url().includes('/api/demandas?')&&r.url().includes(job.codigo)&&r.status()===200);
 await link.waitFor();
 await a.page.screenshot({path:'/tmp/nuflow-jobs-v8-list.png'});
 await a.page.setViewportSize({width:390,height:844});
 await a.page.screenshot({path:'/tmp/nuflow-jobs-v8-mobile.png'});
 assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await link.click();await a.page.waitForURL('**/jobs/'+job.id);
 await a.page.getByRole('region',{name:'Operação do Job'}).waitFor();
 for (const name of ['Entrega','Conversa','Equipe e contexto','Pedido']) {
  const tab=a.page.getByRole('button',{name,exact:true});await tab.click();assert.equal(await tab.getAttribute('aria-pressed'),'true');
 }
 await a.page.screenshot({path:'/tmp/nuflow-job-detail-mobile.png'});
 assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await a.page.setViewportSize({width:1440,height:960});
 await a.page.screenshot({path:'/tmp/nuflow-job-detail-desktop.png'});
 await a.page.goto(base+'/jobs?visual=novo');
 await a.page.getByRole('button',{name:'Kanban',exact:true}).click();
 await a.page.getByRole('region',{name:'Produção',exact:true}).getByRole('button',{name:/QA Job layout local/}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: Job real, Kanban/Lista, busca, link operacional, mobile sem overflow');
 } finally {await db.demanda.delete({where:{id:job.id}});await db.$disconnect();await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
