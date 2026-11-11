import { describe, expect, it } from "vitest"
import { EVENTO_CONVITE, EVENTO_EDICAO, EVENTO_RESPONSAVEL, EVENTO_WHATSAPP_MANUAL, eventoDescritoPelaObservacao } from "@/lib/status"
import { rotuloDeEvento } from "@/lib/job-fase"

// Revisão do PR #137: no histórico de Demandas (não cobertura), o envio pelo
// WhatsApp aparecia como "whatsapp_manual". Esses eventos se leem pela observação.
describe("eventos do histórico descritos pela observação", () => {
  it("edição, responsável, convite e envio pelo WhatsApp se descrevem pela observação", () => {
    for (const e of [EVENTO_EDICAO, EVENTO_RESPONSAVEL, EVENTO_CONVITE, EVENTO_WHATSAPP_MANUAL]) expect(eventoDescritoPelaObservacao(e)).toBe(true)
  })
  it("status de verdade continuam com o rótulo da etapa", () => {
    for (const s of ["revisao_pendente", "aprovado", "videomaker_notificado"]) expect(eventoDescritoPelaObservacao(s)).toBe(false)
  })
  it("sem observação, o rótulo é uma frase e nunca o código", () => {
    expect(rotuloDeEvento(EVENTO_WHATSAPP_MANUAL, null)).toBe("Enviado pelo WhatsApp")
    expect(rotuloDeEvento(EVENTO_CONVITE, null)).toBe("Convite do videomaker")
  })
})
