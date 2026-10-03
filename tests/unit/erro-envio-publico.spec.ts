import { describe, it, expect } from "vitest"
import { erroDaResposta, erroDeEnvio, ENVIO_INCERTO, SEM_CONEXAO } from "@/lib/erro-envio-publico"

const resposta = (status: number, corpo?: string) => new Response(corpo ?? null, { status })

describe("mensagem de erro dos formulários públicos", () => {
  it("500 sem corpo não vira texto técnico, e avisa que o envio pode ter chegado", async () => {
    expect(await erroDaResposta(resposta(500))).toBe(ENVIO_INCERTO)
    expect(await erroDaResposta(resposta(502, "<html>Bad gateway</html>"))).toBe(ENVIO_INCERTO)
  })

  it("validação com texto ou com campos vira frase legível", async () => {
    expect(await erroDaResposta(resposta(400, JSON.stringify({ error: "Telefone inválido" })))).toBe("Telefone inválido")
    expect(await erroDaResposta(resposta(400, JSON.stringify({ error: { email: ["E-mail inválido"], titulo: ["Curto demais"] } })))).toBe("E-mail inválido, Curto demais")
  })

  it("resposta de erro vazia ou estranha cai numa frase segura", async () => {
    for (const corpo of ["", "{}", "não é json", JSON.stringify({ error: {} }), JSON.stringify({ error: 42 })]) {
      expect(await erroDaResposta(resposta(400, corpo))).toBe("Não foi possível enviar. Confira os campos e tente de novo.")
    }
  })

  it("fetch sem resposta é falta de conexão", () => {
    expect(erroDeEnvio(new TypeError("Failed to fetch"))).toBe(SEM_CONEXAO)
    expect(erroDeEnvio(new Error("Telefone inválido"))).toBe("Telefone inválido")
    expect(erroDeEnvio("??")).toBe(ENVIO_INCERTO)
  })
})
