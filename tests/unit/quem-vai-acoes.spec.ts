import { describe, expect, it } from "vitest"
import { acoesDoQuemVai, type ConviteDaLinha } from "@/lib/ficha-do-job"

// A linha "Quem vai" (11/11/2026): o que ela oferece em cada momento.
const agora = new Date("2026-11-11T15:00:00Z")
const convite = (status: string, criadoHaH: number, venceEmH: number, vm = "vm1"): ConviteDaLinha => ({
  status, videomaker: { id: vm },
  createdAt: new Date(agora.getTime() - criadoHaH * 3600_000).toISOString(),
  expiresAt: new Date(agora.getTime() + venceEmH * 3600_000).toISOString(),
})

describe("acoesDoQuemVai", () => {
  it("sem ninguém escalado: só Escalar", () => {
    expect(acoesDoQuemVai({ statusInterno: "planejamento", videomakerId: null, agora })).toEqual({ trocar: "Escalar", reenviar: false, avisar: false, convite: null })
  })
  it("convite pendente no prazo: Trocar e Reenviar, com o tempo que falta", () => {
    const r = acoesDoQuemVai({ statusInterno: "videomaker_notificado", videomakerId: "vm1", convites: [convite("pendente", 2, 46)], agora })
    expect(r).toEqual({ trocar: "Trocar", reenviar: true, avisar: false, convite: "Convite enviado há 2h · vence em 46h" })
  })
  it("convite vencido diz que venceu e oferece reenviar", () => {
    const r = acoesDoQuemVai({ statusInterno: "videomaker_notificado", videomakerId: "vm1", convites: [convite("pendente", 50, -2)], agora })
    expect(r.reenviar).toBe(true)
    expect(r.convite).toBe("Convite vencido, sem resposta")
  })
  it("o convite de outro videomaker não conta para o atual", () => {
    const r = acoesDoQuemVai({ statusInterno: "videomaker_notificado", videomakerId: "vm2", convites: [convite("aceito", 5, 40, "vm1")], agora })
    expect(r).toMatchObject({ reenviar: true, convite: null })
  })
  it("confirmado e antes de gravar: Trocar e Avisar mudança, sem reenviar", () => {
    for (const statusInterno of ["videomaker_aceitou", "captacao_agendada"]) {
      const r = acoesDoQuemVai({ statusInterno, videomakerId: "vm1", convites: [convite("aceito", 5, 40)], agora })
      expect(r).toEqual({ trocar: "Trocar", reenviar: false, avisar: true, convite: "Aceitou pelo link do convite" })
    }
  })
  it("depois de gravar não há troca, reenvio nem aviso", () => {
    for (const statusInterno of ["captacao_realizada", "brutos_enviados", "editando", "aprovado", "entregue_cliente"]) {
      expect(acoesDoQuemVai({ statusInterno, videomakerId: "vm1", convites: [convite("aceito", 5, 40)], agora }))
        .toMatchObject({ trocar: null, reenviar: false, avisar: false })
    }
  })
})
