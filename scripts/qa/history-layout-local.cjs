const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
const context=await browser.newContext({viewport:{width:1440,height:960}});
await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
const page=await context.newPage();
await page.goto('http://127.0.0.1:3108/login');
await page.locator('[name=login]').fill('admin-a@nuflow.test');
await page.locator('[name=password]').fill('NuFlow-Local-2026!');
await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/dashboard');
let fail=true;
await page.route('**/api/demandas?*',r=>fail?r.abort():r.continue());
await page.goto('http://127.0.0.1:3108/historico?visual=novo');
await page.getByRole('alert').filter({hasText:'Não foi possível carregar o histórico.'}).waitFor();
assert.equal(await page.getByText('Nenhuma demanda encontrada',{exact:true}).count(),0);
fail=false;
const response=page.waitForResponse(r=>r.url().includes('/api/demandas?')&&r.status()===200);
await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
const data=await (await response).json();
await page.getByRole('alert').filter({hasText:'Não foi possível carregar o histórico.'}).waitFor({state:'hidden'});
await page.getByRole('button',{name:'Filtros',exact:true}).click();
assert(await page.getByLabel('Finalizado de',{exact:true}).isVisible());
assert(await page.getByLabel('Até',{exact:true}).isVisible());
assert(await page.getByLabel('Tipo de vídeo',{exact:true}).isVisible());
for(const size of [{width:1440,height:960},{width:390,height:844}]) {
await page.setViewportSize(size);
// Aguarda o repaint após resize antes de capturar o compositor do Chrome.
await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
if(size.width===390) {
assert.equal(await page.getByRole("button",{name:"Abrir navegação",exact:true}).count(),1);
assert.equal(await page.getByRole("heading",{name:"O trabalho que já virou entrega.",exact:true}).count(),1);
}
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.screenshot({path:'/tmp/nuflow-history-'+size.width+'.png'});
}
console.log('PASS: histórico: erro sem falso vazio, retry com API local, labels e desktop/mobile sem overflow; nenhuma mutação');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
