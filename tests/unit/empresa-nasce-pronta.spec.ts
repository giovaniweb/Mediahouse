import { describe, expect, it, vi } from "vitest"
import bcrypt from "bcryptjs"
vi.mock("@/lib/email", () => ({ sendEmailNotificacao: vi.fn() }))
import { SENHA_PENDENTE, convitePendente, emailDoConvite, ehPapelConvite, gerarTokenConvite, htmlConvite, linkConvite, VALIDADE_CONVITE_DIAS } from "@/lib/convite-equipe"
import { CHECKLISTS_INICIAIS, PARAMETROS_INICIAIS } from "@/lib/pacote-inicial"
import { montarPassos } from "@/lib/primeiros-passos"

// Onda 2A: empresa nova nasce pronta, a equipe entra por convite e o admin vê
// os primeiros passos.

describe("convite por e-mail", () => {
  it("a senha pendente nunca confere no login, com nenhuma senha", async () => {
    expect(SENHA_PENDENTE).not.toHaveLength(60)
    for (const tentativa of ["", SENHA_PENDENTE, "convite-pendente", "Senha123"]) {
      expect(await bcrypt.compare(tentativa, SENHA_PENDENTE)).toBe(false)
    }
    expect(convitePendente(SENHA_PENDENTE)).toBe(true)
    expect(convitePendente(await bcrypt.hash("Senha123", 4))).toBe(false)
  })

  it("o link vale 7 dias e invalida o anterior", async () => {
    const chamadas: string[] = []
    const db = {
      passwordResetToken: {
        updateMany: async (a: { where: { email: string } }) => { chamadas.push(`invalida:${a.where.email}`) },
        create: async (a: { data: { email: string; token: string; expiresAt: Date } }) => { chamadas.push(`cria:${a.data.expiresAt.toISOString()}`) },
      },
    }
    const agora = new Date("2026-10-21T12:00:00Z")
    const token = await gerarTokenConvite(db, "gabriel@gh.test", agora)
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect(chamadas).toEqual(["invalida:gabriel@gh.test", `cria:${new Date(agora.getTime() + VALIDADE_CONVITE_DIAS * 86400_000).toISOString()}`])
    expect(linkConvite(token)).toMatch(new RegExp(`/redefinir-senha/${token}$`))
  })

  it("o e-mail escapa o que vem de formulário", () => {
    const html = htmlConvite({ nome: "<b>Ana</b>", empresa: `GH "Produções"`, papel: "editor", link: "https://nuflow.space/redefinir-senha/abc", convidadoPor: "<script>" })
    expect(html).not.toContain("<b>Ana</b>")
    expect(html).toContain("&lt;b&gt;Ana&lt;/b&gt;")
    expect(html).toContain("GH &quot;Produções&quot;")
    expect(html).not.toContain("<script>")
    expect(html).toContain("Videomaker interno")
    expect(html).toContain("Criar minha senha")
    // Quem já tem conta recebe o aviso com o login, sem link de senha.
    expect(htmlConvite({ nome: "Ana", empresa: "GH", papel: "admin", link: null })).toContain("Entrar no NuFlow")
  })

  it("só os papéis do convite e e-mails válidos passam", () => {
    for (const p of ["admin", "gestor", "social", "designer", "editor", "solicitante"]) expect(ehPapelConvite(p)).toBe(true)
    for (const p of ["videomaker", "operacao", "", null]) expect(ehPapelConvite(p)).toBe(false)
    expect(emailDoConvite("  Gabriel@GH.test ")).toBe("gabriel@gh.test")
    expect(emailDoConvite("sem-arroba")).toBeNull()
  })
})

describe("pacote inicial", () => {
  it("traz departamentos, tipos de vídeo e de criativo, sem valor repetido por grupo", () => {
    const grupos = new Set(PARAMETROS_INICIAIS.map((p) => p.grupo))
    expect([...grupos].sort()).toEqual(["areas_atuacao", "departamentos", "habilidades", "tipos_criativo", "tipos_video"])
    const chaves = PARAMETROS_INICIAIS.map((p) => `${p.grupo}:${p.valor}`)
    expect(new Set(chaves).size).toBe(chaves.length)
    expect(PARAMETROS_INICIAIS.filter((p) => p.grupo === "tipos_video").map((p) => p.valor)).toContain("reels")
  })

  it("os checklists batem com tipos que existem e não falam mais em Drive", () => {
    const tipos = new Set(PARAMETROS_INICIAIS.filter((p) => p.grupo === "tipos_video").map((p) => p.valor))
    for (const c of CHECKLISTS_INICIAIS) {
      if (c.tipoVideo) expect(tipos.has(c.tipoVideo)).toBe(true)
      expect(c.itens.join(" ")).not.toMatch(/drive/i)
    }
    expect(CHECKLISTS_INICIAIS.some((c) => c.nome === "Geral" && c.tipoVideo === null)).toBe(true)
  })
})

describe("primeiros passos", () => {
  const nova = { whatsappConectado: false, pessoas: 1, produtos: 0, linhasProprias: 0, linkCopiado: false, demandas: 0 }
  it("empresa recém-criada: os cinco itens, na ordem combinada", () => {
    expect(montarPassos(nova).map((p) => [p.chave, p.feito])).toEqual([
      ["whatsapp", false], ["equipe", false], ["produtos", false], ["link", false], ["demanda", false],
    ])
  })
  it("cada item é feito pelos próprios dados", () => {
    const feitos = montarPassos({ whatsappConectado: true, pessoas: 2, produtos: 0, linhasProprias: 1, linkCopiado: true, demandas: 1 })
    expect(feitos.every((p) => p.feito)).toBe(true)
  })
})
