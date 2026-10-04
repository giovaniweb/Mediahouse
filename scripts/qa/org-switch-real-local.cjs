require(process.cwd()+'/node_modules/dotenv').config({path:'.env.local',quiet:true});
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PrismaClient}=require(process.cwd()+'/node_modules/@prisma/client');
const {PrismaPg}=require(process.cwd()+'/node_modules/@prisma/adapter-pg');
const url=new URL(process.env.DATABASE_URL);
assert(url.hostname==='127.0.0.1'&&url.port==='55437'&&url.pathname==='/nuflow_local');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
(async()=>{
 let browser,account,id;
 try {
  const org=await db.organizacao.findUniqueOrThrow({where:{slug:'estudio-local-a'}});
  const password='QA-Manager-Local-2026!',stamp=Date.now();
  account=await db.usuario.create({data:{nome:'QA Gestor temporário',email:`manager-${stamp}@nuflow.test`,tipo:'gestor',senhaHash:await require(process.cwd()+'/node_modules/bcryptjs').hash(password,10)}});
  await db.usuarioOrganizacao.create({data:{usuarioId:account.id,organizacaoId:org.id,papel:'gestor',areas:['audiovisual']}});
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext();
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const page=await context.newPage(),base='http://127.0.0.1:3108';
  await page.goto(base+'/login');await page.locator('[name=login]').fill(account.email);await page.locator('[name=password]').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/dashboard');
  const second=await db.organizacao.findUniqueOrThrow({where:{slug:'estudio-local-b'}});
  await db.usuarioOrganizacao.create({data:{usuarioId:account.id,organizacaoId:second.id,papel:'solicitante',areas:['audiovisual']}});
  await page.goto(base+'/configuracoes?visual=novo');
  await page.getByRole('button',{name:`Trocar empresa. Atual: ${org.nome}`,exact:true}).click();
  const switched=page.waitForResponse(r=>r.url().endsWith('/api/me/organizacoes')&&r.request().method()==='POST');
  await page.getByRole('menuitem').filter({hasText:second.nome}).click();
  assert.equal((await switched).status(),200);
  await page.getByRole('button',{name:`Trocar empresa. Atual: ${second.nome}`,exact:true}).waitFor();
  assert.equal(await page.evaluate(async()=> (await fetch('/api/configuracoes/parametros?incluirInativos=1')).status),403);
  const state=await page.evaluate(async()=> (await fetch('/api/me/organizacoes')).json());assert.equal(state.ativa,second.id);
  await page.getByRole('button',{name:`Trocar empresa. Atual: ${second.nome}`,exact:true}).click();
  await page.getByRole('menuitem').filter({hasText:org.nome}).click();
  await page.getByRole('button',{name:`Trocar empresa. Atual: ${org.nome}`,exact:true}).waitFor();
  assert.equal(await page.evaluate(async()=> (await fetch('/api/configuracoes/parametros?incluirInativos=1')).status),200);
  console.log('PASS: troca real A→B→A pela UI; empresa ativa e permissão gestor/solicitante atualizadas');
 }finally{
  if(id)await db.configParametro.delete({where:{id}});
  if(account){await db.usuarioOrganizacao.deleteMany({where:{usuarioId:account.id}});await db.usuario.delete({where:{id:account.id}})}
  if(browser)await browser.close();await db.$disconnect();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
