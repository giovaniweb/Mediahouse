import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Onda 1 (07/10/2026): as portas de fora. Cada bloco trava uma porta que estava
// aberta: login sem trava real, avaliação sem convite, e-mail sem escape, chave
// dos dados fiscais presa ao segredo do login e arquivo sem conferência no servidor.

describe("trava do login no banco (lib/limite-login)", () => {
  const consumir = vi.fn()
  beforeEach(() => {
    vi.resetModules()
    consumir.mockReset()
    vi.doMock("@/lib/limite-publico", () => ({
      consumirLimitePublico: (...a: unknown[]) => consumir(...a),
      hashDoIp: () => "ip-hash",
      hashComSegredo: (_r: string, v: string) => `h(${v})`,
    }))
  })

  it("conta por IP e por conta, sem a conta em claro na chave", async () => {
    consumir.mockResolvedValue(true)
    const { consumirLimiteLogin } = await import("@/lib/limite-login")
    expect(await consumirLimiteLogin("login", new Headers(), " Fulano@Empresa.com ")).toBe("ok")
    const chaves = consumir.mock.calls.map((c) => c[0] as string)
    expect(chaves).toEqual(["login:ip:ip-hash", "login:conta:h(fulano@empresa.com)"])
    expect(chaves.join()).not.toContain("Fulano")
  })

  it("passou do teto em qualquer um dos dois: bloqueado (e os dois contam)", async () => {
    consumir.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const { consumirLimiteLogin } = await import("@/lib/limite-login")
    expect(await consumirLimiteLogin("login", new Headers(), "a@b.c")).toBe("bloqueado")
    expect(consumir).toHaveBeenCalledTimes(2)
  })

  it("banco fora do ar ao contar: recusa (falha fechada)", async () => {
    consumir.mockRejectedValue(new Error("connection refused"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { consumirLimiteLogin } = await import("@/lib/limite-login")
    expect(await consumirLimiteLogin("esqueci", new Headers(), "a@b.c")).toBe("indisponivel")
  })

  it("telefone digitado com ou sem máscara conta como a mesma conta", async () => {
    const { contaDigitada } = await import("@/lib/limite-login")
    expect(contaDigitada("(11) 98888-7777")).toBe(contaDigitada("11988887777"))
  })
})

describe("esqueci a senha não diz quem tem conta", () => {
  it("e-mail que não existe recebe a mesma resposta de quem recebeu o link", async () => {
    vi.resetModules()
    vi.doMock("@/lib/limite-login", () => ({ consumirLimiteLogin: async () => "ok" }))
    const enviar = vi.fn()
    vi.doMock("@/lib/email", () => ({ sendEmailResetSenha: enviar }))
    vi.doMock("@/lib/prisma-auth", () => ({ prismaAuth: { usuario: { findUnique: async () => null } } }))
    const { POST } = await import("@/app/api/auth/esqueci-senha/route")
    const { NextRequest } = await import("next/server")
    const r = await POST(new NextRequest("http://x/api/auth/esqueci-senha", { method: "POST", body: JSON.stringify({ email: "ninguem@x.com" }) }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, enviado: true })
    expect(enviar).not.toHaveBeenCalled()
  })

  it("passou do limite: 429, sem consultar o banco", async () => {
    vi.resetModules()
    vi.doMock("@/lib/limite-login", () => ({ consumirLimiteLogin: async () => "bloqueado" }))
    vi.doMock("@/lib/email", () => ({ sendEmailResetSenha: vi.fn() }))
    const findUnique = vi.fn()
    vi.doMock("@/lib/prisma-auth", () => ({ prismaAuth: { usuario: { findUnique } } }))
    const { POST } = await import("@/app/api/auth/esqueci-senha/route")
    const { NextRequest } = await import("next/server")
    const r = await POST(new NextRequest("http://x/api/auth/esqueci-senha", { method: "POST", body: JSON.stringify({ email: "a@x.com" }) }))
    expect(r.status).toBe(429)
    expect(findUnique).not.toHaveBeenCalled()
  })
})

describe("convite de avaliação (lib/convite-avaliacao)", () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv("AUTH_SECRET", "segredo-de-teste-com-mais-de-32-caracteres!!") })
  afterEach(() => vi.unstubAllEnvs())
  const base = { tipo: "videomaker" as const, profissionalId: "vm1", demandaId: "d1", organizacaoId: "o1" }

  it("o convite gerado abre para o mesmo tipo e serviço", async () => {
    const { criarConvite, lerConvite } = await import("@/lib/convite-avaliacao")
    const { token } = criarConvite(base)
    const l = lerConvite(token, "videomaker")
    expect(l.ok && l.convite).toMatchObject({ profissionalId: "vm1", demandaId: "d1", organizacaoId: "o1" })
  })

  it("sem convite, com convite adulterado ou de outro tipo: não vale", async () => {
    const { criarConvite, lerConvite } = await import("@/lib/convite-avaliacao")
    const { token } = criarConvite(base)
    expect(lerConvite(null, "videomaker")).toEqual({ ok: false, motivo: "ausente" })
    const [v, corpo, sig] = token.split(".")
    const outro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(corpo, "base64url").toString()), p: "vm2" })).toString("base64url")
    expect(lerConvite(`${v}.${outro}.${sig}`, "videomaker")).toEqual({ ok: false, motivo: "invalido" })
    expect(lerConvite(token, "editor")).toEqual({ ok: false, motivo: "invalido" })
  })

  it("vence em 30 dias", async () => {
    const { criarConvite, lerConvite } = await import("@/lib/convite-avaliacao")
    const agora = Date.now()
    const { token } = criarConvite(base, agora)
    expect(lerConvite(token, "videomaker", agora + 29 * 86400000).ok).toBe(true)
    expect(lerConvite(token, "videomaker", agora + 31 * 86400000)).toEqual({ ok: false, motivo: "vencido" })
  })

  it("a rota pública recusa nota só com o id do videomaker (o jeito antigo)", async () => {
    vi.doMock("@/lib/prisma", () => ({ prisma: {}, prismaBase: {} }))
    const { POST } = await import("@/app/api/publico/avaliar/route")
    const { NextRequest } = await import("next/server")
    const r = await POST(new NextRequest("http://x/api/publico/avaliar", { method: "POST", body: JSON.stringify({ videomakerId: "vm1", nota: 5 }) }))
    expect(r.status).toBe(403)
  })
})

describe("e-mail escapa o que vem do usuário (lib/email)", () => {
  it("nome com HTML sai como texto, e link só http(s)", async () => {
    vi.resetModules()
    vi.doUnmock("@/lib/email")
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }))
    const { escaparHtml, linkSeguro, assuntoSeguro } = await import("@/lib/email")
    expect(escaparHtml(`<a href="https://golpe">Clique</a>`)).toBe("&lt;a href=&quot;https://golpe&quot;&gt;Clique&lt;/a&gt;")
    expect(linkSeguro("javascript:alert(1)")).toBe("")
    expect(linkSeguro("https://ok.com/a?b=1&c=2")).toBe("https://ok.com/a?b=1&amp;c=2")
    expect(assuntoSeguro("linha\r\nBcc: x@y")).toBe("linha Bcc: x@y")
  })
})

describe("chave própria dos dados sensíveis (lib/secret-crypto)", () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllEnvs())
  const NOVA = "chave-nova-de-teste-com-bem-mais-de-32-caracteres"

  it("sem a chave nova, tudo como antes (formato antigo com o segredo do login)", async () => {
    vi.stubEnv("CHAVE_CIFRA_DADOS", ""); vi.stubEnv("EMAIL_ENCRYPTION_KEY", ""); vi.stubEnv("NEXTAUTH_SECRET", "segredo-do-login")
    const { encryptSecret, decryptSecret } = await import("@/lib/secret-crypto")
    const c = encryptSecret("pix@exemplo.com")
    expect(c.startsWith("v2.")).toBe(false)
    expect(decryptSecret(c)).toBe("pix@exemplo.com")
  })

  it("com a chave nova: lê o antigo, grava no novo, e o novo sobrevive à troca do segredo do login", async () => {
    vi.stubEnv("CHAVE_CIFRA_DADOS", ""); vi.stubEnv("EMAIL_ENCRYPTION_KEY", ""); vi.stubEnv("NEXTAUTH_SECRET", "segredo-do-login")
    const antigo = (await import("@/lib/secret-crypto")).encryptSecret("pix-antigo")
    vi.resetModules(); vi.stubEnv("CHAVE_CIFRA_DADOS", NOVA)
    const m = await import("@/lib/secret-crypto")
    expect(m.decryptSecret(antigo)).toBe("pix-antigo")
    const novo = m.encryptSecret("pix-novo")
    expect(novo.startsWith("v2.")).toBe(true)
    vi.resetModules(); vi.stubEnv("NEXTAUTH_SECRET", "segredo-do-login-trocado")
    const depois = await import("@/lib/secret-crypto")
    expect(depois.decryptSecret(novo)).toBe("pix-novo")
    expect(() => depois.decryptSecret(antigo)).toThrow()
  })

  it("chave nova curta demais é ignorada (não vira chave fraca)", async () => {
    vi.stubEnv("CHAVE_CIFRA_DADOS", "curta"); vi.stubEnv("NEXTAUTH_SECRET", "segredo-do-login")
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { chaveNovaAtiva, encryptSecret } = await import("@/lib/secret-crypto")
    expect(chaveNovaAtiva()).toBe(false)
    expect(encryptSecret("x").startsWith("v2.")).toBe(false)
  })

  it("recifrar conta, regrava só o formato antigo e não mexe no ilegível", async () => {
    vi.stubEnv("CHAVE_CIFRA_DADOS", ""); vi.stubEnv("NEXTAUTH_SECRET", "segredo-do-login")
    const antigo = (await import("@/lib/secret-crypto")).encryptSecret("pix-antigo")
    vi.resetModules(); vi.stubEnv("CHAVE_CIFRA_DADOS", NOVA)
    const { recifrarTudo } = await import("@/lib/recifrar")
    const linhas: Record<string, { id: string; valor: string }[]> = { videomaker_dados_fiscais: [{ id: "a", valor: antigo }, { id: "b", valor: "lixo.sem.chave" }] }
    const updates: unknown[][] = []
    const db = {
      $queryRawUnsafe: async (sql: string, ultimo: string) => {
        const t = /FROM "(\w+)"/.exec(sql)![1], col = /SELECT id, "(\w+)"/.exec(sql)![1]
        return col === "chavePix" ? (linhas[t] ?? []).filter((l) => l.id > ultimo) : []
      },
      $executeRawUnsafe: async (_sql: string, ...p: unknown[]) => { updates.push(p); return 1 },
    }
    const conferir = await recifrarTudo(db as never, { aplicar: false })
    expect(conferir).toMatchObject({ pendentes: 2, recifrados: 0, ilegiveis: 1 })
    expect(updates).toHaveLength(0)
    const aplicado = await recifrarTudo(db as never, { aplicar: true })
    expect(aplicado).toMatchObject({ recifrados: 1, ilegiveis: 1 })
    expect(String(updates[0][0]).startsWith("v2.")).toBe(true)
    expect(updates[0].slice(1)).toEqual(["a", antigo])
  })
})

describe("arquivo conferido no servidor (lib/midia-limite)", () => {
  const bytes = (...b: (number | string)[]) => new Uint8Array(b.flatMap((x) => typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x]))
  it("os primeiros bytes têm de bater com o tipo declarado", async () => {
    const { assinaturaConfere } = await import("@/lib/midia-limite")
    expect(assinaturaConfere("application/pdf", bytes("%PDF-1.7"))).toBe(true)
    expect(assinaturaConfere("application/pdf", bytes("MZ", 0x90, 0))).toBe(false)
    expect(assinaturaConfere("image/png", bytes(0x89, "PNG"))).toBe(true)
    // .mkv que o navegador manda como "video/mp4": vale, é vídeo de verdade
    expect(assinaturaConfere("video/mp4", bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true)
    expect(assinaturaConfere("video/mp4", bytes(0, 0, 0, 0x20, "ftypisom"))).toBe(true)
    expect(assinaturaConfere("video/mp4", bytes("%PDF"))).toBe(false)
  })

  it("passou do limite: apaga e recusa; arquivo certo passa", async () => {
    vi.resetModules()
    const remover = vi.fn(async () => true)
    let amostra = { tamanho: 30 * 1024 * 1024, tipo: "application/pdf", inicio: bytes("%PDF-1.7") }
    vi.doMock("@/lib/midia", () => ({
      caminhoDaUrl: (u: string) => u.replace(/^\/api\/midia\//, ""),
      partesDaMidia: (c: string) => { const p = c.split("/"); return { organizacaoId: p[1], tipo: p[2], id: p[3] } },
      amostraDaMidia: async () => amostra,
      removerMidia: remover,
    }))
    const { conferirUpload } = await import("@/lib/midia-limite")
    const url = "/api/midia/org/o1/docs/d1/1.pdf"
    const grande = await conferirUpload(url)
    expect(grande && !grande.ok && grande.erro).toContain("limite é 25 MB")
    expect(remover).toHaveBeenCalledWith("org/o1/docs/d1/1.pdf")
    amostra = { tamanho: 1024, tipo: "application/pdf", inicio: bytes("%PDF-1.7") }
    expect(await conferirUpload(url)).toEqual({ ok: true, tamanho: 1024, tipo: "application/pdf" })
    // Na pasta do arquivo final o Growth manda PSD (tipo fora da lista): passa; executável, não.
    amostra = { tamanho: 1024, tipo: "image/vnd.adobe.photoshop", inicio: bytes("8BPS") }
    expect((await conferirUpload("/api/midia/org/o1/videos/d1/1.mp4"))?.ok).toBe(true)
    amostra = { tamanho: 1024, tipo: "application/octet-stream", inicio: bytes("MZ", 0x90) }
    expect((await conferirUpload("/api/midia/org/o1/videos/d1/1.mp4"))?.ok).toBe(false)
  })

  it("o teto dos arquivos grandes é configurável e, sem escolha, é o do armazenamento (5 GB)", async () => {
    const { limiteArquivoGrandeBytes } = await import("@/lib/midia-limite")
    const MB = 1024 * 1024
    expect(limiteArquivoGrandeBytes(undefined)).toBe(5120 * MB)
    expect(limiteArquivoGrandeBytes("500")).toBe(500 * MB)
    expect(limiteArquivoGrandeBytes("abc")).toBe(5120 * MB)
    expect(limiteArquivoGrandeBytes("1")).toBe(5120 * MB) // abaixo de 25 MB não é escolha, é engano
  })
})

describe("saúde: rotina atrasada (lib/saude-sistema)", () => {
  it("atrasada depois de duas cadências e meia hora; erro na última rodada conta", async () => {
    vi.resetModules()
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }))
    vi.doMock("@/lib/prisma-auth", () => ({ prismaAuth: {} }))
    const { estadoDaRotina } = await import("@/lib/saude-sistema")
    const agora = Date.now()
    const ha = (min: number) => new Date(agora - min * 60000)
    expect(estadoDaRotina(null, 5, agora)).toBe("sem_registro")
    expect(estadoDaRotina({ createdAt: ha(30), status: "concluido" }, 5, agora)).toBe("ok")
    expect(estadoDaRotina({ createdAt: ha(41), status: "concluido" }, 5, agora)).toBe("atrasada")
    expect(estadoDaRotina({ createdAt: ha(1), status: "erro" }, 5, agora)).toBe("erro")
  })
})
