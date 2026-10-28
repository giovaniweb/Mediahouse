import { describe, it, expect } from "vitest"
import { papelDe, nivelDe, perfilDe } from "@/lib/pessoas-ui"

// Editar e promover gravam só o `papel` da empresa; o `tipo` global fica com o
// valor antigo. A tabela lia o `tipo` e mostrava Nível e Acesso de antes da
// troca, embora a permissão já fosse a do papel novo.
describe("Nível e Acesso pelo papel da empresa", () => {
  it("usa o papel quando ele difere do tipo antigo", () => {
    const trocada = { tipo: "gestor", papel: "social", categoria: "interna", liderAudiovisual: false }
    expect(papelDe(trocada)).toBe("social")
    expect(nivelDe(trocada)).toBe("executor")
    expect(perfilDe(trocada)).toBe("executor")
  })

  it("solicitante promovido deixa de aparecer como solicitante", () => {
    const promovido = { tipo: "solicitante", papel: "gestor", categoria: "interna", liderAudiovisual: false }
    expect(nivelDe(promovido)).toBe("lider")
    expect(perfilDe(promovido)).toBe("gestor")
  })

  it("cai no tipo quando a resposta não traz o papel", () => {
    const semPapel = { tipo: "admin", categoria: "interna", liderAudiovisual: false }
    expect(papelDe(semPapel)).toBe("admin")
    expect(nivelDe(semPapel)).toBe("supervisor")
    expect(perfilDe(semPapel)).toBe("administrador")
  })

  it("líder audiovisual e externo continuam valendo por cima do papel", () => {
    expect(nivelDe({ tipo: "editor", papel: "editor", liderAudiovisual: true })).toBe("lider")
    expect(perfilDe({ tipo: "editor", papel: "videomaker", categoria: "externo", liderAudiovisual: false })).toBe("executor_ext")
  })
})
