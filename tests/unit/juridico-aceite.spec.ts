import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Onda 3: documentos jurídicos e aceite. Quem precisa aceitar o quê, a versão
// que entra na prova, o texto que vira página e a rota do aceite no painel.

const mocks = vi.hoisted(() => ({
  sessao: vi.fn(),
  org: vi.fn(),
  vinculo: vi.fn(),
  aceites: vi.fn(),
  criarAceite: vi.fn(),
  auditoria: vi.fn(),
}))
vi.mock("@/lib/auth", () => ({ auth: () => mocks.sessao() }))
vi.mock("@/lib/org", () => ({ getOrgId: () => mocks.org(), semOrg: () => new Response(null, { status: 403 }) }))
vi.mock("@/lib/org-contexto", () => ({ comOrg: (_o: string, fn: () => unknown) => fn() }))
vi.mock("@/lib/prisma-auth", () => ({ prismaAuth: { usuarioOrganizacao: { findUnique: mocks.vinculo }, organizacao: { findUnique: async () => ({ nome: "Empresa A" }) } } }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aceiteTermos: { findMany: mocks.aceites },
    $transaction: (fn: (tx: unknown) => unknown) => fn({ aceiteTermos: { create: mocks.criarAceite }, eventoAuditoria: { createMany: mocks.auditoria } }),
  },
}))

const { documentosExigidos, documentosPendentes, fraseDoAceite, origemDoAceiteNoPainel } = await import("@/lib/juridico/aceite")
const { DOCUMENTOS, ORDEM_DOCUMENTOS, marcaDeVersao } = await import("@/lib/juridico/documentos")
const { TEXTOS } = await import("@/lib/juridico/textos")
const { blocosDoTexto, secoesDoTexto } = await import("@/components/juridico/TextoJuridico")
const { payloadAuditoria } = await import("@/lib/auditoria")
const { descreverEventoAuditoria } = await import("@/lib/auditoria-leitura")
const { POST } = await import("@/app/api/aceite-termos/route")
const { aceitePendenteDoPainel } = await import("@/lib/juridico/aceite-painel")

describe("quem aceita o quê", () => {
  it("administrador aceita o contrato e o acordo de dados em nome da empresa", () => {
    expect(documentosExigidos({ papel: "admin", categoria: "interna" })).toEqual(["termos", "dpa", "privacidade"])
  })
  it("equipe aceita Termos de Uso e Privacidade", () => {
    for (const papel of ["gestor", "operacao", "solicitante", "editor", "social"]) {
      expect(documentosExigidos({ papel, categoria: "interna" }), papel).toEqual(["termos", "privacidade"])
    }
  })
  it("profissional externo aceita os Termos do Profissional, mesmo com papel de equipe", () => {
    expect(documentosExigidos({ papel: "videomaker", categoria: null })).toEqual(["profissionais", "privacidade"])
    expect(documentosExigidos({ papel: "designer", categoria: "interna" })).toEqual(["profissionais", "privacidade"])
    expect(documentosExigidos({ papel: "solicitante", categoria: "externo" })).toEqual(["profissionais", "privacidade"])
  })
  it("pendente é o que não tem a versão ATUAL em nenhum aceite", () => {
    const exigidos = documentosExigidos({ papel: "gestor", categoria: "interna" })
    expect(documentosPendentes(exigidos, [])).toEqual(["termos", "privacidade"])
    expect(documentosPendentes(exigidos, [{ documentos: [marcaDeVersao("termos"), marcaDeVersao("privacidade")] }])).toEqual([])
    // Aceite de versão antiga não vale para a nova.
    expect(documentosPendentes(exigidos, [{ documentos: ["termos@0.9", marcaDeVersao("privacidade")] }])).toEqual(["termos"])
    expect(origemDoAceiteNoPainel(0)).toBe("primeiro_acesso")
    expect(origemDoAceiteNoPainel(2)).toBe("nova_versao")
  })
  it("a frase da caixa nomeia os documentos com o artigo certo", () => {
    expect(fraseDoAceite(["termos", "privacidade"])).toBe("Li e aceito os Termos de Uso e a Política de Privacidade.")
    expect(fraseDoAceite(["termos", "dpa", "privacidade"])).toBe("Li e aceito os Termos de Uso, o Acordo de Tratamento de Dados e a Política de Privacidade.")
  })
})

describe("os textos", () => {
  const caminhos = new Set(Object.values(DOCUMENTOS).map(d => d.caminho))
  it("todo documento tem resumo, seções numeradas e índice sem âncora repetida", () => {
    for (const slug of ORDEM_DOCUMENTOS) {
      const { resumo, texto } = TEXTOS[slug]
      expect(resumo.length, slug).toBeGreaterThan(0)
      const secoes = secoesDoTexto(texto)
      expect(secoes.length, slug).toBeGreaterThan(5)
      expect(new Set(secoes.map(s => s.id)).size, slug).toBe(secoes.length)
    }
  })
  it("link interno só para documento que existe", () => {
    for (const slug of ORDEM_DOCUMENTOS) {
      for (const [, destino] of TEXTOS[slug].texto.matchAll(/\]\((\/[^)]*)\)/g)) {
        expect(caminhos.has(destino), `${slug} → ${destino}`).toBe(true)
      }
    }
  })
  it("versão publicada não tem campo em aberto", async () => {
    const { MINUTA } = await import("@/lib/juridico/documentos")
    const { DADOS_EM_ABERTO } = await import("@/lib/juridico/empresa")
    if (MINUTA) return
    expect(DADOS_EM_ABERTO).toBe(false)
    for (const slug of ORDEM_DOCUMENTOS) {
      expect(TEXTOS[slug].texto, slug).not.toContain("[PREENCHER")
      expect(TEXTOS[slug].resumo.join(" "), slug).not.toContain("[PREENCHER")
    }
  })

  it("nenhum documento promete Eventos, Cutflow ou biometria", () => {
    for (const slug of ORDEM_DOCUMENTOS) {
      const t = TEXTOS[slug].texto.toLowerCase()
      expect(t, slug).not.toMatch(/cutflow|reconhecimento facial|busca de fotos/)
    }
  })
  it("o markdown vira título, parágrafo e lista", () => {
    const b = blocosDoTexto("## 1. Título\n\nTexto **forte**.\n\n- um\n- dois\n\n1. primeiro\n2. segundo")
    expect(b.map(x => x.tipo)).toEqual(["h2", "p", "ul", "ol"])
    expect(b[0]).toMatchObject({ id: "1-titulo" })
  })
})

describe("auditoria do aceite", () => {
  it("guarda só documento@versão e a origem conhecida", () => {
    expect(payloadAuditoria({ documentos: ["termos@1.0", "<script>", "privacidade@1.0", 3], origem: "primeiro_acesso" }))
      .toEqual({ documentos: ["privacidade@1.0", "termos@1.0"], origem: "primeiro_acesso" })
    expect(payloadAuditoria({ origem: "qualquer" })).toEqual({})
  })
  it("a tela diz o que foi aceito e onde", () => {
    expect(descreverEventoAuditoria({ acao: "termos.aceite", resultado: "sucesso", depois: { documentos: ["termos@1.0", "privacidade@1.0"], origem: "primeiro_acesso" } }))
      .toBe("Termos e Política de Privacidade aceitos · concluída — Termos de Uso 1.0, Política de Privacidade 1.0, no primeiro acesso")
    // Detalhe vencido (90 dias): fica a frase.
    expect(descreverEventoAuditoria({ acao: "termos.aceite", resultado: "sucesso", depois: null })).toBe("Termos e Política de Privacidade aceitos · concluída")
  })
})

describe("POST /api/aceite-termos", () => {
  // O corpo leva o que a tela exibiu: a empresa e as marcas "slug@versao".
  const post = (corpo: Record<string, unknown>) => POST(new NextRequest("http://localhost/api/aceite-termos", {
    method: "POST", body: JSON.stringify({ organizacaoId: "org-A", ...corpo }), headers: { "content-type": "application/json" },
  }))
  const v = (...slugs: string[]) => slugs.map(s => `${s}@1.0`)
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset()
    mocks.sessao.mockResolvedValue({ user: { id: "u1" } })
    mocks.org.mockResolvedValue("org-A")
    mocks.vinculo.mockResolvedValue({ papel: "admin", categoria: "interna" })
    mocks.aceites.mockResolvedValue([])
    mocks.criarAceite.mockResolvedValue({ id: "ac1" })
  })

  it("sem sessão: 401", async () => {
    mocks.sessao.mockResolvedValue(null)
    expect((await post({ aceito: true, documentos: v("termos") })).status).toBe(401)
  })
  it("sem marcar a caixa: 400, nada gravado", async () => {
    expect((await post({ aceito: false, documentos: v("termos", "dpa", "privacidade") })).status).toBe(400)
    expect((await post({ aceito: true, documentos: ["inventado"] })).status).toBe(400)
    expect(mocks.criarAceite).not.toHaveBeenCalled()
  })
  it("tela velha (não mostrou tudo o que falta): 409 pede para recarregar", async () => {
    expect((await post({ aceito: true, documentos: v("termos", "privacidade") })).status).toBe(409)
    expect(mocks.criarAceite).not.toHaveBeenCalled()
  })
  it("grava o que falta, na empresa ativa, com a versão atual e a auditoria do usuário", async () => {
    const r = await post({ aceito: true, documentos: v("termos", "dpa", "privacidade") })
    expect(r.status).toBe(200)
    expect(mocks.aceites.mock.calls[0][0].where).toEqual({ organizacaoId: "org-A", titularTipo: "usuario", titularId: "u1" })
    expect(mocks.criarAceite.mock.calls[0][0].data).toMatchObject({
      organizacaoId: "org-A", titularTipo: "usuario", titularId: "u1", origem: "primeiro_acesso",
      documentos: ["termos@1.0", "dpa@1.0", "privacidade@1.0"],
    })
    expect(mocks.auditoria.mock.calls[0][0].data).toMatchObject({ acao: "termos.aceite", atorTipo: "humano", atorId: "u1", recurso: "usuario" })
  })
  it("já aceito: não grava de novo", async () => {
    mocks.aceites.mockResolvedValue([{ documentos: ["termos@1.0", "dpa@1.0", "privacidade@1.0"] }])
    const r = await post({ aceito: true, documentos: v("termos") })
    expect(await r.json()).toEqual({ ok: true, jaAceito: true })
    expect(mocks.criarAceite).not.toHaveBeenCalled()
  })
  it("empresa ativa trocada em outra aba: 409, nada gravado na empresa nova", async () => {
    const r = await post({ aceito: true, organizacaoId: "org-B", documentos: v("termos", "dpa", "privacidade") })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/empresa ativa mudou/)
    expect(mocks.criarAceite).not.toHaveBeenCalled()
    expect((await post({ aceito: true, organizacaoId: undefined, documentos: v("termos", "dpa", "privacidade") })).status).toBe(409)
  })
  it("versão nova publicada com a tela aberta: 409 pede para recarregar, nada gravado", async () => {
    const r = await post({ aceito: true, documentos: ["termos@0.9", "dpa@1.0", "privacidade@1.0"] })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/Recarregue/)
    // Tela de antes da regra, só com o slug: também desatualizada.
    expect((await post({ aceito: true, documentos: ["termos", "dpa", "privacidade"] })).status).toBe(409)
    expect(mocks.criarAceite).not.toHaveBeenCalled()
  })
})

describe("conferência do aceite no painel e no campo", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset()
    mocks.sessao.mockResolvedValue({ user: { id: "u1" } })
    mocks.org.mockResolvedValue("org-A")
    mocks.vinculo.mockResolvedValue({ papel: "editor", categoria: "externo" })
    mocks.aceites.mockResolvedValue([])
  })

  it("convidado que ainda não aceitou: pede os Termos do Profissional e a Privacidade", async () => {
    expect(await aceitePendenteDoPainel()).toEqual({
      pendentes: ["profissionais", "privacidade"], organizacaoId: "org-A", empresa: "Empresa A", emNomeDaEmpresa: false, versaoNova: false,
    })
  })
  it("falha aberta: banco fora ou tabela ausente não tranca ninguém fora", async () => {
    mocks.aceites.mockRejectedValue(new Error('relation "aceites_termos" does not exist'))
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await aceitePendenteDoPainel()).toBeNull()
  })
  it("sinal interno do Next (uso dinâmico no build) sobe, para o painel não virar página estática", async () => {
    const sinal = Object.assign(new Error("Dynamic server usage"), { digest: "DYNAMIC_SERVER_USAGE" })
    mocks.sessao.mockRejectedValue(sinal)
    await expect(aceitePendenteDoPainel()).rejects.toBe(sinal)
  })
})
