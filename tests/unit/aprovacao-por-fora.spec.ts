import { describe, it, expect } from "vitest"
import {
  MOTIVOS_APROVACAO_POR_FORA, motivoAceitavel, motivoDe, descreverMotivo,
} from "@/lib/aprovacao-por-fora"

describe("motivoAceitavel", () => {
  it("aceita os motivos do catálogo que não pedem detalhe", () => {
    for (const m of MOTIVOS_APROVACAO_POR_FORA.filter((x) => !x.exigeDetalhe)) {
      expect(motivoAceitavel(m.valor), m.valor).toBe(true)
    }
  })

  it('"outro" sem explicação não passa — seria a caixa de "continuar" de novo', () => {
    expect(motivoAceitavel("outro")).toBe(false)
    expect(motivoAceitavel("outro", "")).toBe(false)
    expect(motivoAceitavel("outro", "  ")).toBe(false)
    expect(motivoAceitavel("outro", "ok")).toBe(false)
    expect(motivoAceitavel("outro", "cliente vê no Drive compartilhado")).toBe(true)
  })

  it("motivo inventado não dispensa a arte", () => {
    // Default oposto ao de entregaPecaVisual, e de propósito: lá o rigor demais
    // prendia trabalho; aqui a frouxidão devolve o card que mente.
    expect(motivoAceitavel("porque_sim")).toBe(false)
    expect(motivoAceitavel("")).toBe(false)
    expect(motivoAceitavel(null)).toBe(false)
    expect(motivoAceitavel(undefined)).toBe(false)
    expect(motivoAceitavel(true)).toBe(false)
    expect(motivoAceitavel({ valor: "aprovado_whatsapp" })).toBe(false)
  })
})

describe("descreverMotivo", () => {
  it("vira frase legível para o histórico", () => {
    expect(descreverMotivo("aprovado_whatsapp")).toBe(
      "Aprovação por fora — O cliente já aprovou por WhatsApp"
    )
  })

  it("carrega o detalhe quando existe", () => {
    expect(descreverMotivo("outro", "cliente vê no Drive")).toBe(
      "Aprovação por fora — Outro motivo: cliente vê no Drive"
    )
  })

  it("não quebra com motivo fora do catálogo", () => {
    // A rota só chama isto depois de motivoAceitavel, mas a função não deve
    // depender disso para não devolver "undefined" dentro do histórico.
    expect(descreverMotivo("inexistente")).toContain("Aprovação por fora")
    expect(descreverMotivo("inexistente")).not.toContain("undefined")
  })
})

describe("catálogo", () => {
  it("todo motivo tem valor e label, e os valores são únicos", () => {
    const valores = MOTIVOS_APROVACAO_POR_FORA.map((m) => m.valor)
    expect(new Set(valores).size).toBe(valores.length)
    for (const m of MOTIVOS_APROVACAO_POR_FORA) {
      expect(m.valor.length, m.valor).toBeGreaterThan(0)
      expect(m.label.length, m.valor).toBeGreaterThan(0)
      expect(motivoDe(m.valor)).toBe(m)
    }
  })

  it("existe pelo menos uma opção que não exige detalhe e uma que exige", () => {
    expect(MOTIVOS_APROVACAO_POR_FORA.some((m) => !m.exigeDetalhe)).toBe(true)
    expect(MOTIVOS_APROVACAO_POR_FORA.some((m) => m.exigeDetalhe)).toBe(true)
  })
})

// ── O que os testes acima NÃO cobrem ─────────────────────────────────────────
//
// Eles exercitam as funções puras. Nada aí prova que a ROTA as consulta — se
// alguém remover o `!porFora` da condição, o motivo continuaria sendo aceito,
// gravado no histórico, e a demanda continuaria travada. A tela ofereceria uma
// saída que não sai. Mesma lição do teste de `recusa-arte-final`: literal em
// teste não prova comportamento de rota.
//
// Estático como os auditores do projeto, e pelo mesmo motivo — a alternativa
// seria montar sessão, organização e demanda para exercitar um `if`.
describe("a rota realmente honra o motivo", () => {
  it("a trava da arte cede quando há motivo aceitável", async () => {
    const { readFileSync } = await import("node:fs")
    const rota = readFileSync("src/app/api/demandas/[id]/status/route.ts", "utf8")

    // O motivo é validado pelo catálogo, não por um `if (body.algumaCoisa)`.
    expect(rota).toContain("motivoAceitavel(body.aprovacaoPorFora")

    // E a condição que recusa precisa considerá-lo.
    const bloco = rota.slice(rota.indexOf('demandaAtual.area === "design"'))
    const condicao = bloco.slice(0, bloco.indexOf(") {"))
    expect(condicao).toContain("!porFora")
  })

  it("o motivo é gravado no histórico — sem rastro, a exceção é invisível", async () => {
    const { readFileSync } = await import("node:fs")
    const rota = readFileSync("src/app/api/demandas/[id]/status/route.ts", "utf8")

    const historico = rota.slice(rota.indexOf("prisma.historicoStatus.create("))
    const bloco = historico.slice(0, historico.indexOf("}),"))
    expect(bloco).toContain("porFora")
  })
})
