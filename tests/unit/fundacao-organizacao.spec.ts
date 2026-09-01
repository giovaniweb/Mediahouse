import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"

const ler = (p: string) => readFileSync(p, "utf8")
const schema = ler("prisma/schema.prisma")

function corpoDoModelo(nome: string): string {
  const m = new RegExp(`^model\\s+${nome}\\s*\\{\\n([\\s\\S]*?)^\\}$`, "m").exec(schema)
  if (!m) throw new Error(`modelo ${nome} não encontrado no schema`)
  return m[1]
}

// As 19 tabelas que já tinham a coluna e ganharam NOT NULL + FK. Nulável de
// novo significa dado que nasce órfão e some de toda consulta com escopo — o
// tipo de regressão que passa despercebido até um cliente perguntar cadê.
const OBRIGATORIAS = [
  "Demanda", "AlertaIA", "ConfigWhatsapp", "MensagemWhatsapp", "ContatoWhatsApp",
  "MapaLidWhatsApp", "Evento", "CustoVideomaker", "RelatorioIA", "ConfigEmail",
  "ConfigParametro", "Fabricante", "Produto", "IdeiaVideo", "ConfigEmpresa",
  "EventoCobertura", "EventoGestao", "Fornecedor", "ProducaoManual",
]

// As 5 que ganharam a coluna agora. Seguem NULÁVEIS de propósito.
const NOVAS = ["Depoimento", "ChecklistTemplate", "ConfigTrello", "AvaliacaoVideomaker", "AvaliacaoEditor"]

describe("schema: organizacaoId obrigatório e amarrado", () => {
  for (const modelo of OBRIGATORIAS) {
    it(`${modelo} tem organizacaoId NOT NULL com relação`, () => {
      const corpo = corpoDoModelo(modelo)
      expect(corpo, "coluna nulável").not.toMatch(/^\s*organizacaoId\s+String\?/m)
      expect(corpo).toMatch(/^\s*organizacaoId\s+String\s/m)
      expect(corpo, "sem relação = sem chave estrangeira").toMatch(
        /organizacao\s+Organizacao\s+@relation\(fields: \[organizacaoId\][^)]*onDelete: Cascade\)/
      )
    })
  }

  for (const modelo of NOVAS) {
    it(`${modelo} ganhou a coluna, ainda nulável`, () => {
      const corpo = corpoDoModelo(modelo)
      expect(corpo).toMatch(/^\s*organizacaoId\s+String\?/m)
      expect(corpo).toMatch(/organizacao\s+Organizacao\?\s+@relation\(fields: \[organizacaoId\]/)
      expect(corpo, "sem índice, cada política de RLS vira varredura").toMatch(/@@index\(\[organizacaoId\]\)/)
    })
  }
})

describe("a migration da fundação", () => {
  const dir = readdirSync("prisma/migrations").filter((d) => d.includes("fundacao_organizacao"))
  it("existe e é única", () => expect(dir).toHaveLength(1))

  const bruto = ler(`prisma/migrations/${dir[0]}/migration.sql`)
  // Mesma disciplina dos auditores: o comentário que EXPLICA a regra não pode
  // ser lido como a regra. Este arquivo é mais comentário que DDL, de propósito.
  const sql = bruto.replace(/^\s*--.*$/gm, "")

  it("aborta antes de tocar em nada se houver nulo ou órfão", () => {
    expect(sql).toContain("RAISE EXCEPTION")
    expect(sql).toMatch(/IS NULL[\s\S]*RAISE EXCEPTION/)
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM organizacoes/)
  })

  it("confere no fim o que prometeu", () => {
    expect(sql).toContain("continua nulável")
    expect(sql).toContain("ficou sem chave estrangeira")
    // A trava de saída vem DEPOIS de tudo, senão não confere nada.
    expect(sql.lastIndexOf("SET NOT NULL")).toBeLessThan(sql.indexOf("continua nulável"))
  })

  it("faz o NOT NULL depois da FK e do índice, não antes", () => {
    // Se o NOT NULL falhar, a transação volta com o banco coerente.
    expect(sql.indexOf("ADD CONSTRAINT")).toBeLessThan(sql.indexOf("ALTER COLUMN \"organizacaoId\" SET NOT NULL"))
    expect(sql.indexOf("CREATE INDEX")).toBeLessThan(sql.indexOf("ALTER COLUMN \"organizacaoId\" SET NOT NULL"))
  })

  it("não crava a empresa pelo slug no backfill", () => {
    // Migration é histórico e roda em qualquer banco — inclusive numa
    // instalação nova que nunca ouviu falar em Contourline.
    expect(sql).not.toContain("contourline")
    expect(sql).toContain('ORDER BY "createdAt" ASC LIMIT 1')
  })
})

// ── O padrão que vazava ──────────────────────────────────────────────────────
//
// `...(organizacaoId && { organizacaoId })` parece defensivo e é o contrário:
// quando a organização falta, a consulta sai SEM FILTRO e devolve a plataforma
// inteira. Era assim em 32 pontos do executor de ferramentas da IA e no sino de
// notificações.
describe("nenhum escopo condicional sobrou", () => {
  const arquivos = ["src/lib/ia-tools-executor.ts", "src/app/api/notificacoes/route.ts"]
  for (const f of arquivos) {
    it(`${f} não tem filtro de empresa opcional`, () => {
      const src = ler(f)
      expect(src).not.toMatch(/\.\.\.\(organizacaoId\s*&&\s*\{\s*organizacaoId\s*\}\)/)
      expect(src).not.toMatch(/\.\.\.\(organizacaoId\s*\?\s*\{\s*organizacaoId\s*\}\s*:\s*\{\}\)/)
      expect(src).not.toMatch(/organizacaoId\s*\?\s*\{\s*organizacaoId\s*\}\s*:\s*\{\}/)
    })
  }

  it("a IA exige a empresa na assinatura, não a recebe como talvez", () => {
    const src = ler("src/lib/ia-tools-executor.ts")
    expect(src).not.toContain("organizacaoId?: string | null")
    expect(src).toContain("organizacaoId: string")
  })

  it("editor é perfil global: escopa por vínculo, não por coluna", () => {
    const src = ler("src/lib/ia-tools-executor.ts")
    expect(src).toContain("vinculos: { some: { organizacaoId } }")
    // Os dois pontos exatos onde a substituição em massa tinha inventado uma
    // coluna que Editor não tem — o tsc pegou um, o `any` escondia o outro.
    expect(src).not.toContain("where: { id: input.editor_id as string, organizacaoId }")
    expect(src).not.toContain("const edWhere: any = { organizacaoId }")
  })
})

// ── Comentário privado, nota da rede ────────────────────────────────────────
describe("avaliação: nota é da rede, comentário é de quem contratou", () => {
  for (const f of [
    "src/app/api/videomakers/[id]/avaliar/route.ts",
    "src/app/api/editores/[id]/avaliar/route.ts",
  ]) {
    it(`${f} lê o comentário desta empresa mais o público`, () => {
      const src = ler(f)
      expect(src).toMatch(/OR: \[\{ organizacaoId \}, \{ organizacaoId: null \}\]/)
      expect(src, "a nota agregada não pode ganhar recorte").toContain("_avg: { nota: true }")
    })
  }

  for (const f of [
    "src/app/api/publico/avaliar/route.ts",
    "src/app/api/publico/avaliar-editor/route.ts",
  ]) {
    it(`${f} grava sem dono, de propósito`, () => {
      expect(ler(f)).toContain("organizacaoId: null")
    })
  }
})

// ── O portão de migration ───────────────────────────────────────────────────
describe("release de migration exige mão humana", () => {
  const wf = ler(".github/workflows/release-migrations.yml")

  it("o job que aplica só roda em disparo manual confirmado", () => {
    expect(wf).toContain("if: github.event_name == 'workflow_dispatch' && inputs.confirmo == 'aplicar'")
  })

  it("continua passando pelo guarda de banco, não pelo prisma direto", () => {
    expect(wf).toContain("npm run db:deploy")
    expect(wf).not.toMatch(/run: npx prisma migrate deploy/)
  })
})

// ── O seed volta a funcionar ────────────────────────────────────────────────
describe("seed cria uma empresa", () => {
  const seed = ler("prisma/seed.ts")
  it("cria a organização e vincula todo mundo", () => {
    expect(seed).toContain('slug: "demo"')
    expect(seed).toContain("usuarioOrganizacao.upsert")
  })
  it("nenhuma demanda ou alerta nasce sem empresa", () => {
    const creates = seed.match(/prisma\.(demanda|alertaIA)\.create\(\{\n\s*data: \{\n([\s\S]*?)\n\s*\},\n\s*\}\)/g) ?? []
    expect(creates.length).toBeGreaterThan(5)
    for (const c of creates) expect(c, c.slice(0, 60)).toContain("organizacaoId")
  })
})
