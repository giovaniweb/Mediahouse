const fs=require('node:fs'),crypto=require('node:crypto');
const {Client}=require('pg');
(async()=>{
 if(fs.existsSync('.env.local'))throw new Error('Já existe .env.local; não sobrescrever.');
 const password=crypto.randomBytes(24).toString('hex');
 const db=new Client({host:'/Users/giovanigomes/MediaHouse/.nuflow-local',port:55437,user:'nuflow_owner',database:'postgres'});
 await db.connect();
 await db.query(`ALTER ROLE nuflow_owner PASSWORD '${password}'`);
 await db.query('CREATE DATABASE nuflow_local');await db.end();
 const url=`postgresql://nuflow_owner:${password}@127.0.0.1:55437/nuflow_local`;
 fs.writeFileSync('.env.local',`DATABASE_URL=${url}\nDIRECT_URL=${url}\nAUTH_SECRET=${crypto.randomBytes(32).toString('hex')}\nAUTH_TRUST_HOST=true\nNEXTAUTH_URL=http://127.0.0.1:3108\nORG_PUBLICA_PADRAO=estudio-local-a\nRLS_ATIVO=nao\n`,{mode:0o600});
 console.log('Banco local criado; credenciais em .env.local ignorado pelo Git.');
})().catch(e=>{console.error(e.message);process.exit(1)});
