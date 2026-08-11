import { describe, it, expect } from "vitest"
import { lerPlanilha, interpretarData, interpretarPrioridade } from "@/lib/planilha"

describe("lerPlanilha", () => {
  it("lê o que o Excel põe na área de transferência (separado por tab)", () => {
    const colado = "Título\tPrazo\tPrioridade\nVídeo institucional\t20/09/2026\tAlta\nReels do lançamento\t25/09/2026\tNormal"
    const r = lerPlanilha(colado)
    expect(r.erro).toBeUndefined()
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas[0].titulo).toBe("Vídeo institucional")
    expect(r.linhas[1].prazo).toBe("25/09/2026")
  })

  it("lê CSV com ponto e vírgula, que é o padrão do Excel em português", () => {
    const r = lerPlanilha("Titulo;Responsavel\nPost de agosto;Julie")
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].responsavel).toBe("Julie")
  })

  it("mantém junto o texto entre aspas que contém o separador", () => {
    const r = lerPlanilha('Titulo;Descricao\nCampanha;"Falar de preço, prazo e entrega"')
    expect(r.linhas[0].descricao).toBe("Falar de preço, prazo e entrega")
  })

  it("reconhece o cabeçalho sem depender de acento nem de caixa", () => {
    const r = lerPlanilha("TÍTULO;descricao\nA;B")
    expect(r.linhas[0].titulo).toBe("A")
    expect(r.linhas[0].descricao).toBe("B")
  })

  it("aponta as colunas que não soube usar, em vez de descartar em silêncio", () => {
    const r = lerPlanilha("Titulo;Custo estimado\nA;100")
    expect(r.colunasIgnoradas).toContain("Custo estimado")
  })

  it("recusa a planilha sem coluna de título, explicando o que renomear", () => {
    const r = lerPlanilha("Responsavel;Prazo\nJulie;20/09/2026")
    expect(r.erro).toMatch(/título/i)
    expect(r.linhas).toHaveLength(0)
  })

  it("ignora linhas totalmente vazias no meio da planilha", () => {
    const r = lerPlanilha("Titulo\nPrimeira\n\nSegunda")
    expect(r.linhas).toHaveLength(2)
  })

  it("guarda o número da linha para o erro apontar onde está o problema", () => {
    const r = lerPlanilha("Titulo\nA\nB")
    expect(r.linhas[0].linha).toBe(2)
    expect(r.linhas[1].linha).toBe(3)
  })
})

describe("interpretarData", () => {
  it("aceita o formato brasileiro", () => {
    expect(interpretarData("20/09/2026")?.toISOString().slice(0, 10)).toBe("2026-09-20")
  })

  it("aceita ano com dois dígitos", () => {
    expect(interpretarData("05/03/26")?.toISOString().slice(0, 10)).toBe("2026-03-05")
  })

  it("aceita o formato ISO", () => {
    expect(interpretarData("2026-12-01")?.toISOString().slice(0, 10)).toBe("2026-12-01")
  })

  it("devolve null no que não dá para ter certeza, em vez de chutar", () => {
    expect(interpretarData("semana que vem")).toBeNull()
    expect(interpretarData("")).toBeNull()
  })

  it("recusa ano implausível — é o bug do prazo no ano 0026", () => {
    expect(interpretarData("29/06/0026")).toBeNull()
    expect(interpretarData("0001-01-01")).toBeNull()
  })
})

describe("interpretarPrioridade", () => {
  it("entende as palavras que aparecem numa planilha real", () => {
    expect(interpretarPrioridade("Urgente")).toBe("urgente")
    expect(interpretarPrioridade("crítico")).toBe("urgente")
    expect(interpretarPrioridade("Alta")).toBe("alta")
    expect(interpretarPrioridade("")).toBe("normal")
    expect(interpretarPrioridade("qualquer coisa")).toBe("normal")
  })
})
