import { describe, it, expect } from "vitest"
import { alternar9oDigito } from "@/lib/whatsapp"

// Medido em produção antes desta correção, em 30 dias:
//   13 dígitos (com o 9): 168 entregues, 706 falharam — 19% de sucesso
//   12 dígitos (sem o 9):  42 entregues,  10 falharam — 81% de sucesso
// Contas antigas de WhatsApp têm o JID sem o 9 mesmo com o número comercial
// tendo. Sem tentar o formato alternativo, o aviso simplesmente não chegava.

describe("alternar9oDigito", () => {
  it("tira o 9 de celular com 13 dígitos", () => {
    // É o número que mais falhou em produção: 151 falhas.
    expect(alternar9oDigito("5531992271043")).toBe("553192271043")
  })

  it("põe o 9 em número de 12 dígitos", () => {
    expect(alternar9oDigito("553192271043")).toBe("5531992271043")
  })

  it("ida e volta devolve o número original", () => {
    const original = "5511961999928"
    const alt = alternar9oDigito(original)
    expect(alt).not.toBeNull()
    expect(alternar9oDigito(alt!)).toBe(original)
  })

  it("ignora número que não é brasileiro", () => {
    expect(alternar9oDigito("14155552671")).toBeNull()
    expect(alternar9oDigito("351912345678")).toBeNull()
  })

  it("não mexe em 13 dígitos cujo primeiro dígito do celular não é 9", () => {
    // 55 + 31 + 8 dígitos começando em 8 → já é o formato curto com algo a mais;
    // sem regra clara, é melhor não inventar um alternativo.
    expect(alternar9oDigito("5531812345678")).toBeNull()
  })

  it("ignora tamanhos que não são de celular", () => {
    expect(alternar9oDigito("55")).toBeNull()
    expect(alternar9oDigito("5531")).toBeNull()
    expect(alternar9oDigito("553112345")).toBeNull()
  })

  it("ignora entrada vazia", () => {
    expect(alternar9oDigito("")).toBeNull()
  })
})
