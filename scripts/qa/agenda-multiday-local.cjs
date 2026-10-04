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
 const inicio=new Date();inicio.setDate(1);inicio.setHours(0,0,0,0);inicio.setDate(0);const fim=new Date();fim.setMonth(fim.getMonth()+1,2);fim.setHours(12,0,0,0);
 const response=await a.api.post(base+'/api/agenda',{data:{titulo:'QA agenda vários dias',inicio:inicio.toISOString(),fim:fim.toISOString(),contexto:'sistema',tipo:'reuniao',lembreteMinutos:0}});
 assert.equal(response.status(),201);
 const body=await response.json();const evento=body.evento||body;
 try {
 await a.page.goto(base+'/agenda?visual=novo');
 await a.page.getByRole('heading',{name:'Seu tempo de criar.',exact:true}).waitFor();
 await a.page.getByRole('button',{name:'Semana',exact:true}).click();
 await a.page.getByRole('button',{name:'Abrir evento: QA agenda vários dias',exact:true}).first().waitFor();
 assert.equal(await a.page.getByRole('button',{name:'Abrir evento: QA agenda vários dias',exact:true}).count(),7);assert((await a.page.getByText('Em andamento',{exact:true}).count()) > 0);assert((await a.page.getByRole('button',{name:'Abrir evento: QA agenda vários dias',exact:true}).filter({hasText:'00:00'}).count()) <= 1);await a.page.getByRole('button',{name:'Próxima semana',exact:true}).click();
 await a.page.getByRole('button',{name:'Semana anterior',exact:true}).click();
 await a.page.getByRole('button',{name:'Abrir evento: QA agenda vários dias',exact:true}).first().waitFor();
 await a.page.screenshot({path:'/tmp/nuflow-agenda-multiday-week.png'});
 await a.page.getByRole('button',{name:'Lista',exact:true}).click();
 await a.page.getByRole('combobox',{name:'Abrir detalhes'}).selectOption('drawer');
 await a.page.getByRole('region',{name:'Compromissos do mês'}).getByRole('button',{name:/QA agenda vários dias/}).click();
 const dialog=a.page.getByRole('dialog',{name:'QA agenda vários dias'});await dialog.waitFor();
 let box=await dialog.boundingBox();assert(Math.abs(box.x+box.width-1440)<3);
 await a.page.screenshot({path:'/tmp/nuflow-agenda-multiday-drawer.png'});
 await dialog.getByRole('button',{name:'Ampliar',exact:true}).click();
 await dialog.getByRole('button',{name:'Painel lateral',exact:true}).waitFor();
 await a.page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 await a.page.setViewportSize({width:390,height:844});
 await a.page.screenshot({path:'/tmp/nuflow-agenda-multiday-mobile.png'});
 assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 await a.page.getByRole('button',{name:'Semana',exact:true}).click();
 await a.page.screenshot({path:'/tmp/nuflow-agenda-multiday-week-mobile.png'});
 assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 await a.page.getByRole('button',{name:'Mês',exact:true}).click();
 assert.deepEqual(errors,[]);
 console.log('PASS: evento real, lista, painel/modal, Escape, mobile sem overflow');
 } finally {await a.api.delete(base+'/api/agenda/'+evento.id);await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
