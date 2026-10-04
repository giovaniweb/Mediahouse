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
 for(const route of ['demandas','design']){
 await a.page.goto(base+'/'+route+'?visual=novo');
 assert.equal(await a.page.getByRole('button',{name:'Importar planilha'}).count(),0);
 await a.page.getByRole('heading',{name:route==='demandas'?'Produção em movimento.':'Conteúdo que move.',exact:true}).waitFor();
 await a.page.getByRole('button',{name:'Ver como lista',exact:true}).click();
 await a.page.getByRole('button',{name:'Ver como kanban',exact:true}).click();
 const search=a.page.getByPlaceholder(/Buscar/).first();
 await search.fill('sem-resultado-local-qa');
 await a.page.waitForTimeout(600);
 await search.fill('');await a.page.waitForTimeout(600);
 await a.page.screenshot({path:'/tmp/nuflow-v8-'+route+'-desktop.png'});
 await a.page.setViewportSize({width:390,height:844});
 await a.page.getByRole('button',{name:'Buscar e filtrar'}).click();
 await search.waitFor({state:'visible'});
 await a.page.screenshot({path:'/tmp/nuflow-v8-'+route+'-mobile.png'});
 await a.page.setViewportSize({width:1440,height:960});
 await a.page.getByRole('button',{name:'Nova Demanda',exact:true}).click();
 await a.page.getByRole('dialog').waitFor();
 }
 const retired=await a.api.post(base+'/api/demandas/importar',{data:{}});
 assert([404,405].includes(retired.status()));
 assert.deepEqual(errors,[]);
 console.log('PASS: quadros v8, controles desktop/mobile, importação removida, Nova Demanda abre nos dois quadros, endpoint removido');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
