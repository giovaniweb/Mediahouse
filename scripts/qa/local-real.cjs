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
 const b=await login('admin-b@nuflow.test');console.log('Login real B aprovado');
 const demandsA=await (await a.api.get(base+'/api/demandas')).json();
 const demandsB=await (await b.api.get(base+'/api/demandas')).json();
 assert(demandsA.demandas.length>0);assert(demandsB.demandas.length>0);
 assert(demandsA.demandas.every(d=>d.codigo.startsWith('LOCAL-a-')));
 assert(demandsB.demandas.every(d=>d.codigo.startsWith('LOCAL-b-')));
 const d=demandsA.demandas[0];
 const moved=await a.api.patch(base+`/api/demandas/${d.id}/posicao`,{data:{posicaoKanban:7}});assert.equal(moved.status(),200);
 const forbidden=await b.api.patch(base+`/api/demandas/${d.id}/posicao`,{data:{posicaoKanban:99}});assert([403,404].includes(forbidden.status()));
 const listed=await (await a.api.get(base+'/api/demandas')).json();assert.equal(listed.demandas.find(x=>x.id===d.id).posicaoKanban,7);
 const created=await a.api.post(base+'/api/agenda',{data:{titulo:'Captação — teste real local',inicio:'2026-09-28T12:00:00.000Z',fim:'2026-09-28T13:00:00.000Z',contexto:'sistema',tipo:'captacao',lembreteMinutos:30}});
 assert.equal(created.status(),201,await created.text());const event=(await created.json()).evento;
 assert((await (await a.api.get(base+'/api/agenda')).json()).eventos.some(e=>e.id===event.id));
 assert(!(await (await b.api.get(base+'/api/agenda')).json()).eventos.some(e=>e.id===event.id));
 assert.equal((await b.api.delete(base+'/api/agenda/'+event.id)).status(),404);
 assert.equal((await a.api.patch(base+'/api/agenda/'+event.id,{data:{titulo:'Captação editada — teste real'}})).status(),200);
 assert.equal((await a.api.delete(base+'/api/agenda/'+event.id)).status(),200);
 assert(!(await (await a.api.get(base+'/api/agenda')).json()).eventos.some(e=>e.id===event.id));
 fs.mkdirSync('/tmp/nuflow-real-qa',{recursive:true});
 for(const route of ['demandas','design','dashboard','agenda','aprovacoes','usuarios','configuracoes']){
  const res=await a.page.goto(base+'/'+route+'?visual=novo');assert.equal(res.status(),200,route);
  await a.page.waitForTimeout(600);await a.page.screenshot({path:'/tmp/nuflow-real-qa/'+route+'.png'});
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,checks:['real password login two tenants','real demands read','persisted Kanban position','cross-tenant write refused','agenda real create/read/update/delete','cross-tenant event hidden and delete refused','seven pages real backend'],errors}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
