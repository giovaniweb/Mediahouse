import { describe, it, expect } from "vitest"
import type { Session } from "next-auth"
import { recorteDoGestorDeEventos } from "@/lib/escopo-demanda"

// O gestor de eventos vê os cards de evento E os que pediu (03/11/2026). Antes
// eram só os de evento, e na Contourline nenhum card tem evento ligado.

const sessao = (papel: string | null) =>
  ({ user: { id: "u-1", papel, tipo: papel ?? "solicitante", organizacaoId: "org-1" }, expires: "" }) as unknown as Session

describe("recorteDoGestorDeEventos", () => {
  it("gestor de eventos: cards de evento ou pedidos por ele, num OR só", () => {
    expect(recorteDoGestorDeEventos(sessao("gestor_eventos"))).toEqual({
      OR: [{ eventoGestaoId: { not: null } }, { solicitanteId: "u-1" }],
    })
  })

  it("o recorte é de quem está na sessão, não de outra pessoa", () => {
    const outra = { ...sessao("gestor_eventos"), user: { id: "u-2", papel: "gestor_eventos" } } as unknown as Session
    expect(recorteDoGestorDeEventos(outra)).toEqual({
      OR: [{ eventoGestaoId: { not: null } }, { solicitanteId: "u-2" }],
    })
  })

  it("os demais papéis não ganham recorte nenhum", () => {
    for (const papel of ["admin", "gestor", "operacao", "social", "designer", "editor", "videomaker", "solicitante", null]) {
      expect(recorteDoGestorDeEventos(sessao(papel))).toBeNull()
    }
  })

  it("o papel vem da empresa ativa, não do cargo global", () => {
    // `tipo` global de gestor de eventos, mas papel de solicitante nesta empresa.
    const s = { user: { id: "u-1", papel: "solicitante", tipo: "gestor_eventos" }, expires: "" } as unknown as Session
    expect(recorteDoGestorDeEventos(s)).toBeNull()
  })
})
