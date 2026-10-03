import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"
const m=vi.hoisted(()=>({acesso:vi.fn(),simular:vi.fn(),aplicar:vi.fn()}))
vi.mock("@/lib/acesso",()=>({requireAcesso:m.acesso}))
vi.mock("@/lib/acervo-recuperacao",()=>({simularAcervo:m.simular,aplicarAcervo:m.aplicar,ErroAcervo:class extends Error{}}))
import { POST } from "@/app/api/biblioteca/acervo/route"
const req=(body:unknown)=>POST(new NextRequest("https://flow.test/api/biblioteca/acervo",{method:"POST",body:JSON.stringify(body)}))
beforeEach(()=>{vi.resetAllMocks();m.acesso.mockResolvedValue({organizacaoId:"empresa-a",usuarioId:"operador",papel:"admin",permissoes:{gerenciarConfig:true,editarDemanda:true,verTodasDemandas:true}})})
it("anônimo não simula",async()=>{m.acesso.mockResolvedValue(NextResponse.json({error:"Não autorizado"},{status:401}));expect((await req({acao:"simular"})).status).toBe(401);expect(m.simular).not.toHaveBeenCalled()})
it("acesso restrito a próprias demandas não executa manutenção global",async()=>{m.acesso.mockResolvedValue({papel:"admin",permissoes:{editarDemanda:true,verTodasDemandas:false}});expect((await req({acao:"simular"})).status).toBe(403);expect(m.simular).not.toHaveBeenCalled()})
it("valida ação e lote antes de escrever",async()=>{expect((await req({acao:"aplicar"})).status).toBe(400);expect(m.aplicar).not.toHaveBeenCalled()})
it("empresa e operador vêm do guard, não do JSON",async()=>{m.simular.mockResolvedValue({loteId:"lote"});const r=await req({acao:"simular",organizacaoId:"invasor",usuarioId:"invasor"});expect(r.status).toBe(200);expect(m.simular).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({organizacaoId:"empresa-a",usuarioId:"operador"}),undefined);expect(r.headers.get("Cache-Control")).toContain("no-store")})
