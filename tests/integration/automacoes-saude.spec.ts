import {randomUUID} from "node:crypto"
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from "vitest"
import {NextRequest} from "next/server"
const {sessao,falha}=vi.hoisted(()=>({sessao:{user:null as null|{id:string;organizacaoId:string;tipo:string}},falha:{banco:false}}))
vi.mock("@/lib/auth",()=>({auth:async()=>sessao.user?{user:sessao.user}:null}))
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>undefined})}))
vi.mock("@/lib/automacoes-saude",async original=>{
  const m=await original<typeof import("@/lib/automacoes-saude")>()
  return {...m,saudeWhatsapp:async(org:string)=>{if(falha.banco) throw new Error("falha sintética");return m.saudeWhatsapp(org)}}
})
import {prismaBase as db} from "@/lib/prisma"
import {prismaAuth} from "@/lib/prisma-auth"
import {criarSaida,controlarSaida,processarSaidas} from "@/lib/whatsapp-outbox"
import {hashTelefone} from "@/lib/whatsapp-outbox"
import {acompanharConsumidor,saudeConsumidores} from "@/lib/automacoes-saude"
import {GET as cronInbox} from "@/app/api/cron/whatsapp-inbox/route"
import {GET as saude} from "@/app/api/automacoes/saude/route"
import {GET as status} from "@/app/api/whatsapp/status/route"
import {GET as listar,POST as agir} from "@/app/api/mensagens-falhadas/route"
import {GET as alertas,POST as alterar,PATCH as silenciar} from "@/app/api/alertas/route"
const p=`sau-${randomUUID()}`,a=`${p}-a`,b=`${p}-b`,u=`${p}-u`,outro=`${p}-outro`,vm=`${p}-vm`,tel="5511987650101"
const req=(path:string,body?:unknown)=>new NextRequest(`http://localhost${path}`,body?{method:"POST",body:JSON.stringify(body)}:undefined)
const criar=()=>db.$transaction(tx=>criarSaida(tx,{organizacaoId:a,chave:randomUUID(),origem:"manual",referencia:u,telefone:tel,texto:"CORPO-SENSIVEL",expiraEm:new Date(Date.now()+86400_000)}))
beforeAll(async()=>{
  vi.stubEnv("EMAIL_ENCRYPTION_KEY","sintetico-saude");vi.stubEnv("WHATSAPP_EVOLUTION_CONTRATO","2.3.7")
  await db.organizacao.createMany({data:[a,b].map(id=>({id,nome:id,slug:id}))})
  await db.usuario.createMany({data:[{id:u,nome:u,telefone:tel},{id:outro,nome:outro}].map(x=>({...x,tipo:"admin",senhaHash:"nao-usar"}))})
  await db.usuarioOrganizacao.createMany({data:[u,outro].map(usuarioId=>({organizacaoId:a,usuarioId,papel:"admin",areas:[]}))})
  await db.videomaker.create({data:{id:vm,nome:"Externo sintético"}})
  await db.videomakerOrganizacao.create({data:{organizacaoId:a,videomakerId:vm,status:"ativo"}})
  await db.configWhatsapp.create({data:{organizacaoId:a,instanceId:p,instanceUrl:"https://example.invalid",apiKey:"SEGREDO-PRIVADO",ativo:true,lastStatus:"open",telefoneConectado:tel,connectionEventoEm:new Date()}})
})
beforeEach(async()=>{
  falha.banco=false;sessao.user={id:u,organizacaoId:a,tipo:"admin"}
  vi.mocked(fetch).mockReset();vi.mocked(fetch).mockImplementation(async()=>Response.json({key:{id:randomUUID()}}))
  await db.jobAutomacao.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.saidaWhatsapp.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.reciboWhatsapp.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.inboxWhatsapp.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.alertaIA.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.demanda.deleteMany({where:{organizacaoId:a}})
  await db.eventoAuditoria.deleteMany({where:{organizacaoId:a}})
  await db.agenteExecucao.deleteMany({where:{organizacaoId:a}})
  await db.permissaoUsuario.deleteMany({where:{organizacaoId:a}})
})
afterAll(async()=>{
  await db.organizacao.deleteMany({where:{id:{in:[a,b]}}});await db.videomaker.delete({where:{id:vm}});await db.usuario.deleteMany({where:{id:{in:[u,outro]}}})
  await Promise.all([db.$disconnect(),prismaAuth.$disconnect()]);vi.unstubAllEnvs()
})
describe("O05 saúde e ações",()=>{
  it("conexão sem tráfego não vira prova de entrega, leitura local não consulta provedor",async()=>{
    const r=await saude(),body=await r.json()
    expect(r.status).toBe(200);expect(r.headers.get("Cache-Control")).toContain("no-store")
    expect(body.whatsapp).toMatchObject({conexao:"conectada",ultimaEntrada:null,ultimaAceita:null,ultimaEntrega:null})
    expect(body.consumidores.every((c:{estado:string})=>c.estado==="sem_registro")).toBe(true)
    expect(JSON.stringify(body)).not.toContain("SEGREDO-PRIVADO");expect(JSON.stringify(body)).not.toContain(tel)
    await status();expect(fetch).not.toHaveBeenCalled()
  })
  it("aceitação sem recibo não é entrega; recibo órfão ou de outra empresa não conta",async()=>{
    const s=await criar();await processarSaidas(a)
    const row=await db.saidaWhatsapp.findUniqueOrThrow({where:{id:s.id}})
    await db.reciboWhatsapp.createMany({data:[{organizacaoId:a,providerMessageId:"ORFAO"},{organizacaoId:b,providerMessageId:row.providerMessageId!}].map(x=>({...x,instanceId:p,telefoneHash:hashTelefone(tel),chave:randomUUID(),estado:"entregue",ocorridoEm:new Date()}))})
    expect((await (await saude()).json()).whatsapp).toMatchObject({ultimaEntrega:null})
    expect((await (await saude()).json()).whatsapp.ultimaAceita).not.toBeNull()
    await db.reciboWhatsapp.create({data:{organizacaoId:a,instanceId:p,providerMessageId:row.providerMessageId!,telefoneHash:hashTelefone(tel),chave:randomUUID(),estado:"entregue",ocorridoEm:new Date()}})
    expect((await (await saude()).json()).whatsapp.ultimaEntrega).not.toBeNull()
    await db.tentativaWhatsapp.updateMany({where:{saidaId:s.id},data:{resultado:"desconhecido"}})
    expect((await (await saude()).json()).whatsapp.ultimaAceita).not.toBeNull()
  })
  it("pausa concorrente audita uma vez, impede rede e retoma sem duplicar",async()=>{
    const s=await criar()
    await Promise.all([controlarSaida(a,s.id,u,"pausar"),controlarSaida(a,s.id,u,"pausar")])
    await processarSaidas(a);expect(fetch).not.toHaveBeenCalled()
    expect(await db.eventoAuditoria.count({where:{organizacaoId:a,acao:"whatsapp.pausar"}})).toBe(1)
    await Promise.all([controlarSaida(a,s.id,u,"retomar"),controlarSaida(a,s.id,u,"retomar")])
    await processarSaidas(a);await processarSaidas(a);expect(fetch).toHaveBeenCalledTimes(1)
    expect(await db.eventoAuditoria.count({where:{organizacaoId:a,acao:"whatsapp.retomar"}})).toBe(1)
  })
  it("cancelamento individual preserva trilha e bloqueia ações após início ou validade",async()=>{
    const s=await criar()
    await controlarSaida(a,s.id,u,"cancelar");await processarSaidas(a)
    expect(fetch).not.toHaveBeenCalled()
    const t=await criar();await db.saidaWhatsapp.update({where:{id:t.id},data:{estado:"desconhecido"}})
    for(const acao of ["pausar","retomar","cancelar"] as const) await expect(controlarSaida(a,t.id,u,acao)).rejects.toThrow()
    const v=await criar();await db.saidaWhatsapp.update({where:{id:v.id},data:{expiraEm:new Date(0)}})
    await expect(controlarSaida(a,v.id,u,"pausar")).rejects.toThrow()
  })
  it("falha de saúde retorna 503, não contador zero",async()=>{
    falha.banco=true
    expect((await saude()).status).toBe(503)
    expect((await status()).status).toBe(503)
  })
  it("heartbeat parcial/erro conserva resultado e início; atraso usa cadência configurada",async()=>{
    await acompanharConsumidor(a,"whatsapp-inbox",async()=>({dados:true,contadores:{concluidos:2,falhos:1,pendentes:0}}))
    expect((await saudeConsumidores(a))[0]).toMatchObject({estado:"parcial",contadores:{concluidos:2,falhos:1}})
    await expect(acompanharConsumidor(a,"agentes:alertas",async()=>{throw new Error("SEGREDO") })).rejects.toThrow("falha_local")
    const e=await db.agenteExecucao.findFirstOrThrow({where:{organizacaoId:a,agente:"heartbeat:agentes:alertas"}})
    expect(e.erro).toBe("falha_local")
    vi.stubEnv("AUTOMACOES_CADENCIAS_MINUTOS",'{"whatsapp-inbox":5}')
    await db.agenteExecucao.updateMany({where:{organizacaoId:a,agente:"heartbeat:whatsapp-inbox"},data:{createdAt:new Date(Date.now()-11*60000)}})
    expect((await saudeConsumidores(a))[0].estado).toBe("atrasado")
  })
  it("detalhe de saída só expõe metadados e ações; IDs de outra empresa são negados",async()=>{
    const s=await criar()
    const l=await (await listar(req("/api/mensagens-falhadas"))).json()
    expect(l.mensagens[0]).toMatchObject({origem:"manual",podePausar:true,podeCancelar:true})
    expect(JSON.stringify(l)).not.toContain("CORPO-SENSIVEL")
    await expect(controlarSaida(b,s.id,u,"cancelar")).rejects.toThrow()
    await db.permissaoUsuario.create({data:{organizacaoId:a,usuarioId:u,verAlertas:true,gerenciarConfig:false}})
    expect((await agir(req("/api/mensagens-falhadas",{id:s.id,acao:"cancelar"}))).status).toBe(403)
    expect((await saude()).status).toBe(403)
    sessao.user=null;expect((await saude()).status).toBe(401)
  })
  it("filtra alertas por tipo, responsável e idade; pagina sem misturar empresas",async()=>{
    await db.alertaIA.createMany({data:Array.from({length:55},()=>({organizacaoId:a,usuarioId:u,tipoAlerta:"regra_prazo",mensagem:"Alerta",createdAt:new Date(Date.now()-8*86400_000)}))})
    await db.alertaIA.createMany({data:[{organizacaoId:b,usuarioId:u},{organizacaoId:a,usuarioId:outro}].map(x=>({...x,tipoAlerta:"outro",mensagem:"OUTRO"}))})
    const url=`/api/alertas?tipo=regra_prazo&responsavel=${u}&idade=7`
    const l=await (await alertas(req(url))).json()
    expect(l.total).toBe(55);expect(l.alertas).toHaveLength(50)
    const proxima=await (await alertas(req(`${url}&cursor=${l.nextCursor}`))).json()
    expect(proxima.alertas).toHaveLength(5)
    expect((await alterar(req("/api/alertas",{id:l.alertas[0].id,acao:"resolver"}))).status).toBe(200)
    expect(await db.eventoAuditoria.count({where:{organizacaoId:a,acao:"alerta.resolver"}})).toBe(1)
    expect((await silenciar(req("/api/alertas",{id:l.alertas[1].id,acao:"snooze",minutos:-1}))).status).toBe(400)
  })
  it("cron com envio bloqueado retorna parcial e grava falha no heartbeat",async()=>{
    await criar()
    vi.stubEnv("CRON_SECRET","sintetico-cron-saude")
    vi.stubEnv("WHATSAPP_EVOLUTION_CONTRATO","")
    try {
      const r=await cronInbox(new NextRequest("http://localhost/api/cron/whatsapp-inbox",{headers:{authorization:"Bearer sintetico-cron-saude"}}))
      expect((await r.json()).parcial).toBe(true)
      expect((await saudeConsumidores(a))[0].estado).toBe("parcial")
      expect(fetch).not.toHaveBeenCalled()
    } finally {vi.stubEnv("WHATSAPP_EVOLUTION_CONTRATO","2.3.7")}
  })
  it("filtra responsável externo sem presumir que seja um usuário interno",async()=>{
    const d=await db.demanda.create({data:{organizacaoId:a,codigo:p,titulo:"Teste",descricao:"Teste",departamento:"teste",cidade:"Teste",tipoVideo:"reels",solicitanteId:u,videomakerId:vm}})
    await db.alertaIA.create({data:{organizacaoId:a,demandaId:d.id,tipoAlerta:"regra_prazo",mensagem:"Teste"}})
    const r=await (await alertas(req(`/api/alertas?responsavel=vm:${vm}`))).json()
    expect(r.alertas).toHaveLength(1)
    expect(r.responsaveis).toContainEqual({id:`vm:${vm}`,nome:"Videomaker: Externo sintético"})
    expect((await (await alertas(req(`/api/alertas?responsavel=ed:${vm}`))).json()).alertas).toHaveLength(0)
  })
  it("verAlertas não concede mutação nem alertas de terceiros",async()=>{
    const al=await db.alertaIA.create({data:{organizacaoId:a,usuarioId:outro,tipoAlerta:"privado",mensagem:"PRIVADO"}})
    await db.permissaoUsuario.create({data:{organizacaoId:a,usuarioId:u,verAlertas:true,verTodasDemandas:false,gerenciarConfig:false}})
    expect((await (await alertas(req("/api/alertas"))).json()).alertas).toHaveLength(0)
    expect((await alterar(req("/api/alertas",{id:al.id,acao:"resolver"}))).status).toBe(403)
  })
})
