import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Prisma } from "@prisma/client"
import {
  criarComCodigoDaEmpresa,
  ehColisaoDeCodigo,
  montarCodigo,
  sugerirPrefixo,
  prefixoValido,
  TENTATIVAS_CODIGO,
} from "@/lib/codigo-demanda"

// O código da demanda é por empresa desde a Onda 2A: prefixo da empresa e
// número em sequência (PREFIXO-AA-####), único por (empresa, código). Quando o
// número já foi usado (a Contourline passa pelos códigos sorteados antigos), o
// banco recusa e o contador anda mais um.

const AGORA = () => new Date(2026, 9, 4, 12)

type Forma = "rls" | "dono" | "classico"

/**
 * P2002 com o `meta` exatamente como cada caminho devolve — os dois primeiros
 * copiados do Prisma 7 + adapter-pg contra Postgres 17:
 * - rls: conectado como app_user. Não vem campo nenhum, só o nome do índice
 *   na mensagem original do Postgres. É o caminho da produção com RLS ligado.
 * - dono: conectado como dono do banco, com a lista de campos.
 * - classico: motor antigo do Prisma, com meta.target.
 */
function p2002(campo: string, forma: Forma = "rls") {
  const indice = campo === "codigo" ? "demandas_organizacaoId_codigo_key" : `demandas_${campo === "publicToken" ? "public_token" : campo}_key`
  const causa = {
    originalCode: "23505",
    originalMessage: `duplicate key value violates unique constraint "${indice}"`,
    kind: "UniqueConstraintViolation",
  }
  const meta =
    forma === "classico"
      ? { modelName: "Demanda", target: [campo] }
      : {
          modelName: "Demanda",
          driverAdapterError: {
            name: "DriverAdapterError",
            cause: forma === "dono" ? { ...causa, constraint: { fields: [campo] } } : causa,
          },
        }
  const campos = forma === "rls" ? "(not available)" : `fields: (\`${campo}\`)`
  return new Prisma.PrismaClientKnownRequestError(
    `\nInvalid \`prisma.demanda.create()\` invocation:\n\nUnique constraint failed on the ${campos}`,
    { code: "P2002", clientVersion: Prisma.prismaVersion.client, meta }
  )
}

/** Banco de mentira com o índice UNIQUE em `codigo`. */
function bancoCom(existentes: string[], forma: Forma = "rls") {
  const codigos = new Set(existentes)
  const tentados: string[] = []
  const criar = async (codigo: string) => {
    tentados.push(codigo)
    if (codigos.has(codigo)) throw p2002("codigo", forma)
    codigos.add(codigo)
    return { id: `dem-${codigos.size}`, codigo }
  }
  return { criar, tentados }
}

/** Contador de mentira: devolve 1, 2, 3… a partir de `desde`. */
function contador(desde = 1) {
  let n = desde - 1
  const chamadas: number[] = []
  const numero = async (ano: number) => {
    chamadas.push(ano)
    return ++n
  }
  return { numero, chamadas }
}

let aviso: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  aviso.mockRestore()
})

const opcoes = (prefixo: string, c: ReturnType<typeof contador>) => ({ agora: AGORA, prefixo: async () => prefixo, numero: c.numero })

describe("montarCodigo e prefixo", () => {
  it("monta PREFIXO[-TIPO]-AA-#### com o ano em dois dígitos", () => {
    expect(montarCodigo("GH", "", 26, 1)).toBe("GH-26-0001")
    expect(montarCodigo("VOP", "EXT", 26, 77)).toBe("VOP-EXT-26-0077")
    // Sem teto: passou de 9999, ganha mais um dígito.
    expect(montarCodigo("GH", "", 27, 12345)).toBe("GH-27-12345")
  })

  it("sugere o prefixo pelas iniciais, sem acento e sem 'Ltda'", () => {
    expect(sugerirPrefixo("GH Produções")).toBe("GH")
    expect(sugerirPrefixo("Gh Produções")).toBe("GP")
    expect(sugerirPrefixo("Estúdio da Ana Ltda")).toBe("EA")
    expect(sugerirPrefixo("Contourline")).toBe("CON")
    expect(prefixoValido(sugerirPrefixo("123"))).toBe(true)
  })

  it("prefixo válido: só 2 a 5 letras maiúsculas", () => {
    expect(prefixoValido("GH")).toBe(true)
    expect(prefixoValido("VOP")).toBe(true)
    expect(prefixoValido("gh")).toBe(false)
    expect(prefixoValido("G")).toBe(false)
    expect(prefixoValido("GH-1")).toBe(false)
    expect(prefixoValido(null)).toBe(false)
  })
})

describe("criarComCodigoDaEmpresa", () => {
  it("empresa nova: começa em 0001 e segue em sequência", async () => {
    const banco = bancoCom([])
    const c = contador()
    const a = await criarComCodigoDaEmpresa("org-gh", "", banco.criar, opcoes("GH", c))
    const b = await criarComCodigoDaEmpresa("org-gh", "EXT", banco.criar, opcoes("GH", c))
    expect(a.codigo).toBe("GH-26-0001")
    expect(b.codigo).toBe("GH-EXT-26-0002")
    expect(c.chamadas).toEqual([26, 26])
    expect(aviso).not.toHaveBeenCalled()
  })

  it("número já usado por código antigo: o contador anda e grava o próximo livre (produção, com RLS)", async () => {
    const banco = bancoCom(["VOP-26-1000", "VOP-26-1001"])
    const r = await criarComCodigoDaEmpresa("org-contourline", "", banco.criar, opcoes("VOP", contador(1000)))
    expect(r.codigo).toBe("VOP-26-1002")
    expect(banco.tentados).toEqual(["VOP-26-1000", "VOP-26-1001", "VOP-26-1002"])
    expect(aviso).toHaveBeenCalledTimes(2)
  })

  it.each<Forma>(["dono", "classico"])("reconhece a colisão também no formato %s do erro", async (forma) => {
    const banco = bancoCom(["VOP-26-0001"], forma)
    const r = await criarComCodigoDaEmpresa("org", "", banco.criar, opcoes("VOP", contador()))
    expect(r.codigo).toBe("VOP-26-0002")
  })

  it.each<Forma>(["rls", "dono", "classico"])("não insiste quando o campo repetido é outro (%s)", async (forma) => {
    const erro = p2002("publicToken", forma)
    const criar = vi.fn(async () => {
      throw erro
    })
    await expect(criarComCodigoDaEmpresa("org", "", criar, opcoes("GH", contador()))).rejects.toBe(erro)
    expect(criar).toHaveBeenCalledTimes(1)
  })

  it("erro que não é de código sobe na hora, sem pedir outro número", async () => {
    const erro = new Error("Can't reach database server")
    const criar = vi.fn(async () => {
      throw erro
    })
    await expect(criarComCodigoDaEmpresa("org", "", criar, opcoes("GH", contador()))).rejects.toBe(erro)
    expect(criar).toHaveBeenCalledTimes(1)
  })

  it(`desiste depois de ${TENTATIVAS_CODIGO} colisões seguidas, com erro que explica o motivo`, async () => {
    const usados = Array.from({ length: TENTATIVAS_CODIGO }, (_, i) => montarCodigo("VOP", "", 26, i + 1))
    const banco = bancoCom(usados)
    const falha = await criarComCodigoDaEmpresa("org", "", banco.criar, opcoes("VOP", contador())).then(
      () => null,
      (e: unknown) => e as Error
    )
    expect(falha).toBeInstanceOf(Error)
    expect(falha?.message).toMatch(new RegExp(`em ${TENTATIVAS_CODIGO} tentativas`))
    expect((falha?.cause as { code?: string }).code).toBe("P2002")
    expect(banco.tentados).toHaveLength(TENTATIVAS_CODIGO)
  })
})

describe("ehColisaoDeCodigo", () => {
  it("aceita o nome do índice no lugar da lista de campos", () => {
    expect(ehColisaoDeCodigo({ code: "P2002", meta: { target: "demandas_codigo_key" } })).toBe(true)
    expect(ehColisaoDeCodigo({ code: "P2002", meta: { target: "demandas_organizacaoId_codigo_key" } })).toBe(true)
    expect(ehColisaoDeCodigo({ code: "P2002", meta: { target: ["organizacaoId", "codigo"] } })).toBe(true)
    expect(
      ehColisaoDeCodigo({
        code: "P2002",
        meta: { driverAdapterError: { cause: { constraint: { index: "eventos_gestao_codigo_key" } } } },
      })
    ).toBe(true)
  })

  it("recusa outro índice, outro código de erro e lixo", () => {
    expect(ehColisaoDeCodigo({ code: "P2002", meta: { target: "demandas_public_token_key" } })).toBe(false)
    expect(ehColisaoDeCodigo({ code: "P2003", meta: { target: ["codigo"] } })).toBe(false)
    expect(ehColisaoDeCodigo(null)).toBe(false)
    expect(ehColisaoDeCodigo("P2002")).toBe(false)
  })
})
