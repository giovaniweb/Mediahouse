import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { combinacoesDaFamilia, areaDoGestor, arteDoKanban, arteDoRelatorio, artesLigadas, chaveComArte, escolherArte, FAMILIAS_ARTE, familiaDaSaida, humorDoBriefing, humorDoSemanal, type FamiliaArte } from "@/lib/avisos-arte"
import { destinatariosDoAviso, STATUS_COM_AVISO_KANBAN } from "@/lib/kanban-avisos"
import { imagemDoAviso } from "@/lib/avisos-arte-imagem"

const FAMILIAS = Object.keys(FAMILIAS_ARTE) as FamiliaArte[]
const saida = (chave: string, destinatarioTipo = "usuario", origem = "legado", regraContexto?: unknown) =>
  ({ chave, destinatarioTipo, origem, regraContexto })

afterEach(() => vi.unstubAllEnvs())

describe("artes dos avisos: catálogo", () => {
  it("toda cena que o sorteio pode escolher existe em public/avisos/cenas", () => {
    for (const f of FAMILIAS) {
      const { arquivo, cenas, arquivos } = FAMILIAS_ARTE[f]
      if (arquivos) expect(arquivos.length, f).toBe(cenas)
      for (let k = 1; k <= cenas; k++) {
        const nome = arquivos?.[k - 1] ?? `${arquivo}-${k}`
        expect(existsSync(join("public/avisos/cenas", `${nome}.jpg`)), nome).toBe(true)
      }
      expect(FAMILIAS_ARTE[f].frases.length).toBeGreaterThan(1)
    }
  })

  it("mesma semente, mesma arte; sementes diferentes variam cena e frase", () => {
    expect(escolherArte("fila", "s1")).toEqual(escolherArte("fila", "s1"))
    const escolhas = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(escolherArte("ajuste", `s${i}`))))
    expect(escolhas.size).toBeGreaterThan(5)
    const cenas = new Set(Array.from({ length: 60 }, (_, i) => escolherArte("design", `d${i}`).arquivo))
    expect(cenas.size).toBe(7)
  })

  it("parabéns: centenas de combinações, colegas de outra área de visita falando por si", () => {
    for (const f of ["parabens_capivara", "parabens_polvo", "parabens_camaleao", "parabens_coelho", "parabens_papagaio"] as const)
      expect(combinacoesDaFamilia(f), f).toBeGreaterThanOrEqual(100)
    const vistos = new Map<string, Set<string>>()
    for (let i = 0; i < 400; i++) {
      const e = escolherArte("parabens_coelho", `p${i}`)
      if (!vistos.has(e.arquivo)) vistos.set(e.arquivo, new Set())
      vistos.get(e.arquivo)!.add(e.frase)
      // A cena do polvo (27-*) só sai com fala do polvo; a do próprio coelho (29-*), nunca com fala de visita.
      if (e.arquivo.startsWith("27-")) expect(e.frase).toMatch(/polvo|videomaker|audiovisual|Paraaaa-béns|Parabéns!/)
      if (e.arquivo.startsWith("29-")) expect(e.frase).not.toMatch(/Vim lá do|Até o|aprovou\. E/)
    }
    expect([...vistos.keys()].some(k => k.startsWith("27-"))).toBe(true) // o polvo foi até o Growth
    expect([...vistos.keys()].some(k => k.startsWith("29-"))).toBe(true)
    expect(FAMILIAS_ARTE.parabens_coelho.frases).toContain("Parabéns! Nota 2. Mas é um 2 bonito.")
    const visitaDoPolvo = FAMILIAS_ARTE.parabens_coelho.frasesDaCena![FAMILIAS_ARTE.parabens_coelho.arquivos!.indexOf("27-1") + 1]
    expect(visitaDoPolvo).toContain("Paraaaa-béns! Tão bom que podia ser até um videomaker.")
    for (const f of FAMILIAS) for (const fr of [...FAMILIAS_ARTE[f].frases, ...Object.values(FAMILIAS_ARTE[f].frasesDaCena ?? {}).flat()])
      expect(fr.length, fr).toBeLessThanOrEqual(64)
  })

  it("cena de meme de IA só sai com a frase dela", () => {
    const especiais = FAMILIAS_ARTE.social.frasesDaCena![7]
    let viu = false
    for (let i = 0; i < 200; i++) {
      const e = escolherArte("social", `s${i}`)
      if (e.arquivo === "15-7.jpg") { viu = true; expect(especiais).toContain(e.frase) }
      else expect(FAMILIAS_ARTE.social.frases).toContain(e.frase)
    }
    expect(viu).toBe(true)
    for (const f of FAMILIAS) for (const k of Object.keys(FAMILIAS_ARTE[f].frasesDaCena ?? {}))
      expect(Number(k), `${f}:${k}`).toBeLessThanOrEqual(FAMILIAS_ARTE[f].cenas)
  })

  it("liga só com WHATSAPP_ARTES=ligado", () => {
    vi.stubEnv("WHATSAPP_ARTES", "")
    expect(artesLigadas()).toBe(false)
    vi.stubEnv("WHATSAPP_ARTES", "sim")
    expect(artesLigadas()).toBe(false)
    vi.stubEnv("WHATSAPP_ARTES", "ligado")
    expect(artesLigadas()).toBe(true)
  })

  it("modo teste liga só para os números da lista", () => {
    vi.stubEnv("WHATSAPP_ARTES", "teste:5511911112222, 5521933334444")
    expect(artesLigadas("5511911112222")).toBe(true)
    expect(artesLigadas("551111112222")).toBe(true) // sem o 9º dígito
    expect(artesLigadas("5521933334444")).toBe(true)
    expect(artesLigadas("5511955556666")).toBe(false)
    expect(artesLigadas(null)).toBe(false)
    expect(artesLigadas()).toBe(false)
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
    // O aviso de vídeo enviado ao cliente (concluída), pela fila: nunca com arte.
    expect(familiaDaSaida(saida("grav:g1:concluida:2026-11-11:cliente:abc", "cliente", "manual"))).toBeNull()
    expect(familiaDaSaida(saida("abc123"))).toBeNull()
    expect(familiaDaSaida(saida("manual:uuid", "usuario", "manual"))).toBeNull()
  })

  it("gravação externa, convite e regras da rotina", () => {
    expect(familiaDaSaida(saida("grav:g1:confirmada:2026-11-11:operacao:abc"))).toBe("confirmou")
    expect(familiaDaSaida(saida("grav:g1:nota_lote:3:2026-11-11:operacao:abc"))).toBe("nota")
    expect(familiaDaSaida(saida("grav:g1:material_parcial:2026-11-11:operacao:abc"))).toBe("material")
    expect(familiaDaSaida(saida("grav:g1:cancelada:2026-11-11:videomaker:abc", "videomaker"))).toBe("ruim")
    expect(familiaDaSaida(saida("convite:c1", "videomaker"))).toBe("gravacao")
    expect(familiaDaSaida(saida("grav:g1:concluida:2026-11-12:videomaker:abc", "videomaker"))).toBe("parabens_polvo")
    expect(familiaDaSaida(saida("grav:g1:concluida:2026-11-12:operacao:abc"))).toBe("finalizou")
    expect(familiaDaSaida(saida(chaveComArte("parabens_coelho", "parabens:d1:11110001")))).toBe("parabens_coelho")
    expect(familiaDaSaida(saida("regra:v1:h", "editor", "regra", { tipo: "demanda", id: "d", revisao: "r", regra: "prazo_vencido" }))).toBe("ruim")
    expect(familiaDaSaida(saida("regra:v1:h", "videomaker", "regra", { tipo: "gravacao", id: "g", revisao: "r", regra: "vespera" }))).toBe("gravacao")
    expect(familiaDaSaida(saida("regra:v1:h", "usuario", "regra", { tipo: "gestor", id: "g", revisao: "r", regra: "briefing" }))).toBeNull()
  })

  it("relatórios: a cena vem do contexto e depende da área e dos números", () => {
    expect(humorDoBriefing(0)).toBe("ok")
    expect(humorDoBriefing(3)).toBe("cansado")
    expect(humorDoBriefing(12)).toBe("apuros")
    expect(humorDoSemanal(10, 10)).toBe("ok")
    expect(humorDoSemanal(10, 6)).toBe("cansado")
    expect(humorDoSemanal(10, 2)).toBe("apuros")
    expect(humorDoSemanal(0, 0)).toBe("ok")
    expect(areaDoGestor({ areas: ["growth"] })).toBe("gr")
    expect(areaDoGestor({ areas: ["growth", "audiovisual"] })).toBe("av")
    expect(areaDoGestor({ areas: [], funcaoProfissional: "Social Media" })).toBe("so")
    expect(areaDoGestor(undefined)).toBe("av")
    const arte = arteDoRelatorio("so", "apuros")
    expect(familiaDaSaida(saida("regra:v1:h", "usuario", "regra", { tipo: "gestor", id: "g", revisao: "r", regra: "briefing", arte }))).toBe("rel_so_apuros")
    expect(familiaDaSaida(saida("regra:v1:h", "usuario", "regra", { tipo: "gestor", id: "g", revisao: "r", regra: "briefing", arte: "inventada" }))).toBeNull()
  })

  it("Growth: peça visual é do camaleão, o resto do coelho; postar é do papagaio", () => {
    expect(arteDoKanban("editando", "executor", true, true)).toBe("design")
    expect(arteDoKanban("editando", "executor", true, false)).toBe("growth")
    expect(arteDoKanban("fila_edicao", "gestor", true, false)).toBe("growth")
    expect(arteDoKanban("ajuste_solicitado", "executor", true, false)).toBe("ajuste")
    expect(arteDoKanban("postagem_pendente", "social")).toBe("social")
    expect(arteDoKanban("postado", "gestor")).toBe("social")
    expect(arteDoKanban("postado", "solicitante")).toBeNull()
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
