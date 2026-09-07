import { beforeEach, describe, expect, it, vi } from "vitest"

const enviar = vi.fn()
const buscarConfigEmail = vi.fn()

vi.mock("resend", () => ({
  Resend: function ResendMock() {
    return { emails: { send: (...args: unknown[]) => enviar(...args) } }
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    configEmail: { findFirst: (...args: unknown[]) => buscarConfigEmail(...args) },
  },
}))

const { sendEmailFinanceiro, sendEmailResetSenha, statusEmailGlobal } = await import("@/lib/email")

beforeEach(() => {
  vi.restoreAllMocks()
  enviar.mockReset()
  buscarConfigEmail.mockReset()
  vi.stubEnv("RESEND_API_KEY", "re_teste_global")
  vi.stubEnv("RESEND_FROM_EMAIL", "noreply@nuflow.space")
  vi.stubEnv("RESEND_FROM_NAME", "NuFlow")
  vi.stubEnv("NEXTAUTH_URL", "https://nuflow.space")
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("e-mail global", () => {
  it("envia redefinição de senha pelo remetente global, sem consultar configuração de organização", async () => {
    enviar.mockResolvedValue({ data: { id: "email-reset-1" }, error: null })

    const resultado = await sendEmailResetSenha("Pessoa@Exemplo.com ", "Pessoa", "token-seguro")

    expect(resultado).toEqual({ ok: true, emailId: "email-reset-1" })
    expect(buscarConfigEmail).not.toHaveBeenCalled()
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({
      from: '"NuFlow" <noreply@nuflow.space>',
      to: ["pessoa@exemplo.com"],
      subject: "[NuFlow] Redefinição de Senha",
      html: expect.stringContaining("https://nuflow.space/redefinir-senha/token-seguro"),
    }))
  })

  it("usa a organização somente para descobrir os destinatários financeiros", async () => {
    buscarConfigEmail.mockResolvedValue({
      emailsFinanceiro: [" Financeiro@Empresa.com ", "invalido", "contas@empresa.com"],
    })
    enviar.mockResolvedValue({ data: { id: "email-financeiro-1" }, error: null })

    const resultado = await sendEmailFinanceiro({
      nomeVideomaker: "Ana",
      valorDiaria: 250,
      chavePix: "chave-pix",
      codigoDemanda: "VOP-1",
      tituloDemanda: "Captação",
      custoId: "custo-1",
    }, "org-1")

    expect(resultado.ok).toBe(true)
    expect(buscarConfigEmail).toHaveBeenCalledWith({
      where: { organizacaoId: "org-1" },
      orderBy: { createdAt: "desc" },
      select: { emailsFinanceiro: true },
    })
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({
      from: '"NuFlow" <noreply@nuflow.space>',
      to: ["financeiro@empresa.com", "contas@empresa.com"],
    }))
  })

  it("falha fechado quando o remetente global não foi definido", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "")

    const resultado = await sendEmailResetSenha("pessoa@exemplo.com", "Pessoa", "token")

    expect(resultado).toEqual({ ok: false, error: "E-mail global não configurado" })
    expect(enviar).not.toHaveBeenCalled()
    expect(statusEmailGlobal()).toEqual({ ativo: false, senderEmail: "", senderNome: "NuFlow" })
  })
})
