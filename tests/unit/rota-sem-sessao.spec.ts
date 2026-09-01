import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

// Sob RLS, a extensão descobre a empresa pela sessão da requisição. Rota que não
// tem sessão — pública por token, cron, webhook — precisa DECLARAR a empresa, ou
// o banco devolve vazio.
//
// Vazio não é erro: a rota responde 200 com lista sem nada. Nenhum teste de
// unidade pega isso, nenhum log acusa, e quem descobre é o cliente. Por isso a
// verificação é estática e roda no CI, como os auditores.

const RAIZ = process.cwd()
const schema = readFileSync("prisma/schema.prisma", "utf8")

// Modelos GLOBAIS: legíveis sem empresa declarada, por política própria.
const GLOBAIS = new Set([
  "usuarios", "organizacoes", "videomakers", "editores", "designers",
  "sessions", "password_reset_tokens", "chat_ia_mensagens",
])

const escopado: Record<string, boolean> = {}
for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const [, nome, corpo] = m
  const tabela = /@@map\("([^"]+)"\)/.exec(corpo)?.[1] ?? nome
  escopado[nome.charAt(0).toLowerCase() + nome.slice(1)] = !GLOBAIS.has(tabela)
}

function rotas(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) rotas(caminho, saida)
    else if (nome === "route.ts") saida.push(caminho)
  }
  return saida
}

// Exceções, cada uma com motivo. Esta lista SÓ PODE ENCOLHER.
const DISPENSADAS: Record<string, string> = {
  "src/app/api/auth/esqueci-senha/route.ts":
    "caminho de autenticação: importa `prismaAuth as prisma`, não passa pela extensão",
  "src/app/api/publico/avaliar/route.ts":
    "avaliação por QR grava organizacaoId: null de propósito — a política aceita linha sem dono",
  "src/app/api/publico/avaliar-editor/route.ts":
    "idem: o cliente final falando do profissional pertence à rede, não a uma empresa",
  // Módulo `eventos` está desligado na plataforma (DISPONIVEL_NA_PLATAFORMA).
  // Ligá-lo exige passar por aqui antes.
  "src/app/api/eventos/[id]/aprovacoes/route.ts": "módulo eventos desligado",
  "src/app/api/eventos/[id]/checklist/route.ts": "módulo eventos desligado",
  "src/app/api/eventos/[id]/custos/route.ts": "módulo eventos desligado",
  "src/app/api/eventos/[id]/documentos/route.ts": "módulo eventos desligado",
  "src/app/api/eventos/[id]/relatorio/route.ts": "módulo eventos desligado",
  "src/app/api/eventos/[id]/route.ts": "módulo eventos desligado",
  "src/app/api/eventos/dashboard/route.ts": "módulo eventos desligado",
  "src/app/api/eventos/route.ts": "módulo eventos desligado",
  "src/app/api/fornecedores/[id]/route.ts": "módulo eventos desligado",
  "src/app/api/fornecedores/route.ts": "módulo eventos desligado",
  "src/app/api/produtos-servico/[id]/route.ts": "módulo eventos desligado",
  "src/app/api/produtos-servico/route.ts": "módulo eventos desligado",
}

describe("rota sem sessão declara a empresa", () => {
  const semDeclarar: string[] = []
  for (const arquivo of rotas(join(RAIZ, "src/app/api"))) {
    const rel = relative(RAIZ, arquivo)
    const src = readFileSync(arquivo, "utf8")
    if (/\bawait auth\(\)/.test(src)) continue
    if (/declararOrg\(|comOrg\(/.test(src)) continue
    const modelos = [...new Set([...src.matchAll(/\bprisma\.(\w+)\./g)].map((m) => m[1]))]
    if (!modelos.some((m) => escopado[m])) continue
    semDeclarar.push(rel)
  }

  it("nenhuma rota nova consulta tabela por empresa sem declarar a empresa", () => {
    const novas = semDeclarar.filter((r) => !(r in DISPENSADAS))
    expect(novas, `declare com declararOrg() ou comOrg(), ou justifique em DISPENSADAS:\n${novas.join("\n")}`).toEqual([])
  })

  it("a lista de dispensadas só encolhe — nenhuma entrada obsoleta", () => {
    const obsoletas = Object.keys(DISPENSADAS).filter((r) => !semDeclarar.includes(r))
    expect(obsoletas, `já declaram a empresa, saia da lista:\n${obsoletas.join("\n")}`).toEqual([])
  })

  it("toda dispensa tem motivo escrito", () => {
    for (const [rota, motivo] of Object.entries(DISPENSADAS)) {
      expect(motivo.trim(), rota).not.toBe("")
    }
  })
})

describe("o laço do cron não usa declararOrg", () => {
  it("percorre empresas com comOrg, que delimita o escopo", () => {
    const src = readFileSync("src/app/api/cron/agentes/route.ts", "utf8")
    // `declararOrg` usa enterWith e persiste: numa iteração por VÁRIAS empresas,
    // a empresa da volta anterior continuaria valendo na seguinte — e o dado
    // sairia carimbado com o dono errado.
    expect(src).toContain("comOrg(org.id")
    expect(src).not.toContain("declararOrg(")
  })

  it("a varredura de caixas de entrada também", () => {
    const src = readFileSync("src/lib/email-inbox.ts", "utf8")
    expect(src).toContain("comOrg(org.id")
    expect(src).not.toContain("declararOrg(")
  })
})

describe("as funções SECURITY DEFINER", () => {
  const dir = readdirSync("prisma/migrations").filter((d) => /org_por_credencial|avaliacao_publica/.test(d))
  // Sem os comentários: estes arquivos explicam SECURITY DEFINER em prosa, e o
  // texto que descreve a regra não pode ser contado como a regra.
  const sql = dir
    .map((d) => readFileSync(`prisma/migrations/${d}/migration.sql`, "utf8"))
    .join("\n")
    .replace(/^\s*--.*$/gm, "")

  it("fixam o search_path", () => {
    // Sem isso, quem chama planta um schema com uma tabela `demandas` falsa na
    // frente e sequestra a função, que roda com os privilégios do dono.
    const definers = (sql.match(/SECURITY DEFINER/g) ?? []).length
    const paths = (sql.match(/SET search_path = public/g) ?? []).length
    expect(definers).toBeGreaterThan(0)
    expect(paths).toBe(definers)
  })

  it("não ficam abertas para PUBLIC", () => {
    const revokes = (sql.match(/REVOKE ALL ON FUNCTION/g) ?? []).length
    expect(revokes).toBeGreaterThanOrEqual(3)
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.org_por_credencial(TEXT, TEXT) TO "app_user"')
  })

  it("a de credencial devolve só o id da empresa", () => {
    // Se um dia ela devolver a linha inteira, quem tem o token de uma demanda
    // passa a ler o conteúdo de qualquer registro daquele tipo.
    expect(sql).toContain("RETURNS TEXT")
    expect(sql).not.toMatch(/org_por_credencial[\s\S]{0,200}RETURNS (TABLE|SETOF|RECORD)/)
  })
})

describe("avaliação por QR público continua possível sob RLS", () => {
  const dir = readdirSync("prisma/migrations").filter((d) => d.includes("avaliacao_publica"))
  const sql = readFileSync(`prisma/migrations/${dir[0]}/migration.sql`, "utf8")

  it("a política aceita linha sem dono", () => {
    // Sem isto o INSERT do QR seria recusado: a tela diria "avaliação enviada" e
    // nada teria sido gravado.
    const comNulo = (sql.match(/"organizacaoId" IS NULL/g) ?? []).length
    expect(comNulo).toBeGreaterThanOrEqual(4)
  })

  it("a média vira função, porque RLS decide por linha e não por coluna", () => {
    expect(sql).toContain("recalcular_media_videomaker")
    expect(sql).toContain("recalcular_media_editor")
    const lib = readFileSync("src/lib/avaliacao.ts", "utf8")
    expect(lib).toContain("public.recalcular_media_videomaker")
    // Não pode voltar a escrever direto: o perfil é da rede e a política de
    // escrita dele exige vínculo com a empresa ativa.
    expect(lib).not.toMatch(/prisma\w*\.(videomaker|editor)\.update/)
  })
})
