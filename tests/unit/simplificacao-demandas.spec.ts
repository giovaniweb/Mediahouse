import { beforeEach, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"
const m=vi.hoisted(()=>({acesso:vi.fn()}))
vi.mock("@/lib/acesso",()=>({requireAcesso:m.acesso}))
import { normalizarVisao } from "@/components/demandas/tipos-visao"
import { POST } from "@/app/api/demandas/importar/route"
beforeEach(()=>{vi.resetAllMocks();m.acesso.mockResolvedValue({organizacaoId:"teste"})})
it.each([null,undefined,"tabela","invalida","kanban"])("preferência %s abre Kanban",v=>expect(normalizarVisao(v)).toBe("kanban"))
it("preserva preferência por Lista",()=>expect(normalizarVisao("lista")).toBe("lista"))
it("cliente antigo recebe 410 sem processamento de arquivo",async()=>{const r=await POST();expect(r.status).toBe(410);expect(await r.json()).toMatchObject({codigo:"importacao_desativada"})})
it("não permite sessão ausente",async()=>{m.acesso.mockResolvedValue(NextResponse.json({error:"Não autorizado"},{status:401}));expect((await POST()).status).toBe(401)})
