import { beforeEach, describe, expect, it, vi } from "vitest"
const { membro, permissao } = vi.hoisted(() => ({ membro: vi.fn(), permissao: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { usuarioOrganizacao: { findUnique: membro }, permissaoUsuario: { findUnique: permissao } } }))
import { permissoesEfetivas } from "@/lib/permissoes-server"
beforeEach(() => {
  membro.mockReset().mockResolvedValue({ papel: "admin", organizacaoId: "a", usuario: { status: "ativo" }, organizacao: { ativo: true } })
  permissao.mockReset().mockResolvedValue(null)
})
describe("leitura da autorização", () => {
  it("registro ausente herda perfil, erro de leitura nega", async () => {
    expect((await permissoesEfetivas("u", "a"))?.permissoes.gerenciarConfig).toBe(true)
    permissao.mockRejectedValue(new Error("indisponível"))
    expect(await permissoesEfetivas("u", "a")).toBeNull()
  })
  it("restrição explícita vence perfil de admin", async () => {
    permissao.mockResolvedValue({ gerenciarConfig: false })
    expect((await permissoesEfetivas("u", "a"))?.permissoes.gerenciarConfig).toBe(false)
  })
  it("empresa inativa nega antes de ler permissões", async () => {
    membro.mockResolvedValue({ organizacao: { ativo: false } })
    expect(await permissoesEfetivas("u", "a")).toBeNull()
    expect(permissao).not.toHaveBeenCalled()
  })
})
