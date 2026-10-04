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
 const a=await login('admin-a@nuflow.test');console.log('Login real A aprovado');
 await a.page.goto(base+'/demandas?visual=novo');
 const av=a.page.locator('#menu-Audiovisual');
 await av.locator('summary').filter({hasText:'Equipe audiovisual'}).click();
 for(const name of ['Videomakers Externos','Videomakers Internos','Custos'])await av.getByRole('link',{name,exact:true}).waitFor();
 assert.equal(await a.page.getByRole('button',{name:'Equipe audiovisual',exact:true}).count(),0);
 await av.getByRole('link',{name:'Videomakers Internos',exact:true}).click();
 await a.page.waitForURL('**/equipe');
 await a.page.locator('#menu-Audiovisual').getByRole('link',{name:'Videomakers Internos',exact:true}).waitFor();
 assert.equal(await a.page.locator('#menu-Audiovisual details').getAttribute('open'),'');
 console.log('PASS: equipe embutida, três links e expansão automática na rota da equipe');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
