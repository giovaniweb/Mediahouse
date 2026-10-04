import { describe, it, expect, vi } from "vitest"
import { salvarOrdem } from "@/lib/kanban-order"

describe("persistência da ordem", () => {
  it("envia as posições e só confirma respostas bem sucedidas", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    await salvarOrdem(["a", "b"], request)
    expect(request.mock.calls.map(c => JSON.parse(c[1]?.body as string))).toEqual([{ posicaoKanban: 0 }, { posicaoKanban: 1 }])
  })
  it.each([403, 500])("não oculta falha HTTP %i", async status => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(new Response(null, { status }))
    await expect(salvarOrdem(["a", "b"], request)).rejects.toThrow("Algumas posições")
  })
  it("aguarda as outras gravações mesmo quando a rede falha", async () => {
    let terminar!: (value: Response) => void
    const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(() => new Promise(resolve => { terminar = resolve }))
    let settled = false
    const result = salvarOrdem(["a", "b"], request).catch(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    terminar(new Response(null, { status: 200 }))
    await result
    expect(settled).toBe(true)
  })
})
