import {randomUUID} from "node:crypto"
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from "vitest"
import {NextRequest} from "next/server"
const {sessao}=vi.hoisted(()=>({sessao:{user:null as null|{id:string;organizacaoId:string;tipo:string}}}))
vi.mock("@/lib/auth",()=>({auth:async()=>sessao.user ? {user:sessao.user} : null}))
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>undefined})}))
import {prismaBase as db} from "@/lib/prisma"
import {prismaAuth} from "@/lib/prisma-auth"
import {criarSaida,processarSaidas,tentarNovamente} from "@/lib/whatsapp-outbox"
import {receberEntrada,processarInbox} from "@/lib/whatsapp-inbox"
import {encryptSecret} from "@/lib/secret-crypto"
import {GET as listar,POST as reenvio} from "@/app/api/mensagens-falhadas/route"
import {POST as enviarManual} from "@/app/api/whatsapp/enviar/route"
const p=`saida-${randomUUID()}`,a=`${p}-a`,b=`${p}-b`,u=`${p}-u`,instance=`${p}-inst`,telefone="5511998887777"
const http=vi.mocked(fetch)
const criar=(chave:string=randomUUID())=>db.$transaction(tx=>criarSaida(tx,{organizacaoId:a,chave,origem:"manual",referencia:u,telefone,
  texto:"CONTEUDO-PRIVADO-SINTETICO",expiraEm:new Date(Date.now()+86400_000)}))
const ler=(id:string)=>db.saidaWhatsapp.findUniqueOrThrow({where:{id}})
const recibo=(id:string,status:string,inst=instance,tel=telefone)=>receberEntrada({instance:inst,event:"messages.update",date_time:"2026-09-28T12:00:00Z",
  data:{keyId:id,remoteJid:`${tel}@s.whatsapp.net`,fromMe:true,status}},"segredo")
beforeAll(async()=>{
  vi.stubEnv("EMAIL_ENCRYPTION_KEY","chave-sintetica-outbox")
  vi.stubEnv("WHATSAPP_EVOLUTION_CONTRATO","2.3.7")
  await db.organizacao.createMany({data:[a,b].map(id=>({id,nome:id,slug:id}))})
  await db.usuario.create({data:{id:u,nome:"Teste",tipo:"admin",telefone,senhaHash:"nao-login"}})
  await db.usuarioOrganizacao.create({data:{usuarioId:u,organizacaoId:a,papel:"admin",areas:[]}})
  await db.configWhatsapp.createMany({data:[a,b].map(org=>({organizacaoId:org,instanceId:org===a ? instance : `${instance}-b`,instanceUrl:"https://example.invalid",apiKey:"api-nao-expor",ativo:true,webhookSecret:encryptSecret("segredo")}))})
})
beforeEach(async()=>{
  http.mockReset();http.mockResolvedValue(Response.json({key:{id:randomUUID()}}))
  sessao.user={id:u,organizacaoId:a,tipo:"admin"}
  await db.jobAutomacao.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.saidaWhatsapp.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.reciboWhatsapp.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.inboxWhatsapp.deleteMany({where:{organizacaoId:{in:[a,b]}}})
  await db.eventoAuditoria.deleteMany({where:{organizacaoId:a}})
  await db.usuario.update({where:{id:u},data:{telefone}})
  await db.configWhatsapp.update({where:{organizacaoId:a},data:{ativo:true}})
  await db.organizacao.update({where:{id:a},data:{ativo:true}})
})
afterAll(async()=>{
  await db.organizacao.deleteMany({where:{id:{in:[a,b]}}});await db.usuario.delete({where:{id:u}})
  await Promise.all([db.$disconnect(),prismaAuth.$disconnect()]);vi.unstubAllEnvs()
})
describe("outbox e recibos WhatsApp",()=>{
  it("intenção e job revertem com produtor e duplicata concorrente não duplica envio",async()=>{
    await expect(db.$transaction(async tx=>{await criarSaida(tx,{organizacaoId:a,chave:"rollback",origem:"manual",referencia:u,telefone,texto:"Teste",expiraEm:new Date(Date.now()+60000)});throw new Error("rollback")})).rejects.toThrow()
    expect(await db.saidaWhatsapp.count({where:{organizacaoId:a}})).toBe(0)
    const [s,t]=await Promise.all([criar("chave"),criar("chave")]);expect(s.id).toBe(t.id)
    await Promise.all([processarSaidas(a),processarSaidas(a)])
    expect(http).toHaveBeenCalledTimes(1)
    expect((await ler(s.id)).estado).toBe("aceito")
    expect(await db.tentativaWhatsapp.count({where:{saidaId:s.id}})).toBe(1)
    await processarSaidas(a);expect(http).toHaveBeenCalledTimes(1)
  })
  it("HTTP 400 é permanente e não alterna telefone nem cria retry automático",async()=>{
    http.mockResolvedValueOnce(Response.json({error:"api-nao-expor"},{status:400}))
    const s=await criar();await processarSaidas(a)
    expect((await ler(s.id)).estado).toBe("falhou")
    expect(http).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(await db.tentativaWhatsapp.findMany({where:{saidaId:s.id}}))).not.toContain("api-nao-expor")
    await processarSaidas(a);expect(http).toHaveBeenCalledTimes(1)
  })
  it("429 respeita Retry-After e cinco tentativas totais; 503 é recuperável",async()=>{
    http.mockImplementation(async()=>Response.json({},{status:429,headers:{"Retry-After":"120"}}))
    const s=await criar()
    await processarSaidas(a)
    expect((await ler(s.id)).proximaTentativa!.getTime()).toBeGreaterThan(Date.now()+115000)
    for(let i=1;i<5;i++){
      await db.jobAutomacao.updateMany({where:{organizacaoId:a,estado:"pendente"},data:{agendadoPara:new Date(0)}})
      await processarSaidas(a)
    }
    expect((await ler(s.id)).estado).toBe("falhou");expect((await ler(s.id)).tentativas).toBe(5)
    expect(http).toHaveBeenCalledTimes(5)
    http.mockResolvedValueOnce(Response.json({},{status:503}))
    const outro=await criar();await processarSaidas(a)
    expect((await ler(outro.id)).estado).toBe("aguardando")
  })
  it("timeout e HTTP 200 sem ID ficam desconhecidos e bloqueiam reenvio manual",async()=>{
    http.mockRejectedValueOnce(new Error("timeout com segredo"))
    const s=await criar();await processarSaidas(a)
    expect((await ler(s.id)).estado).toBe("desconhecido")
    await expect(tentarNovamente(a,s.id,u,"provedor_normalizado")).rejects.toThrow()
    await processarSaidas(a);expect(http).toHaveBeenCalledTimes(1)
    http.mockResolvedValueOnce(Response.json({ok:true}))
    const t=await criar();await processarSaidas(a)
    expect((await ler(t.id)).estado).toBe("desconhecido")
  })
  it("contrato não validado bloqueia rede e recibo tardio resolve resultado com ID conhecido",async()=>{
    vi.stubEnv("WHATSAPP_EVOLUTION_CONTRATO","")
    const bloqueada=await criar()
    try {
      await processarSaidas(a)
      expect((await ler(bloqueada.id)).motivo).toBe("contrato_nao_validado")
      expect(http).not.toHaveBeenCalled()
    } finally {vi.stubEnv("WHATSAPP_EVOLUTION_CONTRATO","2.3.7")}
    http.mockResolvedValueOnce(Response.json({key:{id:"PROV-INCERTO"}},{status:503}))
    const s=await criar();await processarSaidas(a)
    expect((await ler(s.id)).estado).toBe("desconhecido")
    await recibo("PROV-INCERTO","DELIVERY_ACK")
    expect((await ler(s.id)).estado).toBe("entregue")
    await processarSaidas(a);expect(http).toHaveBeenCalledTimes(1)
  })
  it("crash/lease vencido depois de iniciar rede não causa segundo efeito externo",async()=>{
    let iniciar!:()=>void,responder!:(r:Response)=>void
    const iniciou=new Promise<void>(r=>{iniciar=r})
    http.mockImplementationOnce(()=>{iniciar();return new Promise<Response>(r=>{responder=r})})
    const s=await criar(),primeiro=processarSaidas(a)
    await iniciou
    expect((await ler(s.id)).estado).toBe("desconhecido")
    await db.jobAutomacao.updateMany({where:{organizacaoId:a,estado:"executando"},data:{leaseAte:new Date(0)}})
    await processarSaidas(a)
    responder(Response.json({key:{id:"resposta-tardia"}}))
    await primeiro
    expect(http).toHaveBeenCalledTimes(1);expect((await ler(s.id)).estado).toBe("desconhecido")
  })
  it("recibo anterior à resposta, repetido e fora de ordem não regride leitura",async()=>{
    http.mockImplementationOnce(async()=>{await recibo("PROV-1","READ");return Response.json({key:{id:"PROV-1"}})})
    const s=await criar();await processarSaidas(a)
    expect((await ler(s.id)).estado).toBe("lido")
    await recibo("PROV-1","READ");await recibo("PROV-1","SERVER_ACK");await recibo("PROV-1","DELIVERY_ACK")
    expect((await ler(s.id)).estado).toBe("lido")
    expect(await db.reciboWhatsapp.count({where:{organizacaoId:a}})).toBe(3)
  })
  it("recibo de outra empresa/número não altera saída; recibo real confirma entrega",async()=>{
    http.mockResolvedValueOnce(Response.json({key:{id:"PROV-2"}}))
    const s=await criar();await processarSaidas(a)
    await recibo("PROV-2","READ",`${instance}-b`);await recibo("PROV-2","READ",instance,"5511988880000")
    expect((await ler(s.id)).estado).toBe("aceito")
    await recibo("PROV-2","DELIVERY_ACK")
    expect((await ler(s.id)).estado).toBe("entregue")
  })
  it("destinatário alterado e empresa pausada não disparam rede",async()=>{
    const s=await criar()
    await db.usuario.update({where:{id:u},data:{telefone:"5511988880000"}})
    await processarSaidas(a)
    expect((await ler(s.id)).estado).toBe("cancelado")
    await db.usuario.update({where:{id:u},data:{telefone}})
    const t=await criar()
    await db.organizacao.update({where:{id:a},data:{ativo:false}})
    await processarSaidas(a)
    expect((await ler(t.id)).estado).toBe("cancelado");expect(http).not.toHaveBeenCalled()
  })
  it("sem configuração e validade expirada não contam como tentativa/aceitação",async()=>{
    const s=await criar();await db.configWhatsapp.update({where:{organizacaoId:a},data:{ativo:false}})
    await processarSaidas(a)
    expect((await ler(s.id)).motivo).toBe("sem_config");expect((await ler(s.id)).tentativas).toBe(0)
    const t=await criar();await db.saidaWhatsapp.update({where:{id:t.id},data:{expiraEm:new Date(0)}})
    await processarSaidas(a);expect((await ler(t.id)).estado).toBe("expirado");expect(http).not.toHaveBeenCalled()
  })
  it("reenvio exige motivo, não duplica agendamento e registra ator na auditoria",async()=>{
    http.mockResolvedValueOnce(Response.json({},{status:400}))
    const s=await criar();await processarSaidas(a)
    await expect(tentarNovamente(a,s.id,u,"")).rejects.toThrow()
    await Promise.all([tentarNovamente(a,s.id,u,"config_corrigida"),tentarNovamente(a,s.id,u,"config_corrigida")])
    expect(await db.eventoAuditoria.count({where:{organizacaoId:a,acao:"whatsapp.retentativa",atorId:u}})).toBe(1)
    await processarSaidas(a)
    expect((await ler(s.id)).estado).toBe("aceito");expect(http).toHaveBeenCalledTimes(2)
  })
  it("API de leitura separa intenções/tentativas e não retorna corpo, telefone ou chaves",async()=>{
    await criar();await processarSaidas(a)
    const r=await listar(new NextRequest("http://localhost/api/mensagens-falhadas"))
    const body=await r.json()
    expect(body.total).toBe(1);expect(body.tentativas).toBe(1)
    expect(JSON.stringify(body)).not.toContain("CONTEUDO-PRIVADO");expect(JSON.stringify(body)).not.toContain(telefone)
    expect(JSON.stringify(body)).not.toContain("leaseToken")
    sessao.user=null
    expect((await listar(new NextRequest("http://localhost/api/mensagens-falhadas"))).status).toBe(401)
  })
  it("API manual confirma persistência e repetição usa chave; não reenvia legado nem aceita lote",async()=>{
    const chave=randomUUID()
    const req=()=>new NextRequest("http://localhost/api/whatsapp/enviar",{method:"POST",body:JSON.stringify({telefone,mensagem:"Teste",chave})})
    expect((await enviarManual(req())).status).toBe(202)
    expect((await enviarManual(req())).status).toBe(202)
    expect(await db.saidaWhatsapp.count({where:{organizacaoId:a}})).toBe(1)
    expect(http).not.toHaveBeenCalled()
    expect((await reenvio(new NextRequest("http://localhost/api/mensagens-falhadas",{method:"POST",body:JSON.stringify({ids:["legado"]})}))).status).toBe(400)
  })
  it("resposta de inbox nasce junto ao processamento e usa a instância/telefone de origem",async()=>{
    const entrada={instance,event:"messages.upsert",data:{key:{id:"ENTRADA",fromMe:false,remoteJid:`${telefone}@s.whatsapp.net`},message:{conversation:"SIM"}}}
    await receberEntrada(entrada,"segredo");await processarInbox(a)
    expect(await db.saidaWhatsapp.count({where:{organizacaoId:a,origem:"inbox"}})).toBe(1)
    await receberEntrada(entrada,"segredo");await processarInbox(a)
    await processarSaidas(a)
    expect(http).toHaveBeenCalledTimes(1)
    expect((JSON.parse(String(http.mock.calls[0][1]?.body)) as {number:string}).number).toBe(telefone)
  })
})
