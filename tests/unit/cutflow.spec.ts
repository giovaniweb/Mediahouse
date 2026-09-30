import { describe, it, expect, vi, beforeEach } from "vitest"

// Cutflow (30/09/2026): o plugin do Premiere entra com o login do NuFlow e edita
// os cards atribuídos ao editor "Cutflow". O que não pode regredir:
//
//   1. toda chamada do plugin confere sessão, módulo da empresa e permissão da
//      pessoa — faltou uma, 401/403 e nada é tocado;
//   2. o link do navegador não entrega a sessão: só quem tem o segredo do
//      computador a recebe, e uma vez só;
//   3. dois computadores não editam o mesmo card;
//   4. pasta que o NuFlow não enxerga, ou link que não é do Drive, nunca vira
//      lista vazia calada.

process.env.NEXTAUTH_SECRET = "segredo-de-teste-com-mais-de-32-caracteres"

const db = {
  cutflowSessao: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  cutflowPuxada: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  editorOrganizacao: { findMany: vi.fn() },
  demanda: { findMany: vi.fn(), findFirst: vi.fn() },
  historicoStatus: { create: vi.fn() },
  usuario: { findUnique: vi.fn(), findMany: vi.fn() },
  organizacao: { findUnique: vi.fn() },
}
vi.mock("@/lib/prisma", () => ({ prisma: db, prismaBase: db }))
const orgPorCredencial = vi.fn()
vi.mock("@/lib/org-por-credencial", () => ({ orgPorCredencial: (...a: unknown[]) => orgPorCredencial(...a) }))
const declararOrg = vi.fn()
vi.mock("@/lib/org-contexto", () => ({ declararOrg: (...a: unknown[]) => declararOrg(...a) }))
const moduloAtivo = vi.fn()
vi.mock("@/lib/modulos-org", () => ({ moduloAtivo: (...a: unknown[]) => moduloAtivo(...a) }))
const permissoesEfetivas = vi.fn()
vi.mock("@/lib/permissoes-server", () => ({ permissoesEfetivas: (...a: unknown[]) => permissoesEfetivas(...a) }))
const sessaoNavegador = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => sessaoNavegador() }))
vi.mock("@/lib/org", () => ({ getOrgId: async () => "org-A", semOrg: () => new Response(null, { status: 403 }) }))
const getAccessToken = vi.fn()
vi.mock("@/lib/google-drive", () => ({ getAccessToken: (...a: unknown[]) => getAccessToken(...a) }))

const L = await import("@/lib/cutflow")
const { POST: conectar } = await import("@/app/api/cutflow/conectar/route")
const { POST: autorizar } = await import("@/app/api/cutflow/autorizar/route")
const { POST: buscarSessao } = await import("@/app/api/cutflow/sessao/route")
const { GET: fila } = await import("@/app/api/cutflow/fila/route")
const { POST: puxar } = await import("@/app/api/cutflow/fila/[id]/puxar/route")
const { GET: arquivos } = await import("@/app/api/cutflow/demandas/[id]/arquivos/route")

const TOKEN = "t".repeat(43)
const HASH = L.hashCutflow("segredo-do-computador-com-bastante-tamanho")
const req = (body?: unknown, token: string | null = TOKEN) =>
  ({
    headers: new Headers({ ...(token ? { authorization: `Bearer ${token}` } : {}), "x-forwarded-for": "1.2.3.4" }),
    json: async () => body,
    nextUrl: new URL("https://nuflow.space/api/cutflow/conectar"),
  }) as never
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const futuro = () => new Date(Date.now() + 86_400_000)

function sessaoValida(extra: Record<string, unknown> = {}) {
  orgPorCredencial.mockResolvedValue("org-A")
  db.cutflowSessao.findUnique.mockResolvedValue({
    id: "s-1", organizacaoId: "org-A", usuarioId: "u-1", nomeComputador: "Mac do Giovani",
    revogadaEm: null, expiraEm: futuro(), ultimoUsoEm: new Date(), ...extra,
  })
  moduloAtivo.mockResolvedValue(true)
  permissoesEfetivas.mockResolvedValue({ papel: "editor", permissoes: { usarCutflow: true } })
}

beforeEach(() => {
  vi.clearAllMocks()
  db.usuario.findUnique.mockResolvedValue({ nome: "Giovani", email: "g@x" })
  db.organizacao.findUnique.mockResolvedValue({ nome: "Media House" })
})

describe("peças da biblioteca", () => {
  it("pedido assinado volta igual e recusa adulteração, vencimento e lixo", () => {
    const p = L.assinarPedido(HASH, "Mac")
    expect(L.lerPedido(p)).toMatchObject({ dispositivoHash: HASH, nomeComputador: "Mac" })
    const [b64, ass] = p.split(".")
    const outro = Buffer.from(JSON.stringify({ h: "a".repeat(64), n: "Mac", e: Date.now() + 60_000 })).toString("base64url")
    expect(L.lerPedido(`${outro}.${ass}`)).toBeNull()
    expect(L.lerPedido(`${b64}.${ass.slice(0, -2)}xx`)).toBeNull()
    expect(L.lerPedido(L.assinarPedido(HASH, "Mac", Date.now() - L.VALIDADE_PEDIDO_MS - 1))).toBeNull()
    for (const lixo of ["", "a.b", null, undefined, "x".repeat(3000)]) expect(L.lerPedido(lixo as string)).toBeNull()
  })

  it("código de confirmação é estável, curto e muda com o computador", () => {
    const c = L.codigoDeConfirmacao(HASH)
    expect(c).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/)
    expect(L.codigoDeConfirmacao(HASH)).toBe(c)
    expect(L.codigoDeConfirmacao(L.hashCutflow("outro"))).not.toBe(c)
  })

  it("pasta do Drive só de URL oficial de pasta", () => {
    expect(L.pastaDoDrive("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn")).toBe("1AbCdEfGhIjKlMn")
    expect(L.pastaDoDrive("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view")).toBeNull()
    expect(L.pastaDoDrive("http://drive.google.com/drive/folders/1AbCdEfGhIjKlMn")).toBeNull()
    expect(L.pastaDoDrive("https://we.tl/t-abc")).toBeNull()
    expect(L.pastaDoDrive(null)).toBeNull()
  })
})

describe("autenticação de toda chamada do plugin", () => {
  const chamar = (token: string | null = TOKEN) => L.autenticarCutflow(req(undefined, token))
  const status = async (r: unknown) => (r as Response).status

  it("sem token ou token curto: 401 sem consultar nada", async () => {
    for (const t of [null, "curto"]) expect(await status(await chamar(t))).toBe(401)
    expect(orgPorCredencial).not.toHaveBeenCalled()
  })

  it("credencial que não casa (vencida, revogada, de ninguém): 401 e nada é declarado", async () => {
    orgPorCredencial.mockResolvedValue(null)
    expect(await status(await chamar())).toBe(401)
    expect(declararOrg).not.toHaveBeenCalled()
    expect(db.cutflowSessao.findUnique).not.toHaveBeenCalled()
  })

  it("sessão revogada, vencida ou de outra empresa: 401", async () => {
    for (const extra of [{ revogadaEm: new Date() }, { expiraEm: new Date(Date.now() - 1) }, { organizacaoId: "org-B" }]) {
      sessaoValida(extra)
      expect(await status(await chamar())).toBe(401)
    }
  })

  it("módulo desligado na empresa: 403 motivo modulo", async () => {
    sessaoValida(); moduloAtivo.mockResolvedValue(false)
    const r = (await chamar()) as Response
    expect(r.status).toBe(403)
    expect((await r.json()).motivo).toBe("modulo")
  })

  it("sem a permissão usarCutflow, ou sem vínculo determinável: 403 motivo permissao", async () => {
    for (const v of [{ papel: "editor", permissoes: { usarCutflow: false } }, null]) {
      sessaoValida(); permissoesEfetivas.mockResolvedValue(v)
      const r = (await chamar()) as Response
      expect(r.status).toBe(403)
      expect((await r.json()).motivo).toBe("permissao")
    }
  })

  it("tudo certo: declara a empresa e devolve o contexto; renova só se o último uso é antigo", async () => {
    sessaoValida()
    const ctx = await chamar()
    expect(ctx).toMatchObject({ organizacaoId: "org-A", usuarioId: "u-1", sessaoId: "s-1" })
    expect(declararOrg).toHaveBeenCalledWith("org-A")
    expect(orgPorCredencial).toHaveBeenCalledWith("cutflow_sessao", L.hashCutflow(TOKEN))
    expect(db.cutflowSessao.update).not.toHaveBeenCalled()
    sessaoValida({ ultimoUsoEm: new Date(Date.now() - 2 * 3600_000) })
    await chamar()
    expect(db.cutflowSessao.update).toHaveBeenCalledOnce()
  })
})

describe("login do plugin (fluxo de dispositivo)", () => {
  it("conectar recusa hash inválido e devolve link com pedido e código", async () => {
    expect((await conectar(req({ dispositivoHash: "abc" }, null))).status).toBe(400)
    const r = await conectar(req({ dispositivoHash: HASH, nomeComputador: "Mac <script>" }, null))
    const d = await r.json()
    expect(d.url).toMatch(/^https:\/\/.+\/cutflow\/conectar\?pedido=/)
    expect(d.confirmacao).toBe(L.codigoDeConfirmacao(HASH))
    const pedido = L.lerPedido(decodeURIComponent(d.url.split("pedido=")[1]))
    expect(pedido?.nomeComputador).toBe("Mac script")
  })

  it("autorizar exige sessão do navegador, pedido válido, módulo e permissão", async () => {
    sessaoNavegador.mockResolvedValue(null)
    expect((await autorizar(req({ pedido: L.assinarPedido(HASH, "Mac") }, null))).status).toBe(401)
    sessaoNavegador.mockResolvedValue({ user: { id: "u-1" } })
    expect((await autorizar(req({ pedido: "adulterado.x" }, null))).status).toBe(400)
    moduloAtivo.mockResolvedValue(false)
    expect((await autorizar(req({ pedido: L.assinarPedido(HASH, "Mac") }, null))).status).toBe(403)
    moduloAtivo.mockResolvedValue(true)
    permissoesEfetivas.mockResolvedValue({ papel: "social", permissoes: { usarCutflow: false } })
    expect((await autorizar(req({ pedido: L.assinarPedido(HASH, "Mac") }, null))).status).toBe(403)
    expect(db.cutflowSessao.create).not.toHaveBeenCalled()
  })

  it("autorizar grava empresa, pessoa e hash — nunca devolve a sessão", async () => {
    sessaoNavegador.mockResolvedValue({ user: { id: "u-1" } })
    moduloAtivo.mockResolvedValue(true)
    permissoesEfetivas.mockResolvedValue({ papel: "editor", permissoes: { usarCutflow: true } })
    const r = await autorizar(req({ pedido: L.assinarPedido(HASH, "Mac") }, null))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ autorizado: true })
    expect(db.cutflowSessao.create.mock.calls[0][0].data).toMatchObject({ organizacaoId: "org-A", usuarioId: "u-1", dispositivoHash: HASH })
    db.cutflowSessao.create.mockRejectedValue({ code: "P2002" })
    expect((await autorizar(req({ pedido: L.assinarPedido(HASH, "Mac") }, null))).status).toBe(409)
  })

  it("buscar a sessão: pendente até autorizar, entregue uma vez, guardada só como hash", async () => {
    expect((await buscarSessao(req({ dispositivo: "curto" }, null))).status).toBe(400)
    orgPorCredencial.mockResolvedValue(null)
    expect((await buscarSessao(req({ dispositivo: "segredo-do-computador-com-bastante-tamanho" }, null))).status).toBe(202)

    orgPorCredencial.mockResolvedValue("org-A")
    db.cutflowSessao.updateMany.mockResolvedValue({ count: 0 })  // outra pergunta levou antes
    expect((await buscarSessao(req({ dispositivo: "segredo-do-computador-com-bastante-tamanho" }, null))).status).toBe(202)

    db.cutflowSessao.updateMany.mockResolvedValue({ count: 1 })
    db.cutflowSessao.findUnique.mockResolvedValue({ usuarioId: "u-1" })
    const r = await buscarSessao(req({ dispositivo: "segredo-do-computador-com-bastante-tamanho" }, null))
    const d = await r.json()
    expect(r.status).toBe(200)
    const chamada = db.cutflowSessao.updateMany.mock.calls.at(-1)![0]
    expect(chamada.where).toMatchObject({ organizacaoId: "org-A", dispositivoHash: HASH, tokenHash: null, revogadaEm: null })
    expect(chamada.data.tokenHash).toBe(L.hashCutflow(d.token))
    expect(chamada.data.tokenHash).not.toBe(d.token)
    expect(orgPorCredencial).toHaveBeenLastCalledWith("cutflow_dispositivo", HASH)
  })
})

describe("fila do editor Cutflow", () => {
  it("sem editor Cutflow, ou com dois, avisa em vez de escolher", async () => {
    sessaoValida()
    db.editorOrganizacao.findMany.mockResolvedValue([])
    expect((await (await fila(req())).json()).aviso).toMatch(/Cadastre um editor chamado "Cutflow"/)
    db.editorOrganizacao.findMany.mockResolvedValue([{ editorId: "e-1" }, { editorId: "e-2" }])
    expect((await (await fila(req())).json()).aviso).toMatch(/mais de um editor/)
    expect(db.demanda.findMany).not.toHaveBeenCalled()
  })

  it("lista só a empresa, o editor e o que não saiu da edição; brutos prefere a pasta", async () => {
    sessaoValida()
    db.editorOrganizacao.findMany.mockResolvedValue([{ editorId: "e-cut" }])
    db.demanda.findMany.mockResolvedValue([
      { id: "d-1", codigo: "D1", linkFolderBrutos: "https://drive.google.com/drive/folders/PASTA123456", linkBrutos: "https://we.tl/x" },
      { id: "d-2", codigo: "D2", linkFolderBrutos: null, linkBrutos: "https://we.tl/y" },
    ])
    db.cutflowPuxada.findMany.mockResolvedValue([{ demandaId: "d-1", usuarioId: "u-2", sessaoId: "s-9", puxadaEm: new Date() }])
    db.usuario.findMany.mockResolvedValue([{ id: "u-2", nome: "Ana" }])
    const d = await (await fila(req())).json()
    const where = db.demanda.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ organizacaoId: "org-A", editorId: "e-cut" })
    expect(where.statusInterno.notIn).toContain("edicao_finalizada")
    expect(d.fila[0].brutos).toContain("drive.google.com")
    expect(d.fila[1].brutos).toBe("https://we.tl/y")
    expect(d.fila[0].puxada).toMatchObject({ por: "Ana", esteComputador: false })
    expect(d.fila[1].puxada).toBeNull()
  })
})

describe("puxar: trava contra edição dupla", () => {
  beforeEach(() => {
    sessaoValida()
    db.editorOrganizacao.findMany.mockResolvedValue([{ editorId: "e-cut" }])
    db.demanda.findFirst.mockResolvedValue({ id: "d-1", codigo: "D1", statusInterno: "fila_edicao" })
  })

  it("card fora da fila (de outro editor, de outra empresa, já finalizado): 404", async () => {
    db.demanda.findFirst.mockResolvedValue(null)
    expect((await puxar(req(), params("d-x"))).status).toBe(404)
    expect(db.cutflowPuxada.create).not.toHaveBeenCalled()
  })

  it("já puxado por outra pessoa: 409 com o nome; por mim em outro computador: 409 dizendo isso", async () => {
    db.cutflowPuxada.findUnique.mockResolvedValue({ usuarioId: "u-2", sessaoId: "s-9", puxadaEm: new Date() })
    db.usuario.findUnique.mockResolvedValue({ nome: "Ana" })
    let r = await puxar(req(), params("d-1"))
    expect(r.status).toBe(409)
    expect((await r.json()).emEdicaoPor).toBe("Ana")
    db.cutflowPuxada.findUnique.mockResolvedValue({ usuarioId: "u-1", sessaoId: "s-9", puxadaEm: new Date() })
    r = await puxar(req(), params("d-1"))
    expect((await r.json()).emEdicaoPor).toBe("você, em outro computador")
    expect(db.cutflowPuxada.create).not.toHaveBeenCalled()
  })

  it("puxar de novo do mesmo computador devolve o que já existe, sem outro histórico", async () => {
    db.cutflowPuxada.findUnique.mockResolvedValue({ usuarioId: "u-1", sessaoId: "s-1", puxadaEm: new Date() })
    const r = await puxar(req(), params("d-1"))
    expect(await r.json()).toMatchObject({ puxada: true, jaEra: true })
    expect(db.historicoStatus.create).not.toHaveBeenCalled()
  })

  it("corrida perdida no banco (P2002) vira 409 com quem ganhou", async () => {
    db.cutflowPuxada.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ usuarioId: "u-2", sessaoId: "s-9", puxadaEm: new Date() })
    db.cutflowPuxada.create.mockRejectedValue({ code: "P2002" })
    db.usuario.findUnique.mockResolvedValue({ nome: "Ana" })
    expect((await puxar(req(), params("d-1"))).status).toBe(409)
    expect(db.historicoStatus.create).not.toHaveBeenCalled()
  })

  it("puxar grava a trava e o evento no histórico, sem mudar o status", async () => {
    db.cutflowPuxada.findUnique.mockResolvedValue(null)
    db.cutflowPuxada.create.mockResolvedValue({})
    expect((await puxar(req(), params("d-1"))).status).toBe(200)
    expect(db.cutflowPuxada.create.mock.calls[0][0].data).toEqual({ organizacaoId: "org-A", demandaId: "d-1", usuarioId: "u-1", sessaoId: "s-1" })
    const h = db.historicoStatus.create.mock.calls[0][0].data
    expect(h).toMatchObject({ demandaId: "d-1", statusAnterior: "fila_edicao", statusNovo: "cutflow_puxado", origem: "automacao" })
    expect(h.observacao).toBe("Edição iniciada no Cutflow por Giovani (Mac do Giovani)")
  })
})

describe("arquivos do material bruto", () => {
  const drive = (respostas: Record<string, { status: number; files?: unknown[] }>) =>
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      const pasta = /'([^']+)' in parents/.exec(url.searchParams.get("q")!)![1]
      const r = respostas[pasta] ?? { status: 200, files: [] }
      return { ok: r.status === 200, status: r.status, json: async () => ({ files: r.files }) }
    }))

  beforeEach(() => {
    sessaoValida()
    db.cutflowPuxada.findUnique.mockResolvedValue({ sessaoId: "s-1" })
    getAccessToken.mockResolvedValue("drive-token")
  })

  it("sem puxar neste computador não lista nada", async () => {
    for (const p of [null, { sessaoId: "s-9" }]) {
      db.cutflowPuxada.findUnique.mockResolvedValue(p)
      expect((await arquivos(req(), params("d-1"))).status).toBe(409)
    }
    expect(getAccessToken).not.toHaveBeenCalled()
  })

  it("sem link, ou link que não é pasta do Drive: diz o que fazer, sem token", async () => {
    db.demanda.findFirst.mockResolvedValue({ linkFolderBrutos: null, linkBrutos: null })
    expect((await (await arquivos(req(), params("d-1"))).json()).aviso).toMatch(/não tem link/)
    db.demanda.findFirst.mockResolvedValue({ linkFolderBrutos: null, linkBrutos: "https://we.tl/t-abc" })
    const d = await (await arquivos(req(), params("d-1"))).json()
    expect(d).toMatchObject({ manual: true, link: "https://we.tl/t-abc" })
    expect(d.token).toBeUndefined()
  })

  it("pasta que o NuFlow não enxerga: semAcesso com a instrução, nunca lista vazia calada", async () => {
    db.demanda.findFirst.mockResolvedValue({ linkFolderBrutos: "https://drive.google.com/drive/folders/PASTA123456", linkBrutos: null })
    drive({ PASTA123456: { status: 404 } })
    const d = await (await arquivos(req(), params("d-1"))).json()
    expect(d.semAcesso).toBe(true)
    expect(d.aviso).toMatch(/compartilhar com a conta do Drive/)
    expect(d.token).toBeUndefined()
  })

  it("lista os vídeos da pasta e de uma subpasta, ignora o resto, devolve token curto", async () => {
    db.demanda.findFirst.mockResolvedValue({ linkFolderBrutos: "https://drive.google.com/drive/folders/PASTA123456", linkBrutos: null })
    drive({
      PASTA123456: { status: 200, files: [
        { id: "v1", name: "C0169.MP4", size: "1000", mimeType: "video/mp4" },
        { id: "sub", name: "Camera B", mimeType: "application/vnd.google-apps.folder" },
        { id: "doc", name: "roteiro.pdf", mimeType: "application/pdf" },
      ] },
      sub: { status: 200, files: [{ id: "v2", name: "B001.MOV", size: "2000", mimeType: "video/quicktime" }] },
    })
    const d = await (await arquivos(req(), params("d-1"))).json()
    expect(d.arquivos.map((a: { id: string }) => a.id)).toEqual(["v1", "v2"])
    expect(d.arquivos[1].subpasta).toBe("Camera B")
    expect(d.ignorados).toBe(1)
    expect(d.token).toBe("drive-token")
    expect(new Date(d.tokenExpiraEm).getTime() - Date.now()).toBeLessThanOrEqual(45 * 60_000)
    expect(getAccessToken).toHaveBeenCalledWith("org-A")
  })
})
