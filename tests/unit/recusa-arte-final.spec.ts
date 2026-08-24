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
