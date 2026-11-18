import { describe, expect, it } from "vitest"
import bcrypt from "bcryptjs"
import { readFileSync, existsSync } from "node:fs"
import { SENHA_PENDENTE } from "@/lib/convite-equipe"

// Auditoria de 18/11/2026, item 3: conta de profissional nascia com
// "nuflow" + 4 últimos dígitos do telefone, mandada pelo WhatsApp.
describe("conta de profissional sem senha previsível", () => {
  it("a marca de conta pendente não confere com senha nenhuma", async () => {
    for (const tentativa of ["nuflow0000", "nuflow8888", SENHA_PENDENTE, ""]) {
      expect(await bcrypt.compare(tentativa, SENHA_PENDENTE)).toBe(false)
    }
  })

  it("o gerador da senha padrão e o script que a mandava sumiram", () => {
    const helpers = readFileSync("src/lib/user-helpers.ts", "utf8")
    expect(helpers).not.toMatch(/gerarSenhaPadrao|nuflow\$\{|notificarCredenciaisWhatsapp/)
    expect(helpers).toContain("SENHA_PENDENTE")
    expect(existsSync("scripts/criar-contas-profissionais.ts")).toBe(false)
  })
})
