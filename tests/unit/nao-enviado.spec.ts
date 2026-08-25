import { describe, it, expect } from "vitest"
import { naoEnviadoAoCliente } from "@/lib/growth-kanban"

// A marca que substituiu a trava. Ela não recusa nada — só distingue, no
// quadro, o card que foi enviado ao cliente do que só foi arrastado até lá.

describe("naoEnviadoAoCliente", () => {
  it("marca a peça parada em aprovação sem link do cliente", () => {
    expect(naoEnviadoAoCliente({ statusInterno: "revisao_pendente", tipoVideo: "post", linkCliente: null })).toBe(true)
    expect(naoEnviadoAoCliente({ statusInterno: "edicao_finalizada", tipoVideo: "carrossel", linkCliente: "" })).toBe(true)
  })

  it("não marca quem foi enviado de verdade", () => {
    expect(naoEnviadoAoCliente({
      statusInterno: "revisao_pendente", tipoVideo: "post",
      linkCliente: "https://nuflow.space/aprovar/abc",
    })).toBe(false)
  })

  it("não marca fora da coluna de aprovação", () => {
    for (const status of ["editando", "fila_edicao", "aprovado", "postado", "entregue_cliente"]) {
      expect(naoEnviadoAoCliente({ statusInterno: status, tipoVideo: "post", linkCliente: null }), status).toBe(false)
    }
  })

  it("não marca tipo que nunca gera link de aprovação", () => {
    // Campanha de e-mail e landing page não passam por link de cliente. Marcar
    // todas seria marcar todo mundo — e marcar todo mundo é não marcar ninguém.
    for (const tipo of ["email_marketing", "landing_page", "administrativo", "design", "apresentacao"]) {
      expect(naoEnviadoAoCliente({ statusInterno: "revisao_pendente", tipoVideo: tipo, linkCliente: null }), tipo).toBe(false)
    }
  })

  it("aguenta campo faltando sem quebrar o card", () => {
    expect(naoEnviadoAoCliente({})).toBe(false)
    expect(naoEnviadoAoCliente({ statusInterno: null, tipoVideo: null, linkCliente: null })).toBe(false)
  })
})

// ── A trava não pode voltar sem alguém decidir ───────────────────────────────
//
// Estático, como os auditores do projeto: se a regra que exigia a arte for
// reintroduzida na rota de status, este teste cai. Ela foi retirada por medição
// (o cliente já está protegido, e a trava caía sobre o caminho normal), não por
// esquecimento — voltar é uma decisão, não um acidente de merge.
describe("a rota de status não exige mais a arte para mover", () => {
  it("não há recusa por falta de arte final", async () => {
    const { readFileSync } = await import("node:fs")
    const rota = readFileSync("src/app/api/demandas/[id]/status/route.ts", "utf8")
    expect(rota).not.toContain("arteFinal")
    expect(rota).not.toContain("entregaPecaVisual")
  })
})
