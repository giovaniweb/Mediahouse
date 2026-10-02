import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { estado } = vi.hoisted(() => ({ estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string } }, cookie: undefined as string | undefined } }))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => estado.cookie ? { value: estado.cookie } : undefined }) }))
// Importar handlers não deve abrir clientes externos reais.
vi.mock("@/lib/claude", () => ({ claude: {}, analisarComClaude: vi.fn(), extrairJSON: vi.fn(), executarAgenteComTools: vi.fn(), MODELO_POTENTE: "teste", MODELO_RAPIDO: "teste", SYSTEM_VIDEOOPS: "", TOOLS_VIDEOOPS: [] }))
vi.mock("@/lib/trello", () => ({ getBoardLists: vi.fn(), syncDemandaTrello: vi.fn() }))
import { getBoardLists } from "@/lib/trello"
import { GET as trelloGET, POST as trelloPOST } from "@/app/api/configuracoes/trello/route"
import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { GET as custosGET, POST as custosPOST } from "@/app/api/custos-videomaker/route"
import { GET as relatoriosGET } from "@/app/api/relatorios/route"
import { GET, POST } from "@/app/api/config/empresa/route"

const prefix = `integ-${randomUUID()}`
const orgA = `${prefix}-a`, orgB = `${prefix}-b`, usuario = `${prefix}-u`, alvo = `${prefix}-alvo`
const post = (data: unknown) => POST(new NextRequest("http://localhost/api/config/empresa", { method: "POST", body: JSON.stringify(data) }))

beforeAll(async () => {
  await db.organizacao.createMany({ data: [orgA, orgB].map(id => ({ id, nome: id, slug: id })) })
  await db.usuario.create({ data: { id: usuario, nome: "Pessoa sintética", tipo: "admin", senhaHash: "sem-login-real" } })
  await db.usuarioOrganizacao.createMany({ data: [
    { usuarioId: usuario, organizacaoId: orgA, papel: "admin", areas: [] },
    { usuarioId: usuario, organizacaoId: orgB, papel: "solicitante", areas: [] },
  ] })
  await db.usuario.create({ data: { id: alvo, nome: "Pessoa multiempresa", senhaHash: "senha-inalterada", tipo: "solicitante" } })
  await db.usuarioOrganizacao.createMany({ data: [orgA, orgB].map(organizacaoId => ({ usuarioId: alvo, organizacaoId, papel: "solicitante", areas: [] })) })
  await db.configEmpresa.createMany({ data: [
    { organizacaoId: orgA, cnpj: "cnpj-sintetico-a", googleRefreshToken: "segredo-sintetico-a" },
    { organizacaoId: orgB, cnpj: "cnpj-sintetico-b", googleRefreshToken: "segredo-sintetico-b" },
  ] })
})
afterAll(async () => {
  await db.organizacao.deleteMany({ where: { id: { in: [orgA, orgB] } } })
  await db.videomaker.deleteMany({ where: { id: prefix } })
  await db.usuario.deleteMany({ where: { id: { in: [usuario, alvo] } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})
beforeEach(() => { estado.sessao = { user: { id: usuario, organizacaoId: orgA, tipo: "admin" } }; estado.cookie = undefined })

describe("handler real com banco descartável", () => {
  it("nega requisição anônima", async () => { estado.sessao = null; expect((await GET()).status).toBe(401) })
  it("retorna somente a configuração da empresa ativa sem segredos", async () => {
    const res = await GET(); expect(res.status).toBe(200)
    const body = await res.json(); expect(body.empresa.cnpj).toBe("cnpj-sintetico-a")
    expect(JSON.stringify(body)).not.toContain("segredo"); expect(body.empresa).not.toHaveProperty("googleRefreshToken")
  })
  it("admin global não vira admin no vínculo solicitante de B", async () => {
    estado.cookie = orgB; expect((await GET()).status).toBe(403)
    expect((await post({ cnpj: "invadido" })).status).toBe(403)
    expect((await db.configEmpresa.findFirst({ where: { organizacaoId: orgB } }))?.cnpj).toBe("cnpj-sintetico-b")
  })
  it("salvar pasta preserva CNPJ e token, sem devolvê-lo", async () => {
    const res = await post({ googleDriveFolderId: "pasta-sintetica-123" }); expect(res.status).toBe(200)
    const body = await res.json(); expect(body.empresa.cnpj).toBe("cnpj-sintetico-a"); expect(body.empresa).not.toHaveProperty("googleRefreshToken")
    expect((await db.configEmpresa.findFirst({ where: { organizacaoId: orgA } }))?.googleRefreshToken).toBe("segredo-sintetico-a")
  })
  it.each([{ googleRefreshToken: "ataque" }, { organizacaoId: orgB }, { cnpj: 123 }])("recusa alteração fora do contrato", async body => {
    expect((await post(body)).status).toBe(400)
  })
  it("nega empresa inativa", async () => {
    await db.organizacao.update({ where: { id: orgA }, data: { ativo: false } })
    try { expect((await post({ cnpj: "invadido" })).status).toBe(403) }
    finally { await db.organizacao.update({ where: { id: orgA }, data: { ativo: true } }) }
  })
  it("nega usuário inativo", async () => {
    await db.usuario.update({ where: { id: usuario }, data: { status: "inativo" } })
    try { expect((await GET()).status).toBe(403) }
    finally { await db.usuario.update({ where: { id: usuario }, data: { status: "ativo" } }) }
  })
  it("consulta custos não permite mutação e respeita permissão explícita", async () => {
    estado.cookie = orgB
    expect((await custosGET(new NextRequest("http://localhost/api/custos-videomaker"))).status).toBe(403)
    expect((await relatoriosGET(new NextRequest("http://localhost/api/relatorios"))).status).toBe(403)
    await db.permissaoUsuario.create({ data: { usuarioId: usuario, organizacaoId: orgB, verCustos: true } })
    try {
      expect((await custosGET(new NextRequest("http://localhost/api/custos-videomaker"))).status).toBe(200)
      expect((await custosPOST(new NextRequest("http://localhost/api/custos-videomaker", { method: "POST", body: "{}" }))).status).toBe(403)
    } finally {
      await db.permissaoUsuario.delete({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgB } } })
    }
  })
  it("gestor de empresa não toma controle de identidade multiempresa", async () => {
    const { POST: senhaPOST } = await import("@/app/api/usuarios/[id]/senha/route")
    const { PATCH: usuarioPATCH } = await import("@/app/api/usuarios/[id]/route")
    const params = { params: Promise.resolve({ id: alvo }) }
    expect((await senhaPOST(new NextRequest("http://localhost/api/teste", { method: "POST" }), params)).status).toBe(403)
    expect((await usuarioPATCH(new NextRequest("http://localhost/api/teste", { method: "PATCH", body: JSON.stringify({ novaSenha: "invadida123" }) }), params)).status).toBe(403)
    expect((await db.usuario.findUnique({ where: { id: alvo } }))?.senhaHash).toBe("senha-inalterada")
    expect((await usuarioPATCH(new NextRequest("http://localhost/api/teste", { method: "PATCH", body: JSON.stringify({ tipo: "gestor" }) }), params)).status).toBe(200)
    expect((await db.usuario.findUnique({ where: { id: alvo } }))?.tipo).toBe("solicitante")
    expect((await db.usuarioOrganizacao.findUnique({ where: { usuarioId_organizacaoId: { usuarioId: alvo, organizacaoId: orgB } } }))?.papel).toBe("solicitante")
  })
  it("faturamento exige obrigação própria e nunca retorna integração", async () => {
    const { GET: faturamentoGET } = await import("@/app/api/me/empresa-faturamento/route")
    expect((await faturamentoGET()).status).toBe(404)
    await db.videomaker.create({ data: { id: prefix, nome: "Profissional sintético", usuarioId: usuario, redesSociais: [], areasAtuacao: [], habilidades: [], equipamentos: [] } })
    await db.custoVideomaker.create({ data: { organizacaoId: orgA, videomakerId: prefix, valor: 100, dataReferencia: new Date() } })
    const res = await faturamentoGET(); expect(res.status).toBe(200)
    const body = await res.json(); expect(body.empresa.cnpj).toBe("cnpj-sintetico-a")
    expect(body.empresa).not.toHaveProperty("googleDriveFolderId"); expect(JSON.stringify(body)).not.toContain("segredo")
    estado.cookie = orgB; expect((await faturamentoGET()).status).toBe(404)
  })
  it("não permite autoelevação por edição de papel ou permissões", async () => {
    const { PUT: permissaoPUT } = await import("@/app/api/permissoes/route")
    const { PATCH: usuarioPATCH } = await import("@/app/api/usuarios/[id]/route")
    expect((await permissaoPUT(new NextRequest("http://localhost/api/permissoes", { method: "PUT", body: JSON.stringify({ usuarioId: usuario, verCustos: true }) }))).status).toBe(403)
    expect((await usuarioPATCH(new NextRequest("http://localhost/api/usuarios", { method: "PATCH", body: JSON.stringify({ papel: "admin" }) }), { params: Promise.resolve({ id: usuario }) })).status).toBe(403)
  })
  it("consultar permissões próprias não cria exceção persistente", async () => {
    const { GET: permissoesGET } = await import("@/app/api/permissoes/route")
    const res = await permissoesGET(new NextRequest("http://localhost/api/permissoes"))
    expect(res.status).toBe(200)
    expect((await res.json()).gerenciarConfig).toBe(true)
    expect(await db.permissaoUsuario.count({ where: { usuarioId: usuario, organizacaoId: orgA } })).toBe(0)
  })
  it("respostas WhatsApp não incluem chave nem segredo de webhook", async () => {
    const { GET: whatsappGET, POST: whatsappPOST } = await import("@/app/api/configuracoes/whatsapp/route")
    await db.configWhatsapp.create({ data: { organizacaoId: orgA, instanceUrl: "https://example.invalid", instanceId: prefix, apiKey: "chave-sintetica", webhookSecret: "segredo-cifrado-sintetico" } })
    for (const res of [await whatsappGET(), await whatsappPOST(new NextRequest("http://localhost/api/configuracoes/whatsapp", { method: "POST", body: JSON.stringify({ instanceUrl: "https://example.invalid", instanceId: prefix, apiKey: "••••••" }) }))]) {
      expect(res.status).toBe(200)
      const texto = JSON.stringify(await res.json())
      expect(texto).not.toContain("chave-sintetica"); expect(texto).not.toContain("webhookSecret")
      expect(texto).not.toContain("segredo-cifrado-sintetico")
    }
  })
  it("todos os handlers críticos negam falta de capacidade antes de efeitos", async () => {
    estado.cookie = orgB
    await db.permissaoUsuario.create({ data: { usuarioId: usuario, organizacaoId: orgB } })
    try {
      const rotas = [
        [await import("@/app/api/configuracoes/whatsapp/route"), ["GET", "POST"]],
        [await import("@/app/api/configuracoes/whatsapp/qr/route"), ["GET"]],
        [await import("@/app/api/configuracoes/whatsapp/teste/route"), ["POST"]],
        [await import("@/app/api/configuracoes/whatsapp/desconectar/route"), ["POST"]],
        [await import("@/app/api/configuracoes/whatsapp/webhook/route"), ["POST"]],
        [await import("@/app/api/configuracoes/email/route"), ["GET", "POST"]],
        [await import("@/app/api/configuracoes/parametros/route"), ["POST"]],
        [await import("@/app/api/configuracoes/parametros/[id]/route"), ["PATCH", "DELETE"]],
        [await import("@/app/api/configuracoes/trello/route"), ["GET", "POST"]],
        [await import("@/app/api/configuracoes/trello/import/route"), ["GET", "POST"]],
        [await import("@/app/api/configuracoes/trello/import-json/route"), ["POST"]],
        [await import("@/app/api/configuracoes/trello/lists/route"), ["GET"]],
        [await import("@/app/api/configuracoes/trello/sync/route"), ["POST"]],
        [await import("@/app/api/usuarios/route"), ["GET", "POST"]],
        [await import("@/app/api/usuarios/[id]/route"), ["PATCH", "DELETE"]],
        [await import("@/app/api/usuarios/[id]/senha/route"), ["POST"]],
        [await import("@/app/api/usuarios/[id]/promover/route"), ["POST"]],
        [await import("@/app/api/usuarios/[id]/mesclar/route"), ["POST"]],
        [await import("@/app/api/usuarios/[id]/vinculos/route"), ["GET"]],
        [await import("@/app/api/permissoes/route"), ["PUT", "POST"]],
        [await import("@/app/api/ia/chat/route"), ["POST"]],
        [await import("@/app/api/ia/analisar-demanda/route"), ["POST"]],
        [await import("@/app/api/ia/agentes/triagem/route"), ["POST"]],
        [await import("@/app/api/ia/agentes/monitor/route"), ["POST"]],
        [await import("@/app/api/ia/agentes/prazos/route"), ["POST"]],
        [await import("@/app/api/ia/agentes/vistoria/route"), ["POST"]],
        [await import("@/app/api/ia/agentes/gerar-alertas/route"), ["POST"]],
        [await import("@/app/api/relatorios/gerar/route"), ["POST"]],
        [await import("@/app/api/relatorios/metricas/route"), ["GET"]],
        [await import("@/app/api/relatorios/finalizadas-sem-video/route"), ["GET"]],
        [await import("@/app/api/producao/route"), ["GET"]],
        [await import("@/app/api/producao-manual/route"), ["GET", "POST", "DELETE"]],
        [await import("@/app/api/custos-videomaker/[id]/route"), ["PATCH", "DELETE"]],
        [await import("@/app/api/custos-videomaker/[id]/aprovar/route"), ["POST"]],
      ] as const
      for (const [modulo, metodos] of rotas) {
        for (const metodo of metodos) {
          const handler = (modulo as Record<string, (...args: never[]) => Promise<Response>>)[metodo]
          const args = [new NextRequest("http://localhost/api/teste", { method: metodo }), { params: Promise.resolve({ id: "inexistente" }) }]
          expect((await handler(...args as never[])).status, `${metodo}: ${Object.keys(modulo).join(",")}`).toBe(403)
        }
      }
      expect(await db.agenteExecucao.count({ where: { organizacaoId: orgB } })).toBe(0)
      expect(await db.relatorioIA.count({ where: { organizacaoId: orgB } })).toBe(0)
    } finally {
      await db.permissaoUsuario.delete({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgB } } })
    }
  })
  it("vínculo revogado impede mutação mesmo com JWT antigo", async () => {
    await db.usuarioOrganizacao.delete({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgA } } })
    expect((await post({ cnpj: "invadido" })).status).toBe(403)
    expect((await db.configEmpresa.findFirst({ where: { organizacaoId: orgA } }))?.cnpj).toBe("cnpj-sintetico-a")
  })
})


describe("Trello por empresa", () => {
  const enviar = (data: unknown) => trelloPOST(new NextRequest("http://localhost/api/configuracoes/trello", { method: "POST", body: JSON.stringify(data) }))
  beforeEach(async () => {
    await db.usuarioOrganizacao.upsert({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgA } }, create: { usuarioId: usuario, organizacaoId: orgA, papel: "admin", areas: [] }, update: { papel: "admin" } })
    vi.mocked(getBoardLists).mockReset().mockResolvedValue([])
    await db.configTrello.deleteMany({ where: { organizacaoId: { in: [orgA, orgB] } } })
  })
  it.each(["admin", "gestor", "operacao", "solicitante", "editor", "videomaker", "social", "gestor_eventos", "designer", "analista_crm", "gestor_trafego", "auxiliar_admin"] as const)("matriz de leitura administrativa e financeira: %s", async papel => {
    await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgA } }, data: { papel } })
    const esperado = papel === "admin" || papel === "gestor" ? 200 : 403
    expect((await GET()).status).toBe(esperado)
    expect((await trelloGET()).status).toBe(esperado)
    // Quem aprova notas (operacao, auxiliar_admin) lê a lista de custos — sem
    // diária e sem dados fiscais. Regra do hotfix de produção (PR #73).
    const aprova = papel === "operacao" || papel === "auxiliar_admin"
    expect((await custosGET(new NextRequest("http://localhost/api/custos-videomaker"))).status).toBe(aprova ? 200 : esperado)
  })
  it("quem só aprova vê a nota sem diária, CPF/CNPJ e PIX, e não altera custo", async () => {
    const vm = `${prefix}-vm`
    await db.videomaker.create({ data: { id: vm, nome: "Videomaker sintético", telefone: `55${Date.now()}`.slice(0, 13) } })
    await db.videomakerOrganizacao.create({ data: { organizacaoId: orgA, videomakerId: vm, valorDiaria: 777 } })
    await db.videomakerDadosFiscais.create({ data: { organizacaoId: orgA, videomakerId: vm, cpfCnpj: "cpf-sintetico" } })
    await db.custoVideomaker.create({ data: { organizacaoId: orgA, videomakerId: vm, valor: 500, dataReferencia: new Date() } })
    try {
      await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgA } }, data: { papel: "operacao" } })
      const res = await custosGET(new NextRequest(`http://localhost/api/custos-videomaker?videomakerId=${vm}`))
      expect(res.status).toBe(200)
      const { custos } = await res.json()
      expect(custos).toHaveLength(1)
      expect(custos[0].videomaker).toMatchObject({ cpfCnpj: null, chavePix: null, valorDiaria: null })
      expect((await custosPOST(new NextRequest("http://localhost/api/custos-videomaker", { method: "POST", body: "{}" }))).status).toBe(403)

      await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgA } }, data: { papel: "admin" } })
      const admin = await (await custosGET(new NextRequest(`http://localhost/api/custos-videomaker?videomakerId=${vm}`))).json()
      expect(admin.custos[0].videomaker).toMatchObject({ cpfCnpj: "cpf-sintetico", valorDiaria: 777 })
    } finally {
      await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgA } }, data: { papel: "admin" } })
      await db.custoVideomaker.deleteMany({ where: { videomakerId: vm } })
      await db.videomakerDadosFiscais.deleteMany({ where: { videomakerId: vm } })
      await db.videomakerOrganizacao.deleteMany({ where: { videomakerId: vm } })
      await db.videomaker.deleteMany({ where: { id: vm } })
    }
  })
  it("última atividade considera apenas demandas da empresa selecionada", async () => {
    const { GET: pessoasGET } = await import("@/app/api/usuarios/route")
    const criar = (organizacaoId: string, sufixo: string) => db.demanda.create({ data: { organizacaoId, solicitanteId: alvo, codigo: `${prefix}-${sufixo}`, titulo: "Teste", descricao: "Teste", departamento: "growth", tipoVideo: "reels", cidade: "Teste" } })
    const a = await criar(orgA, "atividade-a"), b = await criar(orgB, "atividade-b")
    const antiga = new Date("2026-01-01T12:00:00Z"), recente = new Date("2026-09-01T12:00:00Z")
    await db.historicoStatus.createMany({ data: [
      { demandaId: a.id, usuarioId: alvo, statusNovo: "pedido_criado", createdAt: antiga },
      { demandaId: b.id, usuarioId: alvo, statusNovo: "pedido_criado", createdAt: recente },
    ] })
    await db.comentario.create({ data: { demandaId: b.id, usuarioId: alvo, comentario: "Privado B", createdAt: recente } })
    const res = await pessoasGET(new NextRequest("http://localhost/api/usuarios?busca=multiempresa"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.usuarios.find((u: { id: string }) => u.id === alvo).ultimaAtividade).toBe(antiga.toISOString())
    expect(JSON.stringify(body)).not.toContain("senhaHash")
  })
  it("configuração desativada não é apresentada como conectada", async () => {
    await db.configTrello.create({ data: { organizacaoId: orgA, boardId: "boardAAAA", apiKey: "chave", token: "token", ativo: false } })
    expect(await (await trelloGET()).json()).toEqual({ config: { boardId: "", ativo: false, apiKey: "", token: "" } })
    expect(getBoardLists).not.toHaveBeenCalled()
  })
  it("persiste e lê sem devolver credenciais, preservando mapeamento", async () => {
    const res = await enviar({ boardId: "boardAAAA", apiKey: "chave-secreta-a", token: "token-secreto-a" })
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).not.toContain("secre")
    const row = await db.configTrello.findFirstOrThrow({ where: { organizacaoId: orgA } })
    await db.configTrello.update({ where: { id: row.id }, data: { listMapping: { lista: "entrada" } } })
    expect((await enviar({ boardId: "boardAAAA", apiKey: "••••", token: "••••" })).status).toBe(200)
    expect(getBoardLists).toHaveBeenLastCalledWith({ boardId: "boardAAAA", apiKey: "chave-secreta-a", token: "token-secreto-a" })
    const atualizado = await db.configTrello.findUniqueOrThrow({ where: { id: row.id } })
    expect(atualizado.listMapping).toEqual({ lista: "entrada" })
    expect(await (await trelloGET()).json()).toEqual({ config: { boardId: "boardAAAA", ativo: true, apiKey: "••••", token: "••••" } })
    expect((await enviar({ boardId: "boardNOVO" })).status).toBe(200)
    expect((await db.configTrello.findUniqueOrThrow({ where: { id: row.id } })).listMapping).toBeNull()
  })
  it("admin de B não lê nem reutiliza segredo de A", async () => {
    await db.configTrello.create({ data: { organizacaoId: orgA, boardId: "boardAAAA", apiKey: "segredo-a", token: "segredo-a" } })
    await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgB } }, data: { papel: "admin" } })
    estado.cookie = orgB
    try {
      expect(await (await trelloGET()).json()).toEqual({ config: { boardId: "", ativo: false, apiKey: "", token: "" } })
      expect((await enviar({ boardId: "boardBBBB", apiKey: "••••", token: "••••" })).status).toBe(400)
      expect(getBoardLists).not.toHaveBeenCalled()
      expect((await enviar({ boardId: "boardBBBB", apiKey: "chave-b", token: "token-b" })).status).toBe(200)
      expect((await db.configTrello.findFirstOrThrow({ where: { organizacaoId: orgA } })).boardId).toBe("boardAAAA")
    } finally {
      await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgB } }, data: { papel: "solicitante" } })
    }
  })
  it("recusa payload forjado e falha do provedor sem expor mensagem", async () => {
    expect((await enviar({ boardId: "boardAAAA", organizacaoId: orgB })).status).toBe(400)
    expect((await enviar({ boardId: "../boards" })).status).toBe(400)
    expect(getBoardLists).not.toHaveBeenCalled()
    vi.mocked(getBoardLists).mockRejectedValue(new Error("credencial-na-mensagem-do-provedor"))
    const res = await enviar({ boardId: "boardAAAA", apiKey: "chave", token: "token" })
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).not.toContain("credencial-na-mensagem")
    expect(await db.configTrello.count({ where: { organizacaoId: orgA } })).toBe(0)
  })
  it("revogação durante teste impede persistência", async () => {
    vi.mocked(getBoardLists).mockImplementationOnce(async () => {
      await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgA } }, data: { papel: "solicitante" } })
      return []
    })
    try {
      expect((await enviar({ boardId: "boardAAAA", apiKey: "chave", token: "token" })).status).toBe(403)
      expect(await db.configTrello.count({ where: { organizacaoId: orgA } })).toBe(0)
    } finally {
      await db.usuarioOrganizacao.update({ where: { usuarioId_organizacaoId: { usuarioId: usuario, organizacaoId: orgA } }, data: { papel: "admin" } })
    }
  })
})
