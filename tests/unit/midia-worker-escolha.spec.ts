import { describe, expect, it, vi } from "vitest"
import { escolherTrabalho, LIMITE_PENDENTES, PAGINA_EMPRESAS } from "@/lib/midia-worker-escolha"

// Revisão do #142: empresas sem conversão (ou acima da franquia) no topo da
// fila não podem esconder as elegíveis que vêm depois delas.

const ids = (n: number, prefixo = "org") => Array.from({ length: n }, (_, i) => `${prefixo}-${String(i).padStart(4, "0")}`)

function cenario(o: { pendentes: string[]; ativas: string[]; elegiveis: Set<string>; comTrabalho: Set<string> }) {
  const ativas = vi.fn(async (depois: string | undefined, take: number) =>
    o.ativas.filter((id) => !depois || id > depois).slice(0, take))
  const reivindicar = vi.fn(async (org: string) => (o.comTrabalho.has(org) ? { org } : null))
  const permitida = vi.fn(async (org: string) => o.elegiveis.has(org))
  return { deps: { pendentes: async (l: number) => o.pendentes.slice(0, l), ativas, permitida, reivindicar }, ativas, reivindicar, permitida }
}

describe("worker de mídia escolhe a empresa", () => {
  it("as 100 mais antigas sem conversão: segue pelas ativas e acha a elegível depois delas", async () => {
    const todas = ids(250)
    const alvo = todas[230]
    // A lista do banco veio cheia, só com empresas inelegíveis; a elegível com
    // trabalho está bem depois. No código antigo o worker voltava null aqui.
    const c = cenario({ pendentes: todas.slice(0, LIMITE_PENDENTES), ativas: todas, elegiveis: new Set([alvo]), comTrabalho: new Set([alvo]) })
    expect(await escolherTrabalho(c.deps)).toEqual({ org: alvo })
    expect(c.ativas).toHaveBeenCalledTimes(3) // páginas de 100: 0–99, 100–199, 200–…
    // Quem já foi conferido na lista não é conferido de novo na varredura.
    expect(c.permitida.mock.calls.filter(([o]) => o === todas[0])).toHaveLength(1)
    expect(c.reivindicar).toHaveBeenCalledTimes(1)
  })

  it("prova contrária: só a lista do banco, sem a varredura, não acharia ninguém", async () => {
    const todas = ids(250)
    const alvo = todas[230]
    const c = cenario({ pendentes: todas.slice(0, LIMITE_PENDENTES), ativas: [], elegiveis: new Set([alvo]), comTrabalho: new Set([alvo]) })
    expect(await escolherTrabalho(c.deps)).toBeNull()
  })

  it("lista incompleta: ninguém mais tem mídia, não percorre as empresas", async () => {
    const todas = ids(300)
    const c = cenario({ pendentes: todas.slice(0, 7), ativas: todas, elegiveis: new Set(), comTrabalho: new Set() })
    expect(await escolherTrabalho(c.deps)).toBeNull()
    expect(c.ativas).not.toHaveBeenCalled()
  })

  it("respeita a ordem da espera: a primeira elegível da lista ganha", async () => {
    const lista = ["c", "a", "b"]
    const c = cenario({ pendentes: lista, ativas: ["a", "b", "c"], elegiveis: new Set(["a", "b"]), comTrabalho: new Set(["a", "b"]) })
    expect(await escolherTrabalho(c.deps)).toEqual({ org: "a" })
  })

  it("elegível sem trabalho (outro worker pegou) passa para a próxima", async () => {
    const c = cenario({ pendentes: ["a", "b"], ativas: [], elegiveis: new Set(["a", "b"]), comTrabalho: new Set(["b"]) })
    expect(await escolherTrabalho(c.deps)).toEqual({ org: "b" })
    expect(PAGINA_EMPRESAS).toBe(100)
  })
})
