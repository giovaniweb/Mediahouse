import { describe, expect, it } from "vitest"
import { acrescentarCidades, atendeCidade, chaveCidade, listaDeCidades, textoDasCidades, todasAsCidades } from "@/lib/cidades-videomaker"
import { telefoneCompleto } from "@/lib/whatsapp-identidade"
// O script de juntar é .mjs (roda fora da aplicação) e repete as duas regras:
// os dois lados precisam concordar.
import { chaveCidade as chaveDoScript, juntarCidades, telefoneNormalizado } from "../../scripts/lib/juntar-videomakers.mjs"

// O caso real: o Kevew Felix se cadastrou três vezes, uma por cidade.
const kevew = { cidade: "ITAPERUNA, RJ", estado: "RJ", cidadesAtendidas: [] as string[] }

describe("cidades do videomaker", () => {
  it("compara sem acento, maiúscula, espaço nem a UF no fim", () => {
    expect(chaveCidade("ITAPERUNA, RJ")).toBe("itaperuna")
    expect(chaveCidade(" Guarapari ")).toBe("guarapari")
    expect(chaveCidade("São Paulo / SP")).toBe("sao paulo")
    expect(chaveCidade("Ribeirão  Preto")).toBe("ribeirao preto")
    // Hífen de nome não é UF.
    expect(chaveCidade("Embu-Guaçu")).toBe("embu-guacu")
  })

  it("monta a lista sem repetir, sem a base e sem vazio", () => {
    expect(listaDeCidades(["Campinas", "campinas", " ", "São Paulo", "Ribeirão Preto"], "Sao Paulo")).toEqual(["Campinas", "Ribeirão Preto"])
    expect(listaDeCidades("Campinas, Sorocaba;\nJundiaí")).toEqual(["Campinas", "Sorocaba", "Jundiaí"])
    expect(listaDeCidades(null)).toEqual([])
    expect(listaDeCidades(Array.from({ length: 40 }, (_, i) => `Cidade ${i}`))).toHaveLength(30)
  })

  it("acrescenta a cidade nova e ignora a que já é a base", () => {
    expect(acrescentarCidades(kevew, ["Guarapari ", "Itaperuna"])).toEqual(["Guarapari"])
    expect(acrescentarCidades({ ...kevew, cidadesAtendidas: ["Guarapari"] }, ["guarapari", "Campos"])).toEqual(["Guarapari", "Campos"])
  })

  it("atende a base e as atendidas; o texto do card mostra as duas", () => {
    const vm = { ...kevew, cidadesAtendidas: ["Guarapari"] }
    expect(atendeCidade(vm, "itaperuna")).toBe(true)
    expect(atendeCidade(vm, "Guarapari")).toBe(true)
    expect(atendeCidade(vm, "Vitória")).toBe(false)
    expect(todasAsCidades(vm)).toEqual(["ITAPERUNA, RJ", "Guarapari"])
    expect(textoDasCidades(vm)).toBe("ITAPERUNA, RJ · atende Guarapari")
    expect(textoDasCidades({ cidade: null, cidadesAtendidas: ["Campinas"] })).toBe("Atende Campinas")
    expect(textoDasCidades({ cidade: "Santos" })).toBe("Santos")
  })
})

describe("o script de juntar concorda com a aplicação", () => {
  it.each(["22998365944", "(22) 99836-5944", "+55 22 99836-5944", "5522998365944", "2233334444", "123"])("telefone %s", t => {
    expect(telefoneNormalizado(t)).toBe(telefoneCompleto(t))
  })

  it("mesma chave de cidade", () => {
    for (const c of ["ITAPERUNA, RJ", "São Paulo / SP", "Embu-Guaçu", " Guarapari "]) expect(chaveDoScript(c)).toBe(chaveCidade(c))
  })

  it("junta as cidades dos três cadastros do Kevew na lista do que fica", () => {
    const outros = [{ cidade: "Itaperuna", cidadesAtendidas: [] }, { cidade: "Guarapari ", cidadesAtendidas: ["Vitória"] }]
    expect(juntarCidades(kevew, outros)).toEqual(["Guarapari", "Vitória"])
  })
})
