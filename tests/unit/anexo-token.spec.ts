import { describe, it, expect, beforeAll } from "vitest"
import { gerarTokenAnexo, lerTokenAnexo } from "@/lib/anexo-token"

// Este token autoriza a ÚNICA porta de upload sem autenticação do sistema.
// Se ele puder ser forjado ou não expirar, qualquer pessoa na internet anexa
// arquivo em qualquer demanda.

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "segredo-de-teste-com-tamanho-suficiente"
})

const AGORA = 1_760_000_000_000
const TRINTA_MIN = 30 * 60 * 1000

describe("gerarTokenAnexo / lerTokenAnexo", () => {
  it("devolve a demanda quando o token é válido", () => {
    const t = gerarTokenAnexo("demanda-123", AGORA)
    expect(lerTokenAnexo(t, AGORA + 1000)).toBe("demanda-123")
  })

  it("expira depois de 30 minutos", () => {
    const t = gerarTokenAnexo("demanda-123", AGORA)
    expect(lerTokenAnexo(t, AGORA + TRINTA_MIN - 1000)).toBe("demanda-123")
    expect(lerTokenAnexo(t, AGORA + TRINTA_MIN + 1000)).toBeNull()
  })

  it("recusa token com a assinatura adulterada", () => {
    const t = gerarTokenAnexo("demanda-123", AGORA)
    const [corpo] = t.split(".")
    expect(lerTokenAnexo(`${corpo}.assinaturaFalsa`, AGORA)).toBeNull()
  })

  it("recusa quando trocam a demanda mantendo a assinatura", () => {
    // A tentativa óbvia: pegar um token legítimo e apontar para outra demanda.
    const t = gerarTokenAnexo("demanda-123", AGORA)
    const [, assinatura] = t.split(".")
    const corpoFalso = Buffer.from(`demanda-999.${AGORA + TRINTA_MIN}`).toString("base64url")
    expect(lerTokenAnexo(`${corpoFalso}.${assinatura}`, AGORA)).toBeNull()
  })

  it("recusa quando esticam a validade mantendo a assinatura", () => {
    const t = gerarTokenAnexo("demanda-123", AGORA)
    const [, assinatura] = t.split(".")
    const corpoFalso = Buffer.from(`demanda-123.${AGORA + 999 * TRINTA_MIN}`).toString("base64url")
    expect(lerTokenAnexo(`${corpoFalso}.${assinatura}`, AGORA)).toBeNull()
  })

  it("não lança com entrada malformada", () => {
    for (const entrada of ["", ".", "abc", "a.b.c", "%%%.%%%", "null"]) {
      expect(lerTokenAnexo(entrada, AGORA)).toBeNull()
    }
  })

  it("tokens de demandas diferentes não se confundem", () => {
    const a = gerarTokenAnexo("demanda-aaa", AGORA)
    const b = gerarTokenAnexo("demanda-bbb", AGORA)
    expect(lerTokenAnexo(a, AGORA)).toBe("demanda-aaa")
    expect(lerTokenAnexo(b, AGORA)).toBe("demanda-bbb")
    expect(a).not.toBe(b)
  })
})
