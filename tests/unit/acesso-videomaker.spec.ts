import { describe, expect, it } from "vitest"
import {
  emailInterno, emailReal, htmlAcessoEmail, mascararEmail, mascararTelefone, situacaoDaConta, textoAcessoWhatsapp,
} from "@/lib/acesso-videomaker"
import { SENHA_PENDENTE } from "@/lib/convite-equipe"

describe("acesso do videomaker", () => {
  it("e-mail interno (@nuflow.local) não conta como e-mail real", () => {
    expect(emailReal("maicon.andrade@nuflow.local")).toBeNull()
    expect(emailReal("Maicon@NuFlow.Local")).toBeNull()
    expect(emailReal(" maicon@gmail.com ")).toBe("maicon@gmail.com")
    expect(emailReal(null)).toBeNull()
    expect(emailInterno("cmmwt5aam000ksy1v2nm5z6jg")).toBe("videomaker.cmmwt5aam000ksy1v2nm5z6jg@nuflow.local")
  })

  it("situação da conta", () => {
    expect(situacaoDaConta(null, false)).toBe("sem_conta")
    expect(situacaoDaConta(SENHA_PENDENTE, true)).toBe("aguardando_senha")
    expect(situacaoDaConta("$2a$12$x", true)).toBe("com_senha")
  })

  it("mascara telefone e e-mail para a ficha", () => {
    expect(mascararTelefone("5521966255322")).toBe("(21) 9••••-5322")
    expect(mascararTelefone("21966255322")).toBe("(21) 9••••-5322")
    expect(mascararTelefone("123")).toBeNull()
    expect(mascararEmail("maicon@gmail.com")).toBe("ma•••@gmail.com")
    expect(mascararEmail("maicon@nuflow.local")).toBeNull()
  })

  it("o WhatsApp leva o link e o login, nunca uma senha", () => {
    const t = textoAcessoWhatsapp({ nome: "Maicon Andrade", link: "https://nuflow.space/redefinir-senha/abc", telefoneLogin: "21966255322", emailLogin: null, empresa: "Contourline" })
    expect(t).toContain("Olá, Maicon!")
    expect(t).toContain("https://nuflow.space/redefinir-senha/abc")
    expect(t).toContain("seu número de telefone (21966255322)")
    expect(t).not.toMatch(/\*Senha:\*/)
    expect(t).toContain("7 dias")
    const semTelefone = textoAcessoWhatsapp({ nome: "Ana", link: "l", telefoneLogin: null, emailLogin: "ana@x.com", empresa: "X" })
    expect(semTelefone).toContain("📧 *Login:* ana@x.com")
  })

  it("o e-mail escapa o que vem do cadastro", () => {
    const h = htmlAcessoEmail({ nome: "<b>Zé</b>", link: "https://x/\"><script>", empresa: "A&B", telefoneLogin: null })
    expect(h).not.toContain("<b>Zé</b>")
    expect(h).not.toContain("<script>")
    expect(h).toContain("A&amp;B")
  })
})
