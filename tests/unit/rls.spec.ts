import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"

const ler = (p: string) => readFileSync(p, "utf8")
const dir = readdirSync("prisma/migrations").filter((d) => d.includes("rls_isolamento"))
const sqlBruto = ler(`prisma/migrations/${dir[0]}/migration.sql`)
const sql = sqlBruto.replace(/^\s*--.*$/gm, "")

describe("a migration de RLS é inerte até alguém trocar a chave", () => {
  it("não usa FORCE — o dono continua passando", () => {
    // FORCE faria a política valer até para `postgres`, e a aplicação conecta
    // como `postgres`. Seria a virada acontecendo no merge, sem ninguém decidir.
    expect(sql).not.toContain("FORCE ROW LEVEL SECURITY")
  })

  it("os roles nascem sem poder entrar", () => {
    expect(sql).toContain('CREATE ROLE "app_user" NOLOGIN')
    expect(sql).toContain('CREATE ROLE "app_auth" NOLOGIN')
    // Senha em repositório é senha vazada.
    expect(sql).not.toMatch(/PASSWORD\s+'/i)
  })

  it("nenhum role da aplicação recebe BYPASSRLS ou SUPERUSER", () => {
    expect(sql).not.toMatch(/BYPASSRLS/i)
    expect(sql).not.toMatch(/SUPERUSER/i)
  })
})

describe("as políticas", () => {
  it("falham fechado: comparam com um ajuste que pode ser nulo", () => {
    // current_setting(..., true) devolve NULL quando ninguém declarou. NULL = x
    // é NULL, que não é verdadeiro: sem empresa declarada, nada sai.
    expect(sql).toContain("current_setting('app.org_id', true)")
    // O segundo argumento `true` é o que evita erro em vez de vazio.
    expect(sql).not.toMatch(/current_setting\('app\.org_id'\)/)
  })

  it("protegem a escrita, não só a leitura", () => {
    // Sem WITH CHECK dava para INSERIR na empresa dos outros — não veria depois,
    // mas o dado estaria lá.
    const comCheck = (sql.match(/WITH CHECK/g) ?? []).length
    expect(comCheck).toBeGreaterThan(50)
  })

  it("cobrem toda tabela, e a trava de saída confere isso", () => {
    expect(sql).toContain("RLS ligada sem política nenhuma em")
    expect(sql).toContain("tabela sem RLS")
    expect(sql).toContain("RAISE EXCEPTION")
  })

  it("toda política que pergunta ao PAI usa um pai que tem a coluna", () => {
    // `evento_face_descriptors` é NETA: o pai dela (`coberturas_uploads`) também
    // não tem coluna de empresa. O gerador tratou todas as filhas igual e
    // produziu `p."organizacaoId"` num pai que não tem a coluna — a migration
    // quebrou no CI, num banco limpo, antes de chegar perto de produção.
    const schema = ler("prisma/schema.prisma")
    const pais = [...sql.matchAll(/FROM "(\w+)" p WHERE/g)].map((m) => m[1])
    expect(pais.length).toBeGreaterThan(0)
    for (const tabela of new Set(pais)) {
      const modelo = new RegExp(`^model\\s+\\w+\\s*\\{([\\s\\S]*?)@@map\\("${tabela}"\\)`, "m").exec(schema)
      expect(modelo, `sem modelo para ${tabela}`).not.toBeNull()
      expect(modelo![1], `${tabela} não tem organizacaoId`).toMatch(/^\s*organizacaoId\s+String/m)
    }
  })

  it("o role de login só alcança o que o login precisa", () => {
    expect(sql).toContain('GRANT SELECT ON "usuarios", "usuario_organizacao", "organizacoes" TO "app_auth"')
    // Nada de dado de cliente para o caminho de autenticação.
    expect(sql).not.toMatch(/GRANT[^;]*ON "demandas"[^;]*TO "app_auth"/)
    expect(sql).not.toMatch(/GRANT[^;]*IN SCHEMA "public" TO "app_auth"/)
  })
})

describe("o caminho de autenticação é separado", () => {
  it("o login não usa o cliente com RLS", () => {
    const auth = ler("src/lib/auth.ts")
    expect(auth).toContain("prismaAuth")
    // Se voltar a usar o cliente normal, o login devolve vazio sob RLS e o
    // sistema responde "senha inválida" para quem digitou a senha certa.
    expect(auth).not.toMatch(/\bprisma\.(usuario|usuarioOrganizacao)\./)
  })

  it("resolver a empresa não passa pelo filtro por empresa", () => {
    // Perguntar "em qual empresa eu estou" filtrando pela empresa em que estou
    // é circular: a resposta viria vazia e ninguém teria empresa nenhuma.
    const org = ler("src/lib/org.ts")
    expect(org).toContain("prismaAuth.usuarioOrganizacao")
    expect(org).toContain("prismaAuth.organizacao")
    expect(org).not.toMatch(/\bprisma\.usuarioOrganizacao\./)
  })

  it("o Super Admin atravessa por conexão, não por variável de sessão", () => {
    const admin = ler("src/lib/prisma-admin.ts")
    expect(admin).toContain("ADMIN_DATABASE_URL")
    expect(ler("src/app/api/admin/organizacoes/route.ts")).toContain("prismaAdmin")
  })
})

describe("a extensão que declara a empresa", () => {
  const p = ler("src/lib/prisma.ts")

  it("nasce desligada", () => {
    expect(p).toContain('process.env.RLS_ATIVO === "sim"')
    expect(p).toContain("RLS_ATIVO ? comRls(base) : base")
  })

  it("declara por transação, não por conexão", () => {
    // set_config(..., true) é SET LOCAL: morre no fim da transação. Sem isso, a
    // empresa vazaria de uma requisição para a seguinte pela conexão do pool —
    // que é a pior falha possível aqui.
    expect(p).toContain("set_config('app.org_id', $1, true)")
    expect(p).toContain("$transaction")
  })

  it("não abre transação dentro de transação", () => {
    expect(p).toContain("dentroDaTransacao")
  })

  it("intercepta o $transaction da aplicação", () => {
    // A aplicação usa `$transaction` em nove lugares. Sem interceptar, cada
    // operação DENTRO dessas transações passaria pela extensão e abriria a
    // própria — aninhamento que o Prisma recusa, ou pior, escrita que escapa do
    // rollback e fica gravada quando a transação falha. Perda de atomicidade não
    // aparece em teste feliz: aparece no dia em que algo falha no meio.
    expect(p).toContain("async $transaction(")
    expect(p).toContain("dentroDaTransacao.run(true")
    // Os dois formatos: lista e callback.
    expect(p).toContain("Array.isArray(arg)")
  })

  it("descarta o resultado do set_config antes de devolver o do chamador", () => {
    // O `set_config` entra como primeira operação do lote; devolver o resultado
    // dele junto deslocaria todos os índices de quem chamou `$transaction([a,b])`.
    expect(p).toContain("saida.slice(1)")
    expect(p).toContain("([, resultado])")
  })

  it("expõe um cliente sem RLS para quem resolve a empresa", () => {
    expect(p).toContain("export const prismaBase")
  })
})

describe("o plano de voo existe e é executável", () => {
  const plano = ler("RLS-PLANO-DE-VOO.md")
  it("diz como desfazer", () => {
    expect(plano).toContain("DATABASE_URL")
    expect(plano.toLowerCase()).toContain("revers")
  })
  it("tem critério de parada em cada passo", () => {
    expect((plano.match(/\*Critério/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
})
