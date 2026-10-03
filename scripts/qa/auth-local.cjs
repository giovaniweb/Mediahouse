// Browser + PostgreSQL local. No SMTP or external requests.
require('dotenv').config({path:'.env.local',quiet:true});
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),bcrypt=require('bcryptjs');
const url=new URL(process.env.DATABASE_URL);
assert(url.hostname==='127.0.0.1'&&url.port==='55437'&&url.pathname==='/nuflow_local');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:960}});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:3108',token=crypto.randomBytes(32).toString('hex'),email='auth-'+Date.now()+'@nuflow.test';
 const user=await db.usuario.create({data:{nome:'QA autenticação local',email,senhaHash:await bcrypt.hash('SenhaAnterior1!',12)}});
 try{
 const org=await db.organizacao.findUniqueOrThrow({where:{slug:'estudio-local-a'}});
 await db.usuarioOrganizacao.create({data:{usuarioId:user.id,organizacaoId:org.id,papel:'solicitante',areas:['audiovisual']}});
 await page.goto(base+'/login');
 await page.getByRole('heading',{name:'Entre no seu flow.'}).waitFor();
 await page.getByLabel('E-mail ou telefone').fill(email);
 await page.getByLabel('Senha',{exact:true}).fill('Errada1!');
 await page.getByRole('button',{name:'Mostrar senha',exact:true}).click();
 assert.equal(await page.locator('#password').getAttribute('type'),'text');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.locator('p[role=alert]').waitFor();
 await page.getByRole('button',{name:'Ocultar senha',exact:true}).click();
 await page.screenshot({path:'/tmp/nuflow-auth-login-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/nuflow-auth-login-mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('link',{name:'Esqueci minha senha'}).click();
 await page.getByLabel('E-mail da conta').fill('nao-existe-qa@nuflow.test');
 await page.getByRole('button',{name:'Enviar link de recuperação'}).click();await page.locator('p[role=alert]').waitFor();
 await page.goto(base+'/redefinir-senha/invalido-qa');
 await page.getByRole('heading',{name:'Este link não está disponível.'}).waitFor();
 await db.passwordResetToken.create({data:{email,token,expiresAt:new Date(Date.now()+3600000)}});
 await page.goto(base+'/redefinir-senha/'+token);
 await page.getByLabel('Nova senha',{exact:true}).fill('NovaSenhaQA123!');
 await page.getByLabel('Confirmar nova senha',{exact:true}).fill('Diferente123!');
 await page.getByRole('button',{name:'Salvar nova senha'}).click();await page.locator('p[role=alert]').waitFor();
 await page.getByLabel('Confirmar nova senha',{exact:true}).fill('NovaSenhaQA123!');
 await page.screenshot({path:'/tmp/nuflow-auth-reset-mobile.png'});
 await page.getByRole('button',{name:'Salvar nova senha'}).click();await page.getByRole('heading',{name:'Senha atualizada.'}).waitFor();
 const saved=await db.usuario.findUniqueOrThrow({where:{id:user.id}});assert(await bcrypt.compare('NovaSenhaQA123!',saved.senhaHash));
 await page.goto(base+'/redefinir-senha/'+token);await page.getByRole('heading',{name:'Este link não está disponível.'}).waitFor();
 await page.goto(base+'/login');await page.getByLabel('E-mail ou telefone').fill(email);await page.getByLabel('Senha',{exact:true}).fill('NovaSenhaQA123!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/dashboard');
 assert.deepEqual(errors,[]);console.log('PASS: login, erro, mostrar senha, recuperação sem SMTP, token inválido/usado, redefinição persistida e login com nova senha; mobile sem overflow');
 }finally{await db.passwordResetToken.deleteMany({where:{email}});await db.usuarioOrganizacao.deleteMany({where:{usuarioId:user.id}});await db.usuario.delete({where:{id:user.id}});await db.$disconnect();await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
