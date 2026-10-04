// Formulário de interesse e limite público com o login real da aplicação
// (membro de app_user, sem bypass). Roda por scripts/teste-runtime-rls.mjs.
import { describe, it, expect } from "vitest"
import { randomUUID } from "node:crypto"
import { prismaBase } from "@/lib/prisma"
import { consumirLimitePublico } from "@/lib/limite-publico"

describe("leads e limite público sob RLS", () => {
  it("a aplicação insere lead, mas não lê nem altera a lista", async () => {
    const id = randomUUID()
    await expect(prismaBase.$executeRaw`
      INSERT INTO leads_comerciais (id, nome, email, telefone, empresa) VALUES (${id}, 'Teste', 'teste@x.test', '31999990000', 'Estúdio')`).resolves.toBe(1)
    await expect(prismaBase.$queryRaw`SELECT id FROM leads_comerciais`).rejects.toThrow(/permission denied/i)
    await expect(prismaBase.$executeRaw`DELETE FROM leads_comerciais WHERE id = ${id}`).rejects.toThrow(/permission denied/i)
  })

  it("a tabela de limites não abre para a aplicação", async () => {
    await expect(prismaBase.$queryRaw`SELECT chave FROM limites_publicos`).rejects.toThrow(/permission denied/i)
    await expect(prismaBase.$executeRaw`INSERT INTO limites_publicos (chave, "janelaInicio", contagem) VALUES ('x', now(), 0)`).rejects.toThrow(/permission denied/i)
  })

  it("a função conta no banco e recusa ao passar do teto", async () => {
    const chave = `teste:${randomUUID()}`
    expect(await consumirLimitePublico(chave, 2, 60)).toBe(true)
    expect(await consumirLimitePublico(chave, 2, 60)).toBe(true)
    expect(await consumirLimitePublico(chave, 2, 60)).toBe(false)
    // Outra chave tem a própria contagem.
    expect(await consumirLimitePublico(`${chave}:outra`, 2, 60)).toBe(true)
  })

  it("entrada inválida não passa", async () => {
    expect(await consumirLimitePublico("", 2, 60)).toBe(false)
    expect(await consumirLimitePublico("x".repeat(201), 2, 60)).toBe(false)
    expect(await consumirLimitePublico(`teste:${randomUUID()}`, 0, 60)).toBe(false)
    expect(await consumirLimitePublico(`teste:${randomUUID()}`, 2, 0)).toBe(false)
  })
})
