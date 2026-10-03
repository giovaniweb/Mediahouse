import { describe, it, expect } from "vitest"
import { erroDaResposta, erroDeEnvio, ENVIO_INCERTO, INDISPONIVEL, SEM_CONEXAO } from "@/lib/erro-envio-publico"

const resposta = (status: number, corpo?: string) => new Response(corpo ?? null, { status })

describe("mensagem de erro dos formulários públicos", () => {
  it("500 sem corpo não vira texto técnico, e avisa que o envio pode ter chegado", async () => {
    expect(await erroDaResposta(resposta(500))).toBe(ENVIO_INCERTO)
    expect(await erroDaResposta(resposta(502, "<html>Bad gateway</html>"))).toBe(ENVIO_INCERTO)
  })

  it("503 é recusa antes de gravar: mostra a frase do servidor, sem o aviso de duplicidade", async () => {
    const msg = "Não foi possível receber agora. Tente de novo em alguns minutos."
    expect(await erroDaResposta(resposta(503, JSON.stringify({ error: msg })))).toBe(msg)
    expect(await erroDaResposta(resposta(503))).toBe(INDISPONIVEL)
    expect(await erroDaResposta(resposta(503, "<html>Service Unavailable</html>"))).toBe(INDISPONIVEL)
  })

  it("429 mostra a frase do servidor", async () => {
    expect(await erroDaResposta(resposta(429, JSON.stringify({ error: "Muitos envios em pouco tempo." })))).toBe("Muitos envios em pouco tempo.")
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
