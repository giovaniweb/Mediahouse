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
await page.route('**/api/growth/galeria?*',r=>fail?r.abort():r.continue());
await page.goto('http://127.0.0.1:3108/galeria-artes?visual=novo');
await page.getByRole('alert').filter({hasText:'Não foi possível carregar os criativos.'}).waitFor();
assert.equal(await page.getByText('Nenhuma arte finalizada ainda.',{exact:true}).count(),0);
fail=false;
const response=page.waitForResponse(r=>r.url().includes('/api/growth/galeria?')&&r.status()===200);
await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
const data=await (await response).json();
await page.getByRole('alert').filter({hasText:'Não foi possível carregar os criativos.'}).waitFor({state:'hidden'});
assert(await page.getByLabel('Buscar criativo',{exact:true}).isVisible());
for(const size of [{width:1440,height:960},{width:390,height:844}]) {
await page.setViewportSize(size);
// Aguarda o repaint após resize antes de capturar o compositor do Chrome.
await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
if(size.width===390) {
assert.equal(await page.getByRole("button",{name:"Abrir navegação",exact:true}).count(),1);
assert.equal(await page.getByRole("heading",{name:"Ideias que ganharam forma.",exact:true}).count(),1);
}
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.screenshot({path:'/tmp/nuflow-gallery-'+size.width+'.png'});
}
console.log('PASS: galeria: erro sem falso vazio, retry com API local, labels e desktop/mobile sem overflow; nenhuma mutação');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
