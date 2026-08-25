import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { temMaisDeUmaEmpresa } from "@/components/EtiquetaEmpresa"

const ler = (p: string) => readFileSync(p, "utf8")

// ── Quem assina a avaliação ─────────────────────────────────────────────────
//
// `origem` e `avaliadorId` vinham no corpo da requisição. Dava para carimbar uma
// avaliação como "interna" e assiná-la com o id de outra pessoa. A nota é o
// ativo do profissional no marketplace; ela não pode aceitar autoria do cliente.
describe("avaliação não aceita autoria vinda do corpo", () => {
  const rotas = [
    "src/app/api/videomakers/[id]/avaliar/route.ts",
    "src/app/api/editores/[id]/avaliar/route.ts",
  ]

  for (const rota of rotas) {
    it(`${rota} exige sessão e assina com ela`, () => {
      const src = ler(rota)
      expect(src).toContain("session.user.id")
      expect(src).toContain('avaliadorId: session.user.id')
      expect(src).toContain('origem: "interno"')
      // Nada de ler os dois do body.
      expect(src).not.toMatch(/const\s*\{[^}]*\borigem\b[^}]*\}\s*=\s*body/)
      expect(src).not.toMatch(/avaliadorId:\s*(body|parsed)/)
    })
  }

  it("a rota pública fixa a origem e não tem avaliador", () => {
    const src = ler("src/app/api/publico/avaliar-editor/route.ts")
    expect(src).toContain('origem: "qr_publico"')
    expect(src).toContain("avaliadorId: null")
    expect(src).not.toMatch(/origem:\s*(body|parsed|dados)\./)
  })

  it("a página pública de QR não bate mais na rota autenticada", () => {
    // Ela apontava para /api/editores/[id]/avaliar, que o middleware nunca
    // liberou sem sessão: o visitante levava 401 e a tela nunca carregava.
    const pagina = ler("src/app/(public)/avaliar-editor/[editorId]/page.tsx")
    expect(pagina).toContain("/api/publico/avaliar-editor")
    // A checagem é sobre o `fetch`, não sobre o texto: o comentário que explica
    // a mudança cita a rota antiga de propósito.
    expect(pagina).not.toMatch(/fetch\(\s*[`"'][^`"']*\/api\/editores\//)
  })
})

// ── Credenciais do Trello têm dono ──────────────────────────────────────────
//
// `findFirst({ ativo: true })` entregava a primeira linha da tabela a qualquer
// empresa, e a queda para as variáveis de ambiente mandava todo mundo para o
// mesmo board. Agora existe um caminho só, e ele confere o dono.
describe("Trello lê a config por um caminho único", () => {
  const rotas = [
    "src/app/api/configuracoes/trello/lists/route.ts",
    "src/app/api/configuracoes/trello/import/route.ts",
    "src/app/api/configuracoes/trello/sync/route.ts",
  ]

  for (const rota of rotas) {
    it(`${rota} usa configTrelloDaOrg`, () => {
      const src = ler(rota)
      expect(src).toContain("configTrelloDaOrg")
      expect(src).not.toContain("prisma.configTrello")
      expect(src).not.toContain("process.env.TRELLO_")
    })
  }

  it("o helper confere a organização antes de devolver credencial", () => {
    const src = ler("src/lib/trello-config.ts")
    expect(src).toContain("dona.id !== organizacaoId")
    // A credencial só existe no ramo em que o dono bate.
    const posConfere = src.slice(src.indexOf("dona.id !== organizacaoId"))
    expect(posConfere.indexOf("apiKey")).toBeGreaterThan(0)
  })
})

// ── O callback do transcode não sai da demanda do arquivo ───────────────────
describe("callback de transcode", () => {
  it("tira a demanda do arquivo, não do corpo", () => {
    const src = ler("src/app/api/transcode/callback/route.ts")
    expect(src).toContain("const alvoDemandaId = arq.demandaId")
    // O updateMany de aprovações filtrava só por URL, varrendo a tabela inteira.
    expect(src).toMatch(/aprovacaoVideo\.updateMany\(\{\s*\n\s*where:\s*\{\s*demandaId: alvoDemandaId/)
  })
})

// ── Etiqueta de empresa ─────────────────────────────────────────────────────
describe("temMaisDeUmaEmpresa", () => {
  const a = { empresa: { nome: "Contourline", slug: "contourline" } }
  const b = { empresa: { nome: "Giovani Gomes", slug: "giovani" } }

  it("é falso com uma empresa só — a etiqueta não teria o que dizer", () => {
    expect(temMaisDeUmaEmpresa([a, a, a])).toBe(false)
  })

  it("é verdadeiro quando a lista mistura", () => {
    expect(temMaisDeUmaEmpresa([a, b])).toBe(true)
  })

  it("ignora item sem empresa em vez de contá-lo como uma a mais", () => {
    expect(temMaisDeUmaEmpresa([a, { empresa: null }, { empresa: undefined }])).toBe(false)
    expect(temMaisDeUmaEmpresa([])).toBe(false)
  })
})

// ── A allowlist de tenancy diz por quê ──────────────────────────────────────
describe("allowlist de tenancy", () => {
  const lista = JSON.parse(ler("scripts/tenancy-allowlist.json"))

  it("separa dívida de global-por-desenho", () => {
    expect(lista.permitidas).toBeTypeOf("object")
    expect(lista.justificadas).toBeTypeOf("object")
    expect(Array.isArray(lista.permitidas)).toBe(false)
  })

  it("toda entrada tem motivo escrito", () => {
    const entradas = [
      ...Object.entries(lista.permitidas as Record<string, string>),
      ...Object.entries(lista.justificadas as Record<string, string>),
    ]
    expect(entradas.length).toBeGreaterThan(0)
    for (const [caminho, motivo] of entradas) {
      expect(motivo.trim(), caminho).not.toBe("")
    }
  })
})
