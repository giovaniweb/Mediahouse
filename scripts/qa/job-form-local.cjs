require('dotenv').config({path:'.env.local',quiet:true});
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const url=new URL(process.env.DATABASE_URL);assert(url.hostname==='127.0.0.1'&&url.port==='55437'&&url.pathname==='/nuflow_local');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),base='http://127.0.0.1:3108',cliente='QA Clínica '+Date.now(),errors=[];
 const org=await db.organizacao.findUniqueOrThrow({where:{slug:'estudio-local-b'}}),atorId=`formulario-jobs-${org.id}`,atorAntes=await db.usuario.findUnique({where:{id:atorId}});
 const ctx=await browser.newContext({viewport:{width:1440,height:960}});await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 const body={cliente,endereco:'Rua das Flores, 100, Centro, Belo Horizonte',data:'2030-10-10',hora:'14:30',consultora:'Consultora QA',envioId:randomUUID()};
 try{
 assert.equal((await ctx.request.post(base+'/api/publico/jobs',{data:body})).status(),400);
 assert.equal((await ctx.request.post(base+'/api/publico/jobs?org=nao-existe',{data:body})).status(),404);
 assert.equal((await ctx.request.post(base+'/api/publico/jobs?org=estudio-local-b',{data:{...body,data:'2030-02-30'}})).status(),400);
 assert.equal((await ctx.request.post(base+'/api/publico/jobs?org=estudio-local-b',{data:{...body,data:'2020-01-01'}})).status(),400);
 await page.goto(base+'/agendar-gravacao');await page.getByRole('heading',{name:'Precisamos do link da empresa.'}).waitFor();
 await page.goto(base+'/agendar-gravacao?org=estudio-local-b');
 for(const [label,value] of [['Nome do cliente ou clínica',cliente],['Endereço completo',body.endereco],['Data',body.data],['Horário',body.hora],['Consultora que acompanhará a gravação',body.consultora]])await page.getByLabel(label,{exact:true}).fill(value);
 await page.screenshot({path:'/tmp/nuflow-job-form-desktop.png'});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/nuflow-job-form-mobile.png',fullPage:true});
 const request=page.waitForRequest(r=>r.url().includes('/api/publico/jobs')&&r.method()==='POST');await page.getByRole('button',{name:'Solicitar gravação',exact:true}).click();const sentBody=(await request).postDataJSON();await page.getByRole('heading',{name:'Pedido recebido.'}).waitFor();
 const replay=await ctx.request.post(base+'/api/publico/jobs?org=estudio-local-b',{data:sentBody});assert.equal(replay.status(),201);
 const rows=await db.demanda.findMany({where:{clienteFinalNome:cliente},include:{historicos:true}});assert.equal(rows.length,1);const job=rows[0];assert.equal(job.organizacaoId,org.id);assert.equal(job.statusInterno,'planejamento');assert.equal(job.tipoVideo,'cobertura_evento');assert.equal(job.localGravacao,body.endereco);assert.equal(job.dataCaptacao.toISOString(),'2030-10-10T17:30:00.000Z');assert.equal(job.detalhesEntrega.consultora,body.consultora);assert.equal(job.historicos.length,1);assert.equal(job.videomakerId,null);
 for(const empresa of ['a','b']){
  const account=await browser.newContext();await account.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const p=await account.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/login');await p.locator('[name=login]').fill(`admin-${empresa}@nuflow.test`);await p.locator('[name=password]').fill('NuFlow-Local-2026!');await p.getByRole('button',{name:'Entrar',exact:true}).click();await p.waitForURL('**/dashboard');
  if(empresa==='a'){assert.equal((await account.request.get(base+'/api/demandas/'+job.id)).status(),404)}
  else{await p.goto(base+'/jobs?visual=novo');await p.getByRole('button',{name:'Lista',exact:true}).click();const link=p.getByRole('region',{name:'Lista de Jobs'}).getByRole('link',{name:new RegExp(cliente)});await link.waitFor();await link.click();await p.getByText('Consultora: Consultora QA',{exact:false}).first().waitFor();await p.screenshot({path:'/tmp/nuflow-job-form-result.png',fullPage:true});}
  await account.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: formulário público, Job real em B, A sem acesso, cinco campos persistidos, UTC-3, replay sem duplicação, datas inválidas rejeitadas, mobile sem overflow');
 }finally{await db.demanda.deleteMany({where:{clienteFinalNome:cliente}});if(!atorAntes){await db.usuarioOrganizacao.deleteMany({where:{usuarioId:atorId}});await db.usuario.deleteMany({where:{id:atorId}})}await db.$disconnect();await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
