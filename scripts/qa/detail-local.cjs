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
 assert.equal(await a.page.getByRole('button',{name:'Ver como tabela'}).count(),0);
 await a.page.getByRole('combobox',{name:'Abrir detalhes'}).selectOption('drawer');
 const ds=await (await a.api.get(base+'/api/demandas')).json();const title=ds.demandas.find(d=>d.area==='audiovisual').titulo;
 await a.page.getByText(title,{exact:true}).first().click();
 const dialog=a.page.getByRole('dialog',{name:'Detalhes da demanda'});await dialog.waitFor();
 await a.page.waitForTimeout(300);let box=await dialog.boundingBox();assert(Math.abs(box.x+box.width-1440)<3);
 for(const label of ['Pedido','Entrega','Conversa','Equipe e contexto']) {
  const tab=dialog.getByRole('button',{name:label,exact:true});await tab.click();
  assert.equal(await tab.getAttribute('aria-pressed'),'true');
 }
 await dialog.getByRole('button',{name:'Conversa',exact:true}).click();
 await dialog.getByRole('heading',{name:/Coment/}).waitFor();
 const draft='Rascunho local de revisão do protótipo';
 await dialog.getByPlaceholder('Escreva um comentário… use @ para marcar alguém').fill(draft);
 await dialog.getByRole('button',{name:'Entrega',exact:true}).click();
 await dialog.getByRole('button',{name:'Conversa',exact:true}).click();
 assert.equal(await dialog.getByPlaceholder('Escreva um comentário… use @ para marcar alguém').inputValue(),draft);
 await dialog.getByRole('button',{name:'Pedido',exact:true}).click();
 await a.page.screenshot({path:'/tmp/nuflow-v8-detail.png'});
 await dialog.getByRole('button',{name:'Abrir em janela ampliada'}).click();
 await dialog.getByRole('button',{name:'Abrir em painel lateral'}).waitFor();
 await dialog.getByRole('button',{name:'Fechar',exact:true}).click();
 await a.page.getByRole('button',{name:'Ver como lista'}).click();
 await a.page.getByText(title,{exact:true}).first().click();await dialog.waitFor();
 await dialog.getByRole('button',{name:'Abrir em painel lateral'}).waitFor();
 await a.page.setViewportSize({width:390,height:844});
 await a.page.waitForTimeout(300);
 const mobileBox=await dialog.boundingBox();assert(mobileBox.width<=390);
 await dialog.getByRole('button',{name:'Equipe e contexto',exact:true}).click();
 await a.page.screenshot({path:'/tmp/nuflow-v8-detail-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: apenas lista/kanban, painel alinhado à direita, alternância modal, lista usa detalhes e preferência persiste');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
