require('dotenv').config({path:'.env.local',quiet:true});
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PrismaClient}=require('@prisma/client');
const {PrismaPg}=require('@prisma/adapter-pg');
const url=new URL(process.env.DATABASE_URL);
assert(url.hostname==='127.0.0.1'&&url.port==='55437'&&url.pathname==='/nuflow_local');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
(async()=>{
 let browser,account,id;
 try {
  const org=await db.organizacao.findUniqueOrThrow({where:{slug:'estudio-local-a'}});
  const password='QA-Manager-Local-2026!',stamp=Date.now();
  account=await db.usuario.create({data:{nome:'QA Gestor temporário',email:`manager-${stamp}@nuflow.test`,tipo:'gestor',senhaHash:await require('bcryptjs').hash(password,10)}});
  await db.usuarioOrganizacao.create({data:{usuarioId:account.id,organizacaoId:org.id,papel:'gestor',areas:['audiovisual']}});
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext();
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const page=await context.newPage(),base='http://127.0.0.1:3108';
  await page.goto(base+'/login');await page.locator('[name=login]').fill(account.email);await page.locator('[name=password]').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/dashboard');
  const endpoint=base+'/api/configuracoes/parametros';
  const created=await context.request.post(endpoint,{data:{grupo:'departamentos',valor:`qa_manager_${stamp}`,label:'QA Gestor'}});
  assert.equal(created.status(),201);id=(await created.json()).parametro.id;
  await page.goto(base+'/configuracoes?visual=novo');
  await page.getByRole('button',{name:'Parâmetros',exact:true}).click();
  await page.getByRole('button',{name:'Editar QA Gestor',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Remover QA Gestor',exact:true}).count(),0);
  for(const ativo of [false,true]){
   assert.equal((await context.request.patch(endpoint+'/'+id,{data:{ativo,label:'QA Gestor editado'}})).status(),200);
   const response=await context.request.get(endpoint+'?incluirInativos=1');assert.equal(response.status(),200);
   const item=(await response.json()).parametros.find(x=>x.id===id);assert.equal(item.ativo,ativo);assert.equal(item.label,'QA Gestor editado');
  }
  assert.equal((await context.request.delete(endpoint+'/'+id)).status(),403);
  assert(await db.configParametro.findUnique({where:{id}}));
  console.log('PASS: gestor autenticado cria, edita, desativa e reativa; exclusão retorna 403 e preserva registro');
 }finally{
  if(id)await db.configParametro.delete({where:{id}});
  if(account){await db.usuarioOrganizacao.deleteMany({where:{usuarioId:account.id}});await db.usuario.delete({where:{id:account.id}})}
  if(browser)await browser.close();await db.$disconnect();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
