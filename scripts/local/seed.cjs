require('dotenv').config({path:'.env.local',quiet:true});
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg'),bcrypt=require('bcryptjs');
const url=new URL(process.env.DATABASE_URL);
if(url.hostname!=='127.0.0.1'||url.port!=='55437'||url.pathname!=='/nuflow_local')throw new Error('Somente banco local de teste.');
const p=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
(async()=>{
 const senhaHash=await bcrypt.hash('NuFlow-Local-2026!',12);
 for(const suffix of ['a','b']) {
  const org=await p.organizacao.upsert({where:{slug:`estudio-local-${suffix}`},update:{},create:{nome:`Estúdio Local ${suffix.toUpperCase()}`,slug:`estudio-local-${suffix}`}});
  for(const tipo of ['admin','solicitante']){
   const user=await p.usuario.upsert({where:{email:`${tipo}-${suffix}@nuflow.test`},update:{senhaHash},create:{nome:`${tipo} local ${suffix}`,email:`${tipo}-${suffix}@nuflow.test`,tipo,senhaHash}});
   await p.usuarioOrganizacao.upsert({where:{usuarioId_organizacaoId:{usuarioId:user.id,organizacaoId:org.id}},update:{},create:{usuarioId:user.id,organizacaoId:org.id,papel:tipo,areas:['audiovisual','growth']}});
   if(tipo==='admin') for(const area of ['audiovisual','design']) {
    const codigo=`LOCAL-${suffix}-${area}`;
    if(!await p.demanda.findFirst({where:{codigo}}))await p.demanda.create({data:{organizacaoId:org.id,codigo,titulo:`Campanha local ${suffix.toUpperCase()} — ${area}`,descricao:'Briefing sintético para testar o layout e a persistência.',area,departamento:'outros',tipoVideo:'outro',cidade:'N/A',prioridade:'normal',statusInterno:'pedido_criado',statusVisivel:'entrada',solicitanteId:user.id}});
   }
  }
 }
 const platform=await p.usuario.upsert({where:{email:'plataforma@nuflow.test'},update:{senhaHash},create:{nome:'Admin SaaS local',email:'plataforma@nuflow.test',tipo:'admin',senhaHash,superAdmin:true}});
 const org=await p.organizacao.findUnique({where:{slug:'estudio-local-a'}});
 await p.usuarioOrganizacao.upsert({where:{usuarioId_organizacaoId:{usuarioId:platform.id,organizacaoId:org.id}},update:{},create:{usuarioId:platform.id,organizacaoId:org.id,papel:'admin',areas:['audiovisual','growth']}});
 console.log('Empresas, contas e demandas sintéticas prontas, incluindo administrador SaaS local.');
})().finally(()=>p.$disconnect());
