import { describe, it, expect } from "vitest"
import { extrairCopy } from "@/lib/copy-criativo"

// `detalhesEntrega` é chaveado pelo LABEL do campo, então descobrir qual valor é
// a copy do criativo é adivinhar pela chave. A adivinhação ingênua
// (`/copy|legenda|caption/i`) errava, e o erro chegava na tela do cliente.

describe("extrairCopy", () => {
  it("devolve a copy quando a chave é o texto de verdade", () => {
    expect(extrairCopy({ "Copy / legenda": "Conheça os 5 mitos" })).toBe("Conheça os 5 mitos")
    expect(extrairCopy({ "Texto da Copy (cole aqui)": "Slide 1: ..." })).toBe("Slide 1: ...")
  })

  it("ignora a pergunta sobre a copy — o bug que mostrava 'Sim' para o cliente", () => {
    // Carrossel criado antes da refatoração: a única chave que casava com
    // /copy/i era a pergunta booleana, e a tela de aprovação exibia "Sim".
    expect(extrairCopy({ "Copy pronta?": "Sim" }, "Carrossel de 5 slides")).toBe("Carrossel de 5 slides")
    expect(extrairCopy({ "Precisa criar copy?": "Não" }, "Descrição")).toBe("Descrição")
  })

  it("ignora o seletor de status e acha a copy real, mesmo vindo depois", () => {
    const detalhes = {
      "Status da Copy": "Pronta",
      "Texto da Copy (cole aqui)": "O texto que o cliente precisa aprovar",
    }
    expect(extrairCopy(detalhes)).toBe("O texto que o cliente precisa aprovar")
  })

  it("cai na descrição quando não há copy nenhuma", () => {
    expect(extrairCopy({ "Quantidade de slides": "5" }, "Objetivo do carrossel")).toBe("Objetivo do carrossel")
    expect(extrairCopy(null, "Só a descrição")).toBe("Só a descrição")
    expect(extrairCopy(undefined, null)).toBe("")
  })

  it("ignora valor vazio e valor que não é texto", () => {
    expect(extrairCopy({ "Copy": "   ", "Legenda": "a que vale" })).toBe("a que vale")
    expect(extrairCopy({ "Copy": 42, "Legenda": "a que vale" })).toBe("a que vale")
  })
})
