import { describe, expect, it } from "vitest"
import { COLINHA_ENTREGA_DE_EQUIPAMENTO, colinhaDaGravacao, materiaisDaGravacao, preencherColinha } from "@/lib/kit-videomaker"

const kit = [
  { id: "1", titulo: "Guia de captação", tipo: "guia", url: "/api/midia/org/o/kit/1/a.pdf", tipoGravacao: "entrega_equipamento", ordem: 0 },
  { id: "2", titulo: "Referência: depoimento", tipo: "referencia", url: "https://drive.example/d", tipoGravacao: null, ordem: 1 },
  { id: "3", titulo: "Colinha geral", tipo: "colinha", texto: "Geral {cliente}", tipoGravacao: null },
  { id: "4", titulo: "Colinha da entrega", tipo: "colinha", texto: "Entrega {cliente}", tipoGravacao: "entrega_equipamento" },
]

describe("kit do videomaker", () => {
  it("vale o do tipo da gravação e o que é para todos", () => {
    expect(materiaisDaGravacao(kit, "entrega_equipamento").map((m) => m.id).sort()).toEqual(["1", "2", "3", "4"])
    expect(materiaisDaGravacao(kit, "demonstracao").map((m) => m.id).sort()).toEqual(["2", "3"])
  })
  it("a colinha do tipo vence a geral", () => {
    expect(colinhaDaGravacao(kit, "entrega_equipamento")?.id).toBe("4")
    expect(colinhaDaGravacao(kit, "evento")?.id).toBe("3")
    expect(colinhaDaGravacao(kit.slice(0, 2), "evento")).toBeNull()
  })
  it("a colinha da entrega de equipamento sai preenchida com os dados da gravação", () => {
    const t = preencherColinha(COLINHA_ENTREGA_DE_EQUIPAMENTO, { cliente: "Clínica Cristal", hora: "13:00", endereco: "Alameda 1700", link: "https://nuflow.space/convite/x" })
    expect(t.startsWith("🎬 Colinha de hoje — Clínica Cristal, 13:00\nAlameda 1700")).toBe(true)
    expect(t).toContain("1 hype (até 40s) + 1 depoimento (até 60s)")
    expect(t.endsWith("https://nuflow.space/convite/x")).toBe(true)
    expect(t).not.toMatch(/\{(cliente|hora|endereco|link)\}/)
  })
})
