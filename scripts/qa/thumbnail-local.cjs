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
 const original=await db.demanda.findFirstOrThrow({where:{codigo:'LOCAL-a-audiovisual'},select:{id:true,thumbnailUrl:true,titulo:true}});
 try {
 const a=await login('admin-a@nuflow.test');
 await db.demanda.update({where:{id:original.id},data:{thumbnailUrl:'/icon-512.png'}});
 await a.page.goto(base+'/demandas?visual=novo');
 const cover=a.page.getByRole('img',{name:'Prévia de '+original.titulo});
 await cover.waitFor();
 await a.page.waitForFunction(()=>[...document.images].some(i=>i.alt.startsWith('Prévia de ')&&i.complete&&i.naturalWidth>0));
 assert.equal(await cover.getAttribute('draggable'),'false');
 await a.page.screenshot({path:'/tmp/nuflow-thumbnail-desktop.png'});
 await cover.click();
 await a.page.getByRole('dialog',{name:'Detalhes da demanda'}).waitFor();
 await a.page.getByRole('dialog',{name:'Detalhes da demanda'}).getByRole('button',{name:'Fechar',exact:true}).click();
 await a.page.getByRole('dialog',{name:'Detalhes da demanda'}).waitFor({state:'hidden'});
 await a.page.setViewportSize({width:390,height:844});
 await cover.scrollIntoViewIfNeeded();
 await a.page.screenshot({path:'/tmp/nuflow-thumbnail-mobile.png'});
 assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await db.demanda.update({where:{id:original.id},data:{thumbnailUrl:'/qa-missing-thumbnail.png'}});
 await a.page.reload();
 await a.page.getByText(original.titulo,{exact:true}).first().waitFor();
 await cover.scrollIntoViewIfNeeded().catch(()=>{});
 await cover.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 console.log('PASS: imagem local carregada, arraste nativo desativado, abertura de detalhes, mobile e fallback de imagem quebrada');
 } finally {
 await db.demanda.update({where:{id:original.id},data:{thumbnailUrl:original.thumbnailUrl}});
 await db.$disconnect();await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});
