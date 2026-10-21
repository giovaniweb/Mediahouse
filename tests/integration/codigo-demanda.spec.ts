import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomBytes } from "node:crypto"
import pg from "pg"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { prismaBase as adminDb } from "@/lib/prisma"
import { comRls } from "@/lib/prisma-rls"
import { comOrg } from "@/lib/org-contexto"
import { criarComCodigoDaEmpresa, proximoNumero } from "@/lib/codigo-demanda"

// Código por empresa contra o Postgres de verdade (Onda 2A): prefixo e contador
// da empresa, unicidade por (empresa, código), e o contador isolado pelo RLS no
// papel sem BYPASSRLS, pela transação em lote do comRls.

const p = `cod${randomBytes(4).toString("hex")}`
const a = `${p}-a`, b = `${p}-b`, u = `${p}-u`
// Prefixo de 5 letras sorteado: isola os códigos desta execução.
const prefixo = Array.from(randomBytes(5), (x) => String.fromCharCode(65 + (x % 26))).join("")
const role = `teste_cod_${randomBytes(5).toString("hex")}`, senha = randomBytes(16).toString("hex")
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST })
const AGORA = () => new Date(2026, 9, 21, 12)
let raw: PrismaClient, db: PrismaClient

const dados = (organizacaoId: string, codigo: string) => ({
  organizacaoId, codigo, titulo: "Demanda sintética", descricao: "Fixture de código por empresa",
  departamento: "teste", tipoVideo: "reels", cidade: "Teste", solicitanteId: u,
})

beforeAll(async () => {
  await admin.connect()
  await admin.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${senha}'`)
  await admin.query(`GRANT app_user TO "${role}"`)
  const url = new URL(process.env.DATABASE_URL_TEST!)
  url.username = role
  url.password = senha
  raw = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  db = comRls(raw)
  await adminDb.organizacao.createMany({ data: [a, b].map((id) => ({ id, nome: id, slug: id, prefixoCodigo: prefixo })) })
  await adminDb.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "sem-login" } })
  // A empresa B já usou o 0001; a A tem um código antigo no meio da sequência.
  await adminDb.demanda.create({ data: dados(b, `${prefixo}-26-0001`) })
  await adminDb.demanda.create({ data: dados(a, `${prefixo}-26-0002`) })
})

afterAll(async () => {
  await raw?.$disconnect()
  await adminDb.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await adminDb.usuario.delete({ where: { id: u } })
  await admin.query(`DROP ROLE IF EXISTS "${role}"`)
  await admin.end()
})

describe("código da demanda por empresa, com banco real", () => {
  it("o mesmo código pode existir em duas empresas; dentro de uma, o repetido pula para o próximo", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const criar = (codigo: string) => adminDb.demanda.create({ data: dados(a, codigo) })
      const primeira = await criarComCodigoDaEmpresa(a, "", criar, { agora: AGORA })
      // 0001 existe na B, e não importa: a unicidade é por empresa.
      expect(primeira.codigo).toBe(`${prefixo}-26-0001`)
      // 0002 é um código antigo da própria A: o banco recusa e o contador anda.
      const segunda = await criarComCodigoDaEmpresa(a, "", criar, { agora: AGORA })
      expect(segunda.codigo).toBe(`${prefixo}-26-0003`)
      // O formulário externo divide a numeração com o interno.
      const terceira = await criarComCodigoDaEmpresa(a, "EXT", criar, { agora: AGORA })
      expect(terceira.codigo).toBe(`${prefixo}-EXT-26-0004`)
      expect(aviso).toHaveBeenCalledTimes(1)
    } finally {
      aviso.mockRestore()
    }
  })

  it("o índice recusa o mesmo código duas vezes na mesma empresa", async () => {
    await expect(adminDb.demanda.create({ data: dados(b, `${prefixo}-26-0001`) })).rejects.toMatchObject({ code: "P2002" })
  })

  it("sob RLS, cada empresa só enxerga e avança o próprio contador", async () => {
    expect(await proximoNumero(b, 26, db)).toBe(1)
    expect(await proximoNumero(b, 26, db)).toBe(2)
    const daA = await comOrg(a, () => db.contadorCodigo.findMany())
    expect(daA.map((c) => c.organizacaoId)).toEqual([a])
    expect(daA[0].ultimo).toBe(4)
    // Gravar o contador de outra empresa estando na A: a política recusa.
    await expect(comOrg(a, () => db.$executeRaw`INSERT INTO contadores_codigo ("organizacaoId", ano, ultimo) VALUES (${b}, 27, 1)`))
      .rejects.toThrow(/row-level security/)
  })
})
