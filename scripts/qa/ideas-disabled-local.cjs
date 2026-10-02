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
await page.goto('http://127.0.0.1:3108/ideias?visual=novo');
await page.waitForURL('**/dashboard');
const response=await context.request.get('http://127.0.0.1:3108/api/ideias');
assert.equal(response.status(),403);
console.log('PASS: módulo Ideias indisponível: página redireciona e API retorna 403; nenhuma configuração alterada');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
