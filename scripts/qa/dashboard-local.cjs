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
 const a=await login('admin-a@nuflow.test');
 await a.page.goto(base+'/dashboard?visual=novo');
 await a.page.getByRole('heading',{name:'Sua operação, em perspectiva.',exact:true}).waitFor();
 const data=await (await a.api.get(base+'/api/dashboard/metrics')).json();
 const decisions=a.page.getByRole('region',{name:'Decisões de hoje'});
 await decisions.getByText(`${data.metricas.aguardandoAprovacao} demandas em aprovação`,{exact:true}).waitFor();
 assert.equal(await decisions.getByRole('link',{name:/Revisar entregas/}).getAttribute('href'),'/demandas?statusVisivel=aprovacao');
 assert.equal(await decisions.getByRole('link',{name:/Retomar prazos/}).getAttribute('href'),'/demandas?atrasadas=1');
 await a.page.screenshot({path:'/tmp/nuflow-dashboard-v8-desktop.png',fullPage:true});
 await a.page.setViewportSize({width:390,height:844});
 await a.page.screenshot({path:'/tmp/nuflow-dashboard-v8-mobile.png',fullPage:true});
 const overflow=await a.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
 assert.equal(overflow,false);
 await decisions.getByRole('link',{name:/Revisar entregas/}).click();
 await a.page.waitForURL('**/demandas?statusVisivel=aprovacao');
 await a.page.getByRole('heading',{name:'Produção em movimento.',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: dashboard v8 com valores reais, links de recorte, desktop/mobile sem overflow');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
