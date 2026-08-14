import { describe, it, expect, vi, afterEach } from "vitest"
import { checarRateLimit, limparRateLimit, ipDaRequisicao } from "@/lib/rate-limit"

afterEach(() => vi.useRealTimers())

describe("checarRateLimit", () => {
  it("libera até o limite e barra a partir dele", () => {
    const chave = `teste-limite-${Math.random()}`
    for (let i = 0; i < 3; i++) expect(checarRateLimit(chave, 3, 60_000).ok).toBe(true)

    const barrado = checarRateLimit(chave, 3, 60_000)
    expect(barrado.ok).toBe(false)
    expect(barrado.retryAfterSegundos).toBeGreaterThan(0)
  })

  it("conta cada chave separadamente", () => {
    const a = `teste-a-${Math.random()}`
    const b = `teste-b-${Math.random()}`
    checarRateLimit(a, 1, 60_000)
    expect(checarRateLimit(a, 1, 60_000).ok).toBe(false)
    expect(checarRateLimit(b, 1, 60_000).ok).toBe(true)
  })

  it("volta a liberar depois que a janela expira", () => {
    vi.useFakeTimers()
    const chave = `teste-janela-${Math.random()}`
    checarRateLimit(chave, 1, 60_000)
    expect(checarRateLimit(chave, 1, 60_000).ok).toBe(false)

    vi.advanceTimersByTime(60_001)
    expect(checarRateLimit(chave, 1, 60_000).ok).toBe(true)
  })

  it("limparRateLimit zera a contagem — login certo não herda as tentativas erradas", () => {
    const chave = `teste-limpar-${Math.random()}`
    checarRateLimit(chave, 1, 60_000)
    expect(checarRateLimit(chave, 1, 60_000).ok).toBe(false)

    limparRateLimit(chave)
    expect(checarRateLimit(chave, 1, 60_000).ok).toBe(true)
  })
})

describe("ipDaRequisicao", () => {
  it("usa o primeiro IP do x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" })
    expect(ipDaRequisicao(h)).toBe("203.0.113.5")
  })

  it("cai no x-real-ip quando não há x-forwarded-for", () => {
    expect(ipDaRequisicao(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9")
  })

  it("sem nenhum header, todos caem no mesmo balde — mais restritivo, nunca menos", () => {
    expect(ipDaRequisicao(new Headers())).toBe("desconhecido")
  })
})
