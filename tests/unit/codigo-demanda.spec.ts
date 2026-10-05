import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Prisma } from "@prisma/client"
import {
  criarComCodigoUnico,
  ehColisaoDeCodigo,
  sortearCodigo,
  TENTATIVAS_CODIGO,
} from "@/lib/codigo-demanda"

// O código da demanda (VOP-AA-####) é sorteado e a coluna é UNIQUE. Antes, o
// sorteio que caía num número já usado virava 500 para quem estava criando a
// demanda — aconteceu 2 vezes em ~12 criações no ensaio de 04/10/2026.

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
  const indice = `demandas_${campo === "publicToken" ? "public_token" : campo}_key`
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

/** Sorteio que devolve os números na ordem dada. */
function sorteios(...numeros: number[]) {
  let i = 0
  return () => {
    if (i >= numeros.length) throw new Error("o teste sorteou mais vezes do que previa")
    return numeros[i++]
  }
}

let aviso: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  aviso.mockRestore()
})

describe("sortearCodigo", () => {
  it("monta PREFIXO-AA-#### com o ano em dois dígitos", () => {
    expect(sortearCodigo("VOP", AGORA(), () => 4821)).toBe("VOP-26-4821")
    expect(sortearCodigo("VOP-EXT", AGORA(), () => 1077)).toBe("VOP-EXT-26-1077")
  })

  it("o sorteio de verdade fica sempre entre 1000 e 9999", () => {
    for (let i = 0; i < 5000; i++) {
      const m = /^VOP-26-(\d{4})$/.exec(sortearCodigo("VOP", AGORA()))
      expect(m).not.toBeNull()
      const n = Number(m![1])
      expect(n).toBeGreaterThanOrEqual(1000)
      expect(n).toBeLessThanOrEqual(9999)
    }
  })
})

describe("criarComCodigoUnico", () => {
  it("sem colisão, grava na primeira tentativa", async () => {
    const banco = bancoCom([])
    const r = await criarComCodigoUnico("VOP", banco.criar, { sortear: sorteios(4821), agora: AGORA })
    expect(r.codigo).toBe("VOP-26-4821")
    expect(banco.tentados).toEqual(["VOP-26-4821"])
    expect(aviso).not.toHaveBeenCalled()
  })

  it("código já usado: sorteia de novo e grava o primeiro livre (produção, com RLS)", async () => {
    const banco = bancoCom(["VOP-26-1234", "VOP-26-2345"])
    const r = await criarComCodigoUnico("VOP", banco.criar, { sortear: sorteios(1234, 2345, 3456), agora: AGORA })
    expect(r.codigo).toBe("VOP-26-3456")
    expect(banco.tentados).toEqual(["VOP-26-1234", "VOP-26-2345", "VOP-26-3456"])
    // Cada colisão fica no log: é o que mostra quando o ano começar a encher.
    expect(aviso).toHaveBeenCalledTimes(2)
  })

  it.each<Forma>(["dono", "classico"])("reconhece a colisão também no formato %s do erro", async (forma) => {
    const banco = bancoCom(["VOP-26-1234"], forma)
    const r = await criarComCodigoUnico("VOP", banco.criar, { sortear: sorteios(1234, 5678), agora: AGORA })
    expect(r.codigo).toBe("VOP-26-5678")
  })

  it("vale para o formulário externo (VOP-EXT) sem misturar com o interno", async () => {
    // O mesmo número com outro prefixo é outro código: não colide.
    const banco = bancoCom(["VOP-26-1234", "VOP-EXT-26-2222"])
    const r = await criarComCodigoUnico("VOP-EXT", banco.criar, { sortear: sorteios(2222, 1234), agora: AGORA })
    expect(r.codigo).toBe("VOP-EXT-26-1234")
    expect(banco.tentados).toEqual(["VOP-EXT-26-2222", "VOP-EXT-26-1234"])
  })

  it.each<Forma>(["rls", "dono", "classico"])("não insiste quando o campo repetido é outro (%s)", async (forma) => {
    const erro = p2002("publicToken", forma)
    const criar = vi.fn(async () => {
      throw erro
    })
    await expect(criarComCodigoUnico("VOP", criar, { sortear: sorteios(1234), agora: AGORA })).rejects.toBe(erro)
    expect(criar).toHaveBeenCalledTimes(1)
  })

  it("erro que não é de código sobe na hora, sem novo sorteio", async () => {
    const erro = new Error("Can't reach database server")
    const criar = vi.fn(async () => {
      throw erro
    })
    await expect(criarComCodigoUnico("VOP", criar, { sortear: sorteios(1234), agora: AGORA })).rejects.toBe(erro)
    expect(criar).toHaveBeenCalledTimes(1)
  })

  it(`desiste depois de ${TENTATIVAS_CODIGO} colisões seguidas, com erro que explica o motivo`, async () => {
    const banco = bancoCom(["VOP-26-1234"])
    const sempreOMesmo = () => 1234
    const falha = await criarComCodigoUnico("VOP", banco.criar, { sortear: sempreOMesmo, agora: AGORA }).then(
      () => null,
      (e: unknown) => e as Error
    )
    expect(falha).toBeInstanceOf(Error)
    expect(falha?.message).toMatch(/prefixo VOP em 5 tentativas/)
    expect((falha?.cause as { code?: string }).code).toBe("P2002")
    expect(banco.tentados).toHaveLength(TENTATIVAS_CODIGO)
  })
})

describe("ehColisaoDeCodigo", () => {
  it("aceita o nome do índice no lugar da lista de campos", () => {
    expect(ehColisaoDeCodigo({ code: "P2002", meta: { target: "demandas_codigo_key" } })).toBe(true)
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
