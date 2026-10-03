import { describe, it, expect } from "vitest"
import { sugerirConteudoProduto } from "@/lib/produtos-sugestoes"

const agora = new Date("2026-09-29T12:00:00Z")
const produto = { id: "p", nome: "Produto", categoria: null, ultimoConteudo: null, createdAt: new Date(+agora - 30 * 86_400_000), peso: 2, alertaDias: 30, totalConteudos: 0 }
describe("orientação editorial por regras", () => {
  it("prioriza retomada ao atingir o prazo, sem inventar atributos do produto", () => {
    const sugestao = sugerirConteudoProduto(produto, agora)
    expect(sugestao.diasSemConteudo).toBe(30)
    expect(sugestao.score).toBe(2)
    expect(sugestao.sugestao).toContain("Retome a apresentação")
  })
  it("usa último conteúdo quando disponível e propõe planejamento antes do prazo", () => {
    const sugestao = sugerirConteudoProduto({ ...produto, ultimoConteudo: agora }, agora)
    expect(sugestao.diasSemConteudo).toBe(0)
    expect(sugestao.sugestao).toContain("Planeje um vídeo")
  })
  it("data futura não cria prioridade negativa e prazo zero não divide por zero", () => {
    expect(sugerirConteudoProduto({ ...produto, ultimoConteudo: new Date(+agora + 86_400_000) }, agora).score).toBe(0)
    expect(sugerirConteudoProduto({ ...produto, alertaDias: 0 }, agora).score).toBe(60)
  })
})
