import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { apresentarRelatorio, criarRelatorioV1, relatorioV1Schema, lerRespostaRelatorio } from "@/lib/relatorio-contrato"
import { ConteudoRelatorio } from "@/components/relatorios/ConteudoRelatorio"
const meta = { tipo: "semanal" as const, periodo: "21/09/2026", origem: "agente" as const, area: "nao_separada" as const, geradoEm: "2026-09-21T12:00:00.000Z", inicio: null, fim: null }
describe("contrato de relatórios", () => {
  it("lê a fixture semanal no formato legado sem fabricar indicadores", () => {
    const r = apresentarRelatorio({ analise: "Equipe sintética: revisar as entregas da semana.", auto: true })
    expect(r).toMatchObject({ estado: "texto", origem: "legado" }); expect(r.dados).toBeUndefined()
  })
  it("mapeia estrutura parcial conhecida sem inventar zeros ou expor campos desconhecidos", () => {
    const r = apresentarRelatorio({ resumo_executivo: "Revisão", kpis: [{ nome: "Entregas", valor: "não medido" }], segredo: "oculto" })
    expect(r.dados).toEqual({ resumo_executivo: "Revisão", kpis: [{ nome: "Entregas", valor: "não medido" }] })
  })
  it.each([null, [], 4, "texto solto", {}, { titulo: "Só título" }, { resumo_executivo: {} }, { kpis: [{}] }, { saude_geral_sistema: 200 }, { versao: 2, analise: "Não interpretar versão futura como legado" }])("rejeita conteúdo inválido %j", valor => {
    expect(apresentarRelatorio(valor).estado).toBe("invalido")
  })
  it("escrita inválida conserva o snapshot e possui estado de erro legível", () => {
    const snapshot = { demandasCriadas: 3, concluidas: 1, emAndamento: 2, custoTotal: 10, custoPorVideo: 3.33, tempoMedioDias: 1, alertasAtivos: 0 }
    const r = criarRelatorioV1({ kpis: "errado" }, meta, snapshot)
    expect(relatorioV1Schema.safeParse(r).success).toBe(true)
    expect(r.snapshot).toEqual(snapshot); expect(apresentarRelatorio(r).estado).toBe("invalido")
  })
  it("distingue texto de JSON inválido sem aceitar nulo como análise", () => {
    for (const resposta of ["null", "[]", "42", '{"kpis":', '```json\n{"kpis":\n```']) expect(apresentarRelatorio(lerRespostaRelatorio(resposta)).estado).toBe("invalido")
    expect(apresentarRelatorio(lerRespostaRelatorio("Análise textual preservada")).estado).toBe("texto")
    expect(apresentarRelatorio(lerRespostaRelatorio('```json\n{"resumo_executivo":"Relato"}\n```')).estado).toBe("estruturado")
  })
  it("novo escritor e leitor compartilham contrato textual e estruturado", () => {
    for (const valor of [{ analise: "Relato" }, { resumo_executivo: "Relato", kpis: [{ nome: "Entregas", valor: 2 }] }]) {
      expect(apresentarRelatorio(criarRelatorioV1(valor,meta)).origem).toBe("agente")
      expect(apresentarRelatorio(criarRelatorioV1(valor,meta)).estado).not.toBe("invalido")
    }
  })
  it("HTML permanece texto escapado e a referência aparece inclusive no erro", () => {
    const html = renderToStaticMarkup(createElement(ConteudoRelatorio,{ apresentacao: apresentarRelatorio({ analise: '<script>alert(1)</script>' }), referencia: "rel-sintetico" }))
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;")
    const erro = renderToStaticMarkup(createElement(ConteudoRelatorio,{ apresentacao: apresentarRelatorio(null), referencia: "rel-quebrado" }))
    expect(erro).toContain('role="alert"'); expect(erro).toContain("rel-quebrado")
  })
})
