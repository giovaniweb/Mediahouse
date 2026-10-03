require('dotenv').config({path:'.env.local',quiet:true});
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const url=new URL(process.env.DATABASE_URL);assert(url.hostname==='127.0.0.1'&&url.port==='55437'&&url.pathname==='/nuflow_local');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
for(const suffix of ['a','b']){
 const ctx=await browser.newContext();await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const page=await ctx.newPage();await page.goto('http://127.0.0.1:3108/login');await page.locator('[name=login]').fill('admin-'+suffix+'@nuflow.test');await page.locator('[name=password]').fill('NuFlow-Local-2026!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/dashboard');
 const org=await db.organizacao.findUniqueOrThrow({where:{slug:'estudio-local-'+suffix}});
 const memberships=await db.usuarioOrganizacao.findMany({where:{organizacaoId:org.id,categoria:'interna',areas:{has:'growth'},usuario:{status:'ativo'}},select:{usuarioId:true}});
 const response=await ctx.request.get('http://127.0.0.1:3108/api/growth/equipe');assert.equal(response.status(),200);const {equipe}=await response.json();
 assert.deepEqual(equipe.map(m=>m.id).sort(),memberships.map(m=>m.usuarioId).sort());
 await page.goto('http://127.0.0.1:3108/growth/equipe?visual=novo');await page.getByText(/no time\./).waitFor();
 for(const member of equipe) await page.getByRole('main').getByText(member.nome,{exact:true}).waitFor();
 await ctx.close();
}
console.log('PASS: equipes A/B correspondem aos vínculos ativos internos Growth de cada empresa; nenhuma mutação');
}finally{await db.$disconnect();await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
