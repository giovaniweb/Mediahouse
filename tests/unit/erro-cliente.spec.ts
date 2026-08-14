import { describe, it, expect } from "vitest"
import { ErroApi, erroDeCorpo, mensagemDeErro } from "@/lib/erro-cliente"

function resposta(corpo: unknown, status = 400): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("mensagemDeErro", () => {
  it("nunca devolve o prefixo 'Error:' — o bug que aparecia no toast", () => {
    const msg = mensagemDeErro(new Error("Título deve ter pelo menos 3 caracteres."))
    expect(msg).toBe("Título deve ter pelo menos 3 caracteres.")
    expect(msg).not.toContain("Error:")
  })

  it("usa o padrão para valor sem mensagem útil", () => {
    expect(mensagemDeErro(null, "Falhou.")).toBe("Falhou.")
    expect(mensagemDeErro({}, "Falhou.")).toBe("Falhou.")
    expect(mensagemDeErro(new Error(""), "Falhou.")).toBe("Falhou.")
  })

  it("aceita string solta", () => {
    expect(mensagemDeErro("Sem conexão")).toBe("Sem conexão")
  })
})

describe("erroDaResposta", () => {
  it("lê o contrato { error, campos } e guarda o campo culpado", async () => {
    const { erroDaResposta } = await import("@/lib/erro-cliente")
    const erro = await erroDaResposta(
      resposta({ error: "O prazo não pode ser anterior a hoje.", campos: { dataLimite: "O prazo não pode ser anterior a hoje." } })
    )
    expect(erro).toBeInstanceOf(ErroApi)
    expect(erro.message).toBe("O prazo não pode ser anterior a hoje.")
    expect(erro.campos.dataLimite).toBeDefined()
    expect(erro.temCampos()).toBe(true)
  })

  it("corpo vazio não vira mensagem vazia", async () => {
    const { erroDaResposta } = await import("@/lib/erro-cliente")
    const erro = await erroDaResposta(new Response("", { status: 500 }), "Falhou.")
    expect(erro.message).toContain("Falhou.")
    expect(erro.status).toBe(500)
  })

  it("HTML de gateway não quebra a leitura", async () => {
    const { erroDaResposta } = await import("@/lib/erro-cliente")
    const erro = await erroDaResposta(new Response("<html>502 Bad Gateway</html>", { status: 502 }))
    expect(erro.message).toContain("502")
  })
})

describe("erroDeCorpo", () => {
  it("erro em formato antigo (objeto no lugar de string) não vira '[object Object]'", () => {
    // Era o que a API devolvia: { error: parsed.error.flatten() }.
    const erro = erroDeCorpo(
      { error: { formErrors: [], fieldErrors: { titulo: ["curto"] } }, campos: { titulo: "O título é curto." } },
      400
    )
    expect(erro.message).toBe("O título é curto.")
    expect(erro.message).not.toContain("[object Object]")
  })

  it("sem campos e sem error usa o padrão com o status", () => {
    const erro = erroDeCorpo({}, 418, "", "Falhou.")
    expect(erro.message).toBe("Falhou. (HTTP 418)")
    expect(erro.temCampos()).toBe(false)
  })

  it("ignora valores de campo que não são texto", () => {
    const erro = erroDeCorpo({ error: "x", campos: { a: "válido", b: 42 } }, 400)
    expect(erro.campos).toEqual({ a: "válido" })
  })
})
