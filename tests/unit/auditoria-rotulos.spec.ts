import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/org-contexto", () => ({ comOrg: vi.fn() }))

const { ACOES_AUDITORIA } = await import("@/lib/auditoria")
const { descreverEventoAuditoria } = await import("@/lib/auditoria-leitura")

// A tela de Auditoria mostrava nove ações como código cru ("whatsapp.pausar ·
// concluída · mensagem cmu…"). O tipo já obriga o rótulo; este teste prende a
// frase: nenhuma ação vira código, e o id técnico não entra no texto.
describe("frase das ações administrativas", () => {
  it("toda ação tem rótulo legível", () => {
    for (const acao of ACOES_AUDITORIA) {
      const frase = descreverEventoAuditoria({ acao, resultado: "sucesso" })
      expect(frase, acao).not.toContain(acao)
      expect(frase, acao).toMatch(/^[A-ZÁÉÍÓÚ]/)
    }
  })

  it("resultado em português; envio da IA aceito é do provedor, não 'concluído'", () => {
    expect(descreverEventoAuditoria({ acao: "convite.criar", resultado: "negado" })).toBe("Convite enviado · negada")
    expect(descreverEventoAuditoria({ acao: "ia.envio", resultado: "sucesso" })).toBe("Solicitação de envio pela IA · aceita pelo provedor")
  })
})
