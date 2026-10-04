require('dotenv').config({path:'.env.local',quiet:true});
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');const assert=require('node:assert/strict'),bcrypt=require('bcryptjs');
const url=new URL(process.env.DATABASE_URL);assert(url.hostname==='127.0.0.1'&&url.port==='55437'&&url.pathname==='/nuflow_local');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],base='http://127.0.0.1:3108',stamp=Date.now(),email=`lead-${stamp}@nuflow.test`,vmEmail=`vm-${stamp}@nuflow.test`,vmName=`QA Videomaker ${stamp}`;
let ctx=await browser.newContext({viewport:{width:1440,height:960}});await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());let page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
async function login(email){await page.goto(base+'/login');await page.locator('[name=login]').fill(email);await page.locator('[name=password]').fill('NuFlow-Local-2026!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/dashboard')}
let platform;
try{
platform=await db.usuario.create({data:{nome:'QA plataforma',email:`plataforma-${stamp}@nuflow.test`,superAdmin:true,tipo:'admin',senhaHash:await bcrypt.hash('NuFlow-Local-2026!',12)}});
const platformOrg=await db.organizacao.findUniqueOrThrow({where:{slug:'estudio-local-a'}});await db.usuarioOrganizacao.create({data:{usuarioId:platform.id,organizacaoId:platformOrg.id,papel:'admin',areas:['audiovisual']}});
await page.goto(base+'/comecar?utm_source=qa&utm_campaign=local');
for(const [name,value] of [['Seu nome','QA Lead'],['E-mail de trabalho',email],['WhatsApp com DDD','31900000000'],['Empresa ou nome do seu estúdio','Estúdio QA']])await page.getByLabel(name,{exact:true}).fill(value);
await page.getByRole('checkbox').check();await page.screenshot({path:'/tmp/nuflow-lead-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/nuflow-lead-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.getByRole('button',{name:'Quero conhecer o NuFlow'}).click();await page.getByRole('heading',{name:'Vamos conversar sobre seu flow.'}).waitFor();
const lead=await db.leadComercial.findFirstOrThrow({where:{email}});assert.equal(lead.campanha,'local');assert.equal(lead.origem,'qa');
assert.equal((await ctx.request.get(base+'/api/admin/leads')).status(),401);
await page.goto(base+'/cadastrar-videomaker?org=estudio-local-b');
await page.getByLabel('CNPJ ou CPF',{exact:true}).fill(String(stamp).slice(-11));await page.getByRole('button',{name:'Continuar →',exact:true}).click();
for(const [name,value] of [['Nome completo',vmName],['E-mail',vmEmail],['WhatsApp','31900000001'],['Cidade','Belo Horizonte'],['Estado','MG']])await page.getByLabel(name,{exact:true}).fill(value);
await page.getByRole('button',{name:'Continuar →',exact:true}).click();await page.getByLabel('Portfólio',{exact:true}).fill('https://example.com/portfolio');await page.screenshot({path:'/tmp/nuflow-recruit-mobile.png'});await page.getByRole('button',{name:'Enviar Cadastro ✓'}).click();await page.getByRole('heading',{name:'Cadastro enviado!'}).waitFor();
const vm=await db.videomaker.findFirstOrThrow({where:{email:vmEmail}}),org=await db.organizacao.findUniqueOrThrow({where:{slug:'estudio-local-b'}});const links=await db.videomakerOrganizacao.findMany({where:{videomakerId:vm.id}});assert.equal(links.length,1);assert.equal(links[0].organizacaoId,org.id);assert.equal(links[0].status,'pendente');
await login('admin-a@nuflow.test');assert.equal((await ctx.request.get(base+'/api/admin/leads')).status(),403);
await ctx.close();ctx=await browser.newContext({viewport:{width:390,height:844}});await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await login(platform.email);await page.goto(base+'/admin/leads');await page.getByText(email,{exact:true}).waitFor();await page.setViewportSize({width:1440,height:960});await page.screenshot({path:'/tmp/nuflow-leads-admin.png'});assert.deepEqual(errors,[]);console.log('PASS: lead persistido com UTM; acesso anônimo/cliente negado e super-admin permitido; candidatura pendente vinculada somente à empresa B; mobile sem overflow');
}finally{if(platform){await db.usuarioOrganizacao.deleteMany({where:{usuarioId:platform.id}});await db.usuario.delete({where:{id:platform.id}})}await db.leadComercial.deleteMany({where:{email}});const vm=await db.videomaker.findFirst({where:{email:vmEmail}});if(vm){await db.videomakerDadosFiscais.deleteMany({where:{videomakerId:vm.id}});await db.videomakerOrganizacao.deleteMany({where:{videomakerId:vm.id}});await db.videomaker.delete({where:{id:vm.id}})}await db.alertaIA.deleteMany({where:{mensagem:{contains:vmName}}});await db.$disconnect();await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
