// Teste visual isolado: TODA API é interceptada. Nenhum banco ou envio real.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { SignJWT } = require('jose');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({headless:true,channel:"chrome"});
 const context = await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
 const token = await new SignJWT({id:'preview-user',sub:'preview-user',tipo:'admin',papel:'admin',organizacaoId:'preview-org',name:'Pessoa de teste'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode('nuflow-local-preview-only-secret-2026'.slice(0,32)));
 await context.addCookies([{name:'authjs.session-token',value:token,url:'http://127.0.0.1:3107'}]);
 const page = await context.newPage(); let role = 'admin'; let mode = 'success'; let ideiasEnabled = true; let releaseMetrics; let holdMetrics = false; let failJobs = false; let failOrder = false; let writes = 0; const errors=[];page.on('pageerror', e=>errors.push(e.message));
 const statuses=['aguardando_triagem','planejamento','editando','revisao_pendente','postagem_pendente','entregue_cliente'];
 const columns=['entrada','producao','edicao','aprovacao','para_postar','finalizado'];
 const demands=Array.from({length:12},(_,i)=>({id:`demo-${i}`,codigo:`DEMO-${100+i}`,titulo:['Filme de lançamento','Campanha de primavera','Entrevista institucional','Conteúdo para redes','Captação de produto','Vídeo aprovado'][i%6],departamento:'audiovisual',tipoVideo:'reels',prioridade:i===0?'alta':'normal',statusVisivel:columns[i%6],statusInterno:statuses[i%6],finalizadaEm:new Date().toISOString(),dataLimite:'2026-12-20',editor:{nome:'Editor de teste'},posicaoKanban:i}));
 await context.route('**/*', async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1') return route.abort();
  if(url.pathname==='/campo') return route.fulfill({contentType:'text/html',body:'<h1>Destino mobile preservado</h1>'});
  if(!url.pathname.startsWith('/api/')) return route.continue();
  if(url.pathname==='/api/dashboard/metrics') {
    if(holdMetrics) await new Promise(resolve=>{releaseMetrics=resolve});
    return route.fulfill({status:mode==='error'?500:200,contentType:'application/json',body:JSON.stringify(mode==='error'?{error:'Teste'}:{metricas:{emEdicao:8,urgentesHoje:2,prazoCritico:3,concluidasMes:24,aguardandoAprovacao:5,paraPostar:2},cargaEditores:mode==='empty'?[]:[{id:'e1',nome:'Rafael',cargaAtual:4,cargaLimite:5,status:'sobrecarga'},{id:'e2',nome:'Marina',cargaAtual:2,cargaLimite:5,status:'ok'}],alertasAtivos:[]})});
  }
  if(url.pathname.endsWith('/posicao')) {
    writes++;
    return route.fulfill({status:failOrder?403:200,contentType:'application/json',body:JSON.stringify(failOrder?{error:'Sem permissão'}:{ok:true})});
  }
  let data={};
  if(url.pathname==='/api/auth/session') data={user:{id:'preview-user',name:'Pessoa de teste',tipo:role},expires:'2099-01-01'};
  else if(url.pathname==='/api/me') data={id:'preview-user',nome:'Pessoa de teste',tipo:role,superAdmin:false,modulos:{growth:true,eventos:false,ideias:ideiasEnabled,mensagens:false},membership:{areas:['growth'],organizacaoId:'preview-org'},permissoes:{}};
  else if(url.pathname==='/api/dashboard/hoje') data={eventosHoje:[],demandasCriticas:[],custosVencendo:[],alertasCriticos:[],geradoEm:'2026-09-20T12:00:00Z'};
  else if(url.pathname==='/api/kpi/b2c-b2b') data={b2c:{count:14,percent:70},b2b:{count:6,percent:30},sem_classificacao:{count:0,percent:0}};
  else if(url.pathname==='/api/ideias/kpi') data={totalIdeias:10,novas:2,emAnalise:1,realizadas:4,taxaConversao:40,ideiasEsteMes:2};
  else if(url.pathname==='/api/demandas' && url.searchParams.get('tipoVideo')==='cobertura_evento') {
   if(failJobs) return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Falha simulada'})});
   data={demandas:demands.map(d=>({...d,tipoVideo:'cobertura_evento',statusInterno:d.id==='demo-0'?'aguardando_aprovacao_interna':d.statusInterno}))};
  }
  else if(url.pathname==='/api/demandas') data={demandas:demands.filter(d=>!url.searchParams.get('search')||d.titulo.toLowerCase().includes(url.searchParams.get('search').toLowerCase()))};
  else if(url.pathname.includes('videomakers'))data={videomakers:[]};
  else if(url.pathname.includes('editores'))data={editores:[]};
  else if(url.pathname.includes('responsaveis'))data={responsaveis:[]};
  else if(url.pathname.includes('produtos'))data={produtos:[]};
  else if(url.pathname.includes('linhas-projetos'))data={linhas:[]};
  else if(url.pathname.includes('parametros'))data={parametros:[]};
  else if(url.pathname.includes('organizacoes'))data={organizacoes:[]};
  else if(url.pathname.includes('notificacoes'))data={notificacoes:[],naoLidas:0};
  else if(url.pathname.includes('foco'))data={emFoco:null,sugeridas:[],totalAbertas:0,atrasadas:0};
  else if(url.pathname.includes('whatsapp'))data={connected:false};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const output=process.env.QA_OUTPUT || '/tmp/nuflow-dashboard-qa';fs.mkdirSync(output,{recursive:true});
 holdMetrics=true;
 await page.goto('http://127.0.0.1:3107/dashboard?visual=novo');
 await page.getByRole('status').filter({hasText:'Carregando indicadores'}).waitFor();
 holdMetrics=false; releaseMetrics();
 await page.getByText('Vídeos entregues',{exact:true}).waitFor();
 await page.getByText('24',{exact:true}).waitFor();
 await page.getByText('Rafael',{exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:/Em edição.*Demandas nesta etapa/}).getAttribute('href'),'/demandas?statusVisivel=edicao');
 await page.screenshot({path:`${output}/dashboard-desktop.png`,fullPage:true});
 await page.setViewportSize({width:820,height:1180});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:`${output}/dashboard-tablet.png`,fullPage:true});
 await page.setViewportSize({width:1440,height:960});
 mode='error';
 await page.goto('http://127.0.0.1:3107/dashboard?visual=novo');
 await page.getByRole('heading',{name:'Não foi possível carregar o dashboard'}).waitFor();
 assert.equal(await page.getByText('24',{exact:true}).count(),0);
 mode='success'; await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
 await page.getByText('24',{exact:true}).waitFor();
 mode='empty'; ideiasEnabled=false;
 await page.goto('http://127.0.0.1:3107/dashboard?visual=novo');
 await page.getByText('Nenhum editor cadastrado.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Ideias que viram trabalho'}).count(),0);
 await page.goto('http://127.0.0.1:3107/dashboard?visual=classico');
 await page.getByText('Demandas Ativas',{exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Clareza para o próximo passo.'}).count(),0);
 role='designer';
 await page.goto('http://127.0.0.1:3107/dashboard?visual=novo');
 await page.getByText(/arte\(s\) ativa\(s\) atribuída\(s\) a você/).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Clareza para o próximo passo.'}).count(),0);
 role='videomaker';
 await page.goto('http://127.0.0.1:3107/dashboard?visual=novo');
 await page.getByText('Meu Painel',{exact:true}).first().waitFor();
 assert.equal(await page.getByRole('heading',{name:'Clareza para o próximo passo.'}).count(),0);
 role='admin'; await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:3107/dashboard?visual=novo');
 await page.waitForURL('**/campo');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,checks:['loading','desktop','tablet sem overflow','métricas e links','falha e retry','equipe vazia','módulo ideias desligado','clássico','designer','videomaker','redirecionamento mobile'],output}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
