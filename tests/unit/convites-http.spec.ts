import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"
const m=vi.hoisted(()=>({acesso:vi.fn(),emitir:vi.fn(),responder:vi.fn(),credencial:vi.fn(),findFirst:vi.fn(),findMany:vi.fn(),findUnique:vi.fn(),tx:vi.fn()}))
vi.mock("@/lib/acesso",()=>({requireAcesso:m.acesso}))
vi.mock("@/lib/prisma",()=>({prisma:{$transaction:m.tx,demanda:{findFirst:m.findFirst},conviteVideomaker:{findMany:m.findMany,findUnique:m.findUnique}}}))
vi.mock("@/lib/convites",()=>({emitirConvite:m.emitir,responderConvite:m.responder,ConviteInvalido:class extends Error{}}))
vi.mock("@/lib/org-por-credencial",()=>({orgPorCredencial:m.credencial}))
import { GET, POST } from "@/app/api/convites/route"
import { POST as responder, GET as consultar } from "@/app/api/convites/[token]/route"
const req=(body:unknown)=>new NextRequest("http://localhost/api/convites",{method:"POST",body:JSON.stringify(body)})
const params={params:Promise.resolve({token:"token-sintetico"})}
beforeEach(()=>{vi.resetAllMocks();m.acesso.mockResolvedValue({organizacaoId:"empresa-a",usuarioId:"gestor",papel:"gestor"});m.tx.mockImplementation(fn=>fn({}));m.credencial.mockResolvedValue("empresa-a")})
it("nega consulta e emissão sem capacidade, antes de ler dados",async()=>{
  m.acesso.mockResolvedValue(NextResponse.json({error:"Sem permissão"},{status:403}))
  expect((await POST(req({demandaId:"d",videomakerId:"v"}))).status).toBe(403)
  expect((await GET(new NextRequest("http://localhost/api/convites?demandaId=d"))).status).toBe(403)
  expect(m.acesso).toHaveBeenCalledWith("editarDemanda");expect(m.tx).not.toHaveBeenCalled();expect(m.findMany).not.toHaveBeenCalled()
})
it("empresa vem do vínculo e corpo não pode sobrepor escopo",async()=>{
  expect((await POST(req({demandaId:"d",videomakerId:"v",organizacaoId:"empresa-b"}))).status).toBe(400)
  expect(m.emitir).not.toHaveBeenCalled()
})
it("emissão não devolve tarifa para gestor sem verCustos nem confirma entrega externa",async()=>{
  m.emitir.mockResolvedValue({id:"i",token:"t",status:"pendente",expiresAt:new Date(),tarifaDiaria:"900.00",condicoes:"reservado"})
  const r=await POST(req({demandaId:"d",videomakerId:"v"}))
  expect(r.status).toBe(201);expect(await r.json()).not.toHaveProperty("tarifaDiaria");expect(r.headers.get("cache-control")).toContain("no-store")
})
it("listagem de job fora da empresa não retorna convites",async()=>{
  m.findFirst.mockResolvedValue(null)
  expect((await GET(new NextRequest("http://localhost/api/convites?demandaId=outra"))).status).toBe(404)
  expect(m.findMany).not.toHaveBeenCalled()
})
it("token inválido não executa resposta",async()=>{
  m.credencial.mockResolvedValue(null)
  expect((await responder(req({acao:"aceitar"}),params)).status).toBe(404);expect(m.tx).not.toHaveBeenCalled()
})
it("GET expirado não escreve nem muda estado",async()=>{
  m.findUnique.mockResolvedValue({status:"pendente",expiresAt:new Date(0)})
  expect((await consultar(req({}),params)).status).toBe(410);expect(m.tx).not.toHaveBeenCalled()
})
it("resposta carrega versão e organização resolvida pelo token",async()=>{
  m.responder.mockResolvedValue({status:"aceito",demandaId:"d"})
  const r=await responder(req({acao:"aceitar",versao:1}),params)
  expect(r.status).toBe(200);expect(m.responder).toHaveBeenCalledWith({},expect.objectContaining({organizacaoId:"empresa-a",token:"token-sintetico",versao:1,acao:"aceitar"}))
})

it("capacidade de edição sozinha não autoriza emissão por profissional",async()=>{
  m.acesso.mockResolvedValue({organizacaoId:"empresa-a",usuarioId:"externo",papel:"videomaker"})
  expect((await POST(req({demandaId:"d",videomakerId:"v"}))).status).toBe(403)
  expect(m.emitir).not.toHaveBeenCalled()
})
