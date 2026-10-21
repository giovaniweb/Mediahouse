import { describe, expect, it } from "vitest"
import { fezAPeca, podeAprovarEntrega } from "@/lib/quem-aprova"
import { segundosDe, timecode } from "@/components/aprovacao/Momentos"
import { rotuloDoTipo } from "@/lib/tipos-demanda"

// Quem aprova a entrega por dentro: quem pediu, a social dona do pedido, gestor
// e admin. Quem fez a peça vê, mas não aprova a própria entrega.
const card = {
  solicitanteId: "sol",
  socialId: "social",
  responsavelId: null,
  responsaveis: [{ usuario: { id: "resp" } }],
  editor: { usuarioId: "editor" },
  designer: null,
  videomaker: { usuarioId: "vm" },
}

describe("quem aprova a entrega", () => {
  it("quem pediu e a social dona aprovam", () => {
    expect(podeAprovarEntrega({ usuarioId: "sol", gestor: false }, card)).toBe(true)
    expect(podeAprovarEntrega({ usuarioId: "social", gestor: false }, card)).toBe(true)
  })

  it("gestor e admin aprovam; um membro qualquer não", () => {
    expect(podeAprovarEntrega({ usuarioId: "chefe", gestor: true }, card)).toBe(true)
    expect(podeAprovarEntrega({ usuarioId: "outro", gestor: false }, card)).toBe(false)
  })

  it("quem fez a peça não aprova — nem sendo gestor", () => {
    for (const id of ["editor", "vm", "resp"]) {
      expect(fezAPeca(id, card)).toBe(true)
      expect(podeAprovarEntrega({ usuarioId: id, gestor: true }, card)).toBe(false)
    }
    expect(podeAprovarEntrega({ usuarioId: "des", gestor: false }, { ...card, solicitanteId: "des", designer: { usuarioId: "des" } })).toBe(false)
  })
})

describe("o momento do vídeo no texto do ajuste", () => {
  it("vai e volta entre segundos e [m:ss]", () => {
    expect(timecode(67)).toBe("1:07")
    expect(segundosDe("1:07")).toBe(67)
    expect(segundosDe("1:02:07")).toBe(3727)
  })
})

describe("o tipo como o cliente lê", () => {
  it("rótulo da semente, 'outro' some, desconhecido sai legível", () => {
    expect(rotuloDoTipo("reels")).toBe("Reels / Stories")
    expect(rotuloDoTipo("institucional")).toBe("Institucional")
    expect(rotuloDoTipo("outro")).toBeNull()
    expect(rotuloDoTipo("video_de_teste")).toBe("Video de teste")
  })
})
