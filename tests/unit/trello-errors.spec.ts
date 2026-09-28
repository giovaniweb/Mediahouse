import { afterEach, describe, expect, it, vi } from "vitest"
import { getBoardLists } from "@/lib/trello"

afterEach(() => vi.unstubAllGlobals())
const cfg = { boardId: "boardAAAA", apiKey: "chave-sintetica", token: "token-sintetico" }
describe("erros Trello sem dados do provedor", () => {
  it("não propaga corpo de erro HTTP", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("token-sintetico", { status: 401 })))
    await expect(getBoardLists(cfg)).rejects.toThrow("Falha na conexão Trello (HTTP 401)")
  })
  it("não propaga URL/credenciais de falha de rede", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("https://api.trello.com?token=token-sintetico")))
    await expect(getBoardLists(cfg)).rejects.toThrow("Não foi possível acessar o Trello")
  })
  it("não propaga fragmento de resposta inválida", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("token-sintetico", { status: 200 })))
    await expect(getBoardLists(cfg)).rejects.toThrow("Resposta inválida do Trello")
  })
})
