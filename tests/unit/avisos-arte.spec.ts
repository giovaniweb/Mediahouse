import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { arteDoKanban, artesLigadas, chaveComArte, escolherArte, FAMILIAS_ARTE, familiaDaSaida, type FamiliaArte } from "@/lib/avisos-arte"
import { destinatariosDoAviso, STATUS_COM_AVISO_KANBAN } from "@/lib/kanban-avisos"
import { imagemDoAviso } from "@/lib/avisos-arte-imagem"

const FAMILIAS = Object.keys(FAMILIAS_ARTE) as FamiliaArte[]
const saida = (chave: string, destinatarioTipo = "usuario", origem = "legado", regraContexto?: unknown) =>
  ({ chave, destinatarioTipo, origem, regraContexto })

afterEach(() => vi.unstubAllEnvs())

describe("artes dos avisos: catálogo", () => {
  it("toda cena que o sorteio pode escolher existe em public/avisos/cenas", () => {
    for (const f of FAMILIAS) {
      const { arquivo, cenas } = FAMILIAS_ARTE[f]
      for (let k = 1; k <= cenas; k++) expect(existsSync(join("public/avisos/cenas", `${arquivo}-${k}.jpg`)), `${arquivo}-${k}`).toBe(true)
      expect(FAMILIAS_ARTE[f].frases.length).toBeGreaterThan(1)
    }
  })

  it("mesma semente, mesma arte; sementes diferentes variam cena e frase", () => {
    expect(escolherArte("fila", "s1")).toEqual(escolherArte("fila", "s1"))
    const escolhas = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(escolherArte("ajuste", `s${i}`))))
    expect(escolhas.size).toBeGreaterThan(5)
    const cenas = new Set(Array.from({ length: 60 }, (_, i) => escolherArte("design", `d${i}`).arquivo))
    expect(cenas.size).toBe(6)
  })

  it("liga só com WHATSAPP_ARTES=ligado", () => {
    vi.stubEnv("WHATSAPP_ARTES", "")
    expect(artesLigadas()).toBe(false)
    vi.stubEnv("WHATSAPP_ARTES", "sim")
    expect(artesLigadas()).toBe(false)
    vi.stubEnv("WHATSAPP_ARTES", "ligado")
    expect(artesLigadas()).toBe(true)
  })
})

describe("artes dos avisos: quem recebe qual", () => {
  it("chave com arte cabe no limite e é lida de volta", () => {
    const chave = chaveComArte("aguardando", "a".repeat(64))
    expect(chave.length).toBeLessThanOrEqual(128)
    expect(familiaDaSaida(saida(chave))).toBe("aguardando")
    expect(chaveComArte(null, "abc")).toBe("abc")
    expect(familiaDaSaida(saida("arte:inventada:abc"))).toBeNull()
  })

  it("cliente, inbox e quem não é da equipe nunca recebem arte", () => {
    expect(familiaDaSaida(saida(chaveComArte("fila", "x"), "cliente"))).toBeNull()
    expect(familiaDaSaida(saida(chaveComArte("fila", "x"), "inbox"))).toBeNull()
    expect(familiaDaSaida(saida("grav:g1:confirmada:2026-11-11:cliente:abc"))).toBeNull()
    expect(familiaDaSaida(saida("grav:g1:concluida:2026-11-11:solicitante:abc"))).toBeNull()
    expect(familiaDaSaida(saida("abc123"))).toBeNull()
    expect(familiaDaSaida(saida("manual:uuid", "usuario", "manual"))).toBeNull()
  })

  it("gravação externa, convite e regras da rotina", () => {
    expect(familiaDaSaida(saida("grav:g1:confirmada:2026-11-11:operacao:abc"))).toBe("confirmou")
    expect(familiaDaSaida(saida("grav:g1:nota_lote:3:2026-11-11:operacao:abc"))).toBe("nota")
    expect(familiaDaSaida(saida("grav:g1:material_parcial:2026-11-11:operacao:abc"))).toBe("material")
    expect(familiaDaSaida(saida("grav:g1:cancelada:2026-11-11:videomaker:abc", "videomaker"))).toBe("ruim")
    expect(familiaDaSaida(saida("convite:c1", "videomaker"))).toBe("gravacao")
    expect(familiaDaSaida(saida("regra:v1:h", "editor", "regra", { tipo: "demanda", id: "d", revisao: "r", regra: "prazo_vencido" }))).toBe("ruim")
    expect(familiaDaSaida(saida("regra:v1:h", "videomaker", "regra", { tipo: "gravacao", id: "g", revisao: "r", regra: "vespera" }))).toBe("gravacao")
    expect(familiaDaSaida(saida("regra:v1:h", "usuario", "regra", { tipo: "gestor", id: "g", revisao: "r", regra: "briefing" }))).toBeNull()
  })

  it("kanban: quem pediu fica sem arte; quem produz e a gestão recebem", () => {
    for (const status of STATUS_COM_AVISO_KANBAN) expect(arteDoKanban(status, "solicitante"), status).toBeNull()
    expect(arteDoKanban("revisao_pendente", "gestor")).toBe("aguardando")
    expect(arteDoKanban("edicao_finalizada", "gestor")).toBe("aguardando")
    expect(arteDoKanban("edicao_finalizada", "editor")).toBe("finalizou")
    expect(arteDoKanban("ajuste_solicitado", "editor")).toBe("ajuste")
    expect(arteDoKanban("editando", "executor", true)).toBe("design")
    expect(arteDoKanban("videomaker_notificado", "videomaker")).toBe("gravacao")
    for (const status of STATUS_COM_AVISO_KANBAN) expect(arteDoKanban(status, "gestor"), status).not.toBeNull()
  })

  it("destinatariosDoAviso entrega a arte junto, e nunca ao solicitante", () => {
    const avisos = destinatariosDoAviso({
      statusNovo: "aprovado", codigo: "VOP-1", titulo: "Corte", telefoneVideomaker: "5511911110001", telefoneEditor: "5511911110002",
      telefonesExecutores: [], telefoneSolicitanteSistema: "5511911110003", telefoneSolicitanteWhatsapp: null,
      telefonesGestores: ["5511911110004"], telefonesSocial: [], autorTelefone: null, autorNome: "Ana", autorEhGestor: true,
    })
    expect(avisos.map(a => [a.papel, a.arte])).toEqual([
      ["videomaker", "aprovado"], ["editor", "aprovado"], ["solicitante", null], ["gestor", "aprovado"],
    ])
  })
})

describe("artes dos avisos: imagem", () => {
  it("desenha um PNG quadrado com a frase", async () => {
    const img = await imagemDoAviso("fila", "teste")
    const png = Buffer.from(img.base64, "base64")
    expect(png.subarray(1, 4).toString()).toBe("PNG")
    expect(png.readUInt32BE(16)).toBe(600)
    expect(png.readUInt32BE(20)).toBe(600)
    expect(png.length).toBeLessThan(900_000)
    const pasta = process.env.PREVIA_ARTES
    if (pasta) {
      // Prévia para olhar a olho: PREVIA_ARTES=<pasta> npx vitest run tests/unit/avisos-arte.spec.ts
      await mkdir(pasta, { recursive: true })
      for (const f of FAMILIAS) for (const s of ["a", "b"]) {
        const i = await imagemDoAviso(f, `${f}-${s}`)
        await writeFile(join(pasta, `${f}-${s}.png`), Buffer.from(i.base64, "base64"))
      }
    }
  }, 60_000)
})
