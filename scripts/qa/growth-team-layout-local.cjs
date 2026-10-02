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
await page.route('**/api/growth/equipe',r=>fail?r.abort():r.continue());
await page.goto('http://127.0.0.1:3108/growth/equipe?visual=novo');
await page.getByRole('alert').filter({hasText:'Não foi possível carregar a equipe Growth.'}).waitFor();
assert.equal(await page.getByText('Nenhuma pessoa marcada',{exact:false}).count(),0);
fail=false;
await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
await page.getByText(/no time\./).waitFor();
await page.getByRole('heading',{name:'Quem transforma ideias em conteúdo.'}).waitFor();
await page.screenshot({path:'/tmp/nuflow-growth-team-desktop.png'});
await page.setViewportSize({width:390,height:844});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
const api=await context.request.get('http://127.0.0.1:3108/api/growth/equipe');
for(const member of (await api.json()).equipe){for(const value of [member.nome,member.email].filter(Boolean)){const item=page.getByRole('main').getByText(value,{exact:true});assert(await item.evaluate(e=>e.scrollWidth<=e.clientWidth),'Texto cortado: '+value);}}
await page.screenshot({path:'/tmp/nuflow-growth-team-mobile.png'});
console.log('PASS: erro sem falso vazio, recuperação pela API local, desktop/mobile sem overflow; nenhuma mutação');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
