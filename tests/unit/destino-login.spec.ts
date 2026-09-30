import { describe, it, expect } from "vitest"
import { destinoDoLogin } from "@/lib/destino-login"

// O login volta para o link de onde a pessoa veio (30/09/2026). O que não pode
// passar: qualquer destino fora do próprio NuFlow — seria um redirecionamento
// aberto logo depois de a pessoa digitar a senha.
describe("destino depois do login", () => {
  it("devolve caminho do próprio NuFlow com a busca", () => {
    expect(destinoDoLogin("/cutflow/conectar?pedido=abc.def")).toBe("/cutflow/conectar?pedido=abc.def")
    expect(destinoDoLogin("/jobs/cmg123")).toBe("/jobs/cmg123")
  })

  it("recusa outro site, esquema, barra dupla, barra invertida e controle", () => {
    for (const ruim of [
      "https://golpe.com/x", "//golpe.com", "/\\golpe.com", "javascript:alert(1)", "http:/golpe.com",
      "/x\nSet-Cookie: a", "\\\\golpe.com", "golpe.com", "",
    ]) expect(destinoDoLogin(ruim), ruim).toBe("/dashboard")
  })

  it("recusa tipo errado, tamanho absurdo, o próprio login e rota de API", () => {
    for (const ruim of [null, undefined, 42, {}, "/" + "a".repeat(3000), "/login?callbackUrl=/x", "/api/cutflow/sessao"]) {
      expect(destinoDoLogin(ruim as unknown), String(ruim).slice(0, 20)).toBe("/dashboard")
    }
  })
})
