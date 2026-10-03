require('dotenv').config({path:'.env.local',quiet:true});
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const url=new URL(process.env.DATABASE_URL);assert(url.hostname==='127.0.0.1'&&url.port==='55437'&&url.pathname==='/nuflow_local');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),base='http://127.0.0.1:3108',ids=[];let vm;
try{
const org=await db.organizacao.findUniqueOrThrow({where:{slug:'estudio-local-a'}}),user=await db.usuario.findUniqueOrThrow({where:{email:'admin-a@nuflow.test'}});
vm=await db.videomaker.create({data:{nome:'QA convite local',redesSociais:[],areasAtuacao:[],habilidades:[],equipamentos:[]}});
const d=await db.demanda.create({data:{codigo:'QA-ACCESS-'+Date.now(),titulo:'Uma produção com todos os detalhes para o próximo encontro',descricao:'Descrição temporária local. Revisar o briefing e combinar a captação.',departamento:'outros',tipoVideo:'outro',cidade:'Belo Horizonte',localGravacao:'Rua de teste, 123 — endereço ilustrativo',organizacaoId:org.id,solicitanteId:user.id}});ids.push(d.id);
const token=crypto.randomBytes(24).toString('hex');const invite=await db.conviteVideomaker.create({data:{demandaId:d.id,videomakerId:vm.id,token,expiresAt:new Date(Date.now()+3600000)}});
const c=await browser.newContext();await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
for(const size of [{width:1440,height:960},{width:390,height:844}]){
await p.setViewportSize(size);
for(const [path,title] of [['/login','Entre no seu flow.'],['/esqueci-senha','Vamos recuperar seu acesso.'],['/redefinir-senha/qa-invalid','Este link não está disponível.'],['/comecar','Menos desorganização.'],['/cadastrar-videomaker?org=estudio-local-a','Seu olhar. Novas possibilidades.'],['/agendar-gravacao','Precisamos do link da empresa.']]){
await p.goto(base+path);await p.getByRole('heading',{name:new RegExp(title.replaceAll('.','\\.'))}).waitFor();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,path);}
await p.goto(base+'/convite/'+token);await p.getByRole('heading',{name:d.titulo,exact:true}).waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:'/tmp/nuflow-access-invite-'+size.width+'.png'});
}
// Real GET recovery, POST network failure only: no message is sent to anyone.
await p.route('**/api/convites/'+token,r=>r.request().method()==='POST'?r.abort():r.continue());await p.getByRole('button',{name:'Aceitar convite',exact:true}).click();await p.getByRole('alert').waitFor();await p.getByRole('heading',{name:d.titulo,exact:true}).waitFor();assert.equal((await db.conviteVideomaker.findUniqueOrThrow({where:{id:invite.id}})).status,'pendente');await p.getByRole('button',{name:'Conferir estado do convite'}).click();await p.getByRole('heading',{name:d.titulo,exact:true}).waitFor();
for(const [status,title] of [['aceito','Participação confirmada.'],['recusado','Convite recusado.'],['expirado','Este convite expirou.']]){await db.conviteVideomaker.update({where:{id:invite.id},data:{status}});await p.reload();await p.getByRole('heading',{name:title,exact:true}).waitFor();}
await p.goto(base+'/convite/qa-invalid');await p.getByRole('heading',{name:'Convite indisponível.',exact:true}).waitFor();
await p.goto(base+'/login/qa-pagina-inexistente');await p.getByRole('heading',{name:'Este caminho não está disponível.',exact:true}).waitFor();await p.screenshot({path:'/tmp/nuflow-access-404-mobile.png'});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
assert.deepEqual(errors,[]);console.log('PASS: acesso/captura desktop e mobile, convite real local, erro de envio preserva detalhes, estados terminais, link inválido e 404; nenhum POST de convite enviado');
}finally{await db.demanda.deleteMany({where:{id:{in:ids}}});if(vm)await db.videomaker.delete({where:{id:vm.id}});await db.$disconnect();await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
