import { describe, it, expect } from "vitest"
import { erroDeCorpo } from "@/lib/erro-cliente"

// A costura entre a rota de status e o kanban de Growth.
//
// Quando o PATCH recusa por falta de arte, o board NÃO mostra o toast: ele abre
// o passo de anexar. O que ele lê para decidir isso é `campos.arteFinal`. Se
// alguém trocar o `erroDeCampo` por um `NextResponse.json({ error })` solto, a
// recusa continua correta e o board volta a só reclamar — em silêncio, sem
// quebrar nada. Este teste é o alarme desse caso.
const RECUSA_SEM_ARTE = {
  error: "Anexe a arte final antes de mandar para aprovação — sem peça, o cliente recebe um link vazio.",
  campos: { arteFinal: "Anexe a arte final antes de mandar para aprovação — sem peça, o cliente recebe um link vazio." },
}

describe("recusa por falta de arte final", () => {
  it("chega ao cliente com o campo que o kanban usa para abrir o envio", () => {
    const erro = erroDeCorpo(RECUSA_SEM_ARTE, 400)
    expect(erro.campos.arteFinal).toBeTruthy()
    expect(erro.status).toBe(400)
  })

  it("a frase continua exibível — quem não conhece a regra ainda mostra o texto", () => {
    const erro = erroDeCorpo(RECUSA_SEM_ARTE, 400)
    expect(erro.message).toContain("Anexe a arte final")
    expect(erro.message).not.toContain("Error:")
  })

  it("outras recusas do mesmo endpoint NÃO abrem o envio — caem no toast", () => {
    const brutos = erroDeCorpo({ error: "Link dos brutos obrigatório para avançar." }, 400)
    expect(brutos.campos.arteFinal).toBeUndefined()
    expect(brutos.message).toContain("brutos")

    const invalido = erroDeCorpo({ error: 'Status "xpto" inválido' }, 400)
    expect(invalido.campos.arteFinal).toBeUndefined()
  })

  it("corpo vazio ou HTML de gateway não vira abertura de modal por acidente", () => {
    expect(erroDeCorpo(null, 502, "<html>Bad Gateway</html>").campos.arteFinal).toBeUndefined()
    expect(erroDeCorpo(null, 500, "").campos.arteFinal).toBeUndefined()
  })
})

// ── O que os testes acima NÃO cobrem ─────────────────────────────────────────
//
// Eles alimentam `erroDeCorpo` com um literal escrito aqui. Isso prova que o
// PARSER lê o campo — mas não prova que a ROTA o envia. Verificado: trocando o
// `erroDeCampo` da rota por um `NextResponse.json({ error })` solto, os quatro
// passam do mesmo jeito, e o kanban volta a só reclamar em silêncio.
//
// Este teste fecha a ponta que faltava: olha o código da rota. É estático como
// os auditores do projeto, e pelo mesmo motivo — a alternativa seria montar
// sessão, organização e demanda para exercitar um `if`.
describe("a rota realmente manda o campo que o kanban lê", () => {
  it("recusa a falta de arte com erroDeCampo(\"arteFinal\")", async () => {
    const { readFileSync } = await import("node:fs")
    const rota = readFileSync("src/app/api/demandas/[id]/status/route.ts", "utf8")

    // O bloco que recusa por falta de arte final.
    const bloco = rota.slice(rota.indexOf('demandaAtual.area === "design"'))
    const recusa = bloco.slice(0, bloco.indexOf("\n  }"))

    expect(recusa).toContain('erroDeCampo(')
    expect(recusa).toContain('"arteFinal"')
    // Um NextResponse.json solto aqui devolve a recusa certa e mata a abertura
    // do envio — o defeito é invisível em produção até alguém reclamar.
    expect(recusa).not.toContain("NextResponse.json(")
  })
})
