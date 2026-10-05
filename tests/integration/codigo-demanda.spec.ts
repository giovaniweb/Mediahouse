import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomBytes } from "node:crypto"
import pg from "pg"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { prismaBase as adminDb } from "@/lib/prisma"
import { comRls } from "@/lib/prisma-rls"
import { comOrg } from "@/lib/org-contexto"
import { criarComCodigoUnico } from "@/lib/codigo-demanda"

// Colisão de código contra o Postgres de verdade, pelo mesmo caminho da
// produção com RLS: papel sem BYPASSRLS e cada gravação na transação em lote do
// comRls. O código repetido é de OUTRA empresa — a consulta não o enxerga, só o
// índice UNIQUE do INSERT.

const p = `cod${randomBytes(4).toString("hex")}`
const a = `${p}-a`, b = `${p}-b`, u = `${p}-u`
const prefixo = p.toUpperCase() // isola os códigos desta execução
const role = `teste_cod_${randomBytes(5).toString("hex")}`, senha = randomBytes(16).toString("hex")
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST })
const AGORA = () => new Date(2026, 9, 4, 12)
let raw: PrismaClient, db: PrismaClient

const dados = (organizacaoId: string, codigo: string) => ({
  organizacaoId, codigo, titulo: "Demanda sintética", descricao: "Fixture de colisão de código",
  departamento: "teste", tipoVideo: "reels", cidade: "Teste", solicitanteId: u,
})

function sorteios(...numeros: number[]) {
  let i = 0
  return () => numeros[i++]
}

beforeAll(async () => {
  await admin.connect()
  await admin.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${senha}'`)
  await admin.query(`GRANT app_user TO "${role}"`)
  const url = new URL(process.env.DATABASE_URL_TEST!)
  url.username = role
  url.password = senha
  raw = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  db = comRls(raw)
  await adminDb.organizacao.createMany({ data: [a, b].map((id) => ({ id, nome: id, slug: id })) })
  await adminDb.usuario.create({ data: { id: u, nome: u, tipo: "admin", senhaHash: "sem-login" } })
  await adminDb.demanda.create({ data: dados(b, `${prefixo}-26-1234`) })
})

afterAll(async () => {
  await raw?.$disconnect()
  await adminDb.organizacao.deleteMany({ where: { id: { in: [a, b] } } })
  await adminDb.usuario.delete({ where: { id: u } })
  await admin.query(`DROP ROLE IF EXISTS "${role}"`)
  await admin.end()
})

describe("criarComCodigoUnico com banco real", () => {
  it("sorteia de novo quando o código já é de outra empresa, que o RLS esconde", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const repetido = `${prefixo}-26-1234`
      // Conferir antes não adianta: sob RLS a empresa A não vê o código da B.
      expect(await comOrg(a, () => db.demanda.findUnique({ where: { codigo: repetido } }))).toBeNull()

      const criada = await comOrg(a, () =>
        criarComCodigoUnico(prefixo, (codigo) => db.demanda.create({ data: dados(a, codigo) }), {
          sortear: sorteios(1234, 5678),
          agora: AGORA,
        })
      )
      expect(criada).toMatchObject({ organizacaoId: a, codigo: `${prefixo}-26-5678` })
      expect(aviso).toHaveBeenCalledTimes(1)
      expect(await adminDb.demanda.count({ where: { codigo: { startsWith: prefixo } } })).toBe(2)
    } finally {
      aviso.mockRestore()
    }
  })

  it("também sem RLS, conectado como dono — como a produção roda hoje", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const criada = await criarComCodigoUnico(prefixo, (codigo) => adminDb.demanda.create({ data: dados(b, codigo) }), {
        sortear: sorteios(1234, 5678, 9012),
        agora: AGORA,
      })
      expect(criada.codigo).toBe(`${prefixo}-26-9012`)
      expect(aviso).toHaveBeenCalledTimes(2)
    } finally {
      aviso.mockRestore()
    }
  })
})
