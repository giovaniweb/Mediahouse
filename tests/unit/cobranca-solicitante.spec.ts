// Cobrança diária a quem pediu (25/11/2026): a parte pura — qual coluna se
// cobra, qual arte vai em qual vez, o texto, a chave de ambiente e quem pode
// receber a arte. A parte com banco está em tests/integration/cobranca-solicitante.spec.ts.
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  arteDaCobranca, escolherArte, FAMILIAS_ARTE, FAMILIAS_COBRANCA, familiaDaSaida, chaveComArte,
} from "@/lib/avisos-arte"
import {
  ambienteDesligado, ambientePermite, diaUtilEmSaoPaulo, etapaDaCobranca, etapaDaRegra, REGRA_DA_ETAPA, textoDaCobranca,
} from "@/lib/cobranca-solicitante-regra"
import { categoriaDaRegra, categoriaDaSaida, demandaDaSaida } from "@/lib/avisos-categorias"
import { DISPONIVEL_NA_PLATAFORMA, PADRAO_MODULOS, ROTAS_POR_MODULO } from "@/lib/modulos"
import { imagemDoAviso } from "@/lib/avisos-arte-imagem"

afterEach(() => vi.unstubAllEnvs())

describe("cobrança a quem pediu: o que se cobra", () => {
  it("Aprovação: só o que espera quem pediu (pronto, revisão); ajuste e impedimento são da equipe", () => {
    expect(etapaDaCobranca("edicao_finalizada")).toBe("aprovar")
    expect(etapaDaCobranca("revisao_pendente")).toBe("aprovar")
    expect(etapaDaCobranca("ajuste_solicitado")).toBeNull()
    expect(etapaDaCobranca("impedimento")).toBeNull()
  })
  it("Para Postar: aprovado e postagem pendente; postado e o resto não", () => {
    expect(etapaDaCobranca("aprovado")).toBe("postar")
    expect(etapaDaCobranca("postagem_pendente")).toBe("postar")
    for (const s of ["postado", "entregue_cliente", "editando", "pedido_criado", null]) expect(etapaDaCobranca(s)).toBeNull()
  })
  it("regra da fila ↔ etapa", () => {
    expect(etapaDaRegra(REGRA_DA_ETAPA.aprovar)).toBe("aprovar")
    expect(etapaDaRegra(REGRA_DA_ETAPA.postar)).toBe("postar")
    expect(etapaDaRegra("prazo_vencido")).toBeNull()
  })
  it("nasce desligada: módulo existe, mas o padrão de empresa é desligado e sem rota própria", () => {
    expect(DISPONIVEL_NA_PLATAFORMA.cobranca).toBe(true)
    expect(PADRAO_MODULOS.cobranca).toBe(false)
    expect(ROTAS_POR_MODULO.cobranca).toEqual([])
  })
  it("só de segunda a sexta (horário de São Paulo)", () => {
    expect(diaUtilEmSaoPaulo(new Date("2026-11-25T12:00:00Z"))).toBe(true) // quarta
    expect(diaUtilEmSaoPaulo(new Date("2026-11-28T12:00:00Z"))).toBe(false) // sábado
    expect(diaUtilEmSaoPaulo(new Date("2026-11-30T02:00:00Z"))).toBe(false) // domingo 23h em SP
  })
})

describe("cobrança a quem pediu: chave de ambiente", () => {
  it("vazia ou ligado: vale o módulo da empresa", () => {
    expect(ambientePermite("5511999990000", undefined)).toBe(true)
    expect(ambientePermite("5511999990000", "ligado")).toBe(true)
    expect(ambienteDesligado(undefined)).toBe(false)
  })
  it("desligado corta todos", () => {
    expect(ambientePermite("5511999990000", "desligado")).toBe(false)
    expect(ambienteDesligado("desligado")).toBe(true)
  })
  it("teste: só os números da lista, pelos 8 últimos dígitos", () => {
    expect(ambientePermite("5511999990000", "teste:11 99999-0000")).toBe(true)
    expect(ambientePermite("5511988880000", "teste:11999990000")).toBe(false)
    expect(ambientePermite(null, "teste:11999990000")).toBe(false)
    expect(ambienteDesligado("teste:11999990000")).toBe(false)
  })
})

describe("cobrança a quem pediu: arte de brincadeira", () => {
  it("a 1ª vai só no texto; da 2ª em diante alterna SPC e SERASA", () => {
    expect(arteDaCobranca(1, "audiovisual", "aprovar")).toBeNull()
    expect(arteDaCobranca(2, "audiovisual", "aprovar")).toBe("videospc_aprovar")
    expect(arteDaCobranca(3, "audiovisual", "aprovar")).toBe("videoserasa_aprovar")
    expect(arteDaCobranca(4, "audiovisual", "postar")).toBe("videospc_postar")
  })
  it("arte do Growth (área design) é Arte*; o resto, Video*", () => {
    expect(arteDaCobranca(2, "design", "aprovar")).toBe("artespc_aprovar")
    expect(arteDaCobranca(3, "design", "postar")).toBe("arteserasa_postar")
    expect(arteDaCobranca(2, null, "postar")).toBe("videospc_postar")
  })
  it("são 8 famílias, todas com o galo da cobrança e o carimbo do nome inventado", () => {
    expect(FAMILIAS_COBRANCA).toHaveLength(8)
    for (const f of FAMILIAS_COBRANCA) {
      const familia = FAMILIAS_ARTE[f]
      expect(familia.arquivo, f).toBe("13")
      expect(familia.selo?.titulo, f).toMatch(/^(Video|Arte)(SPC|SERASA)$/)
      // A frase fala do nome inventado certo (Video* para vídeo, Arte* para arte).
      for (const frase of familia.frases) expect(frase, f).toContain(familia.selo!.titulo)
      expect(escolherArte(f, "x").selo).toEqual(familia.selo)
    }
  })
  it("tom de brincadeira: o carimbo diz que é brincadeira e nenhuma frase ameaça", async () => {
    const proibidas = /process|justiça|protest|negativ|dívida|divida|multa|cobran[çc]a judicial/i
    for (const f of FAMILIAS_COBRANCA) for (const frase of FAMILIAS_ARTE[f].frases) expect(frase).not.toMatch(proibidas)
    const img = await imagemDoAviso("videospc_aprovar", "teste")
    const png = Buffer.from(img.base64, "base64")
    expect(png.subarray(1, 4).toString()).toBe("PNG")
    expect(img.escolha.selo?.titulo).toBe("VideoSPC")
  }, 30_000)
  it("pela rotina, a arte vem do contexto e vai a quem pediu (usuário da equipe)", () => {
    const ctx = { tipo: "solicitante", id: "d1", revisao: "2026-11-25:2", regra: REGRA_DA_ETAPA.aprovar, arte: "videospc_aprovar" }
    expect(familiaDaSaida({ chave: "regra:v1:abc", destinatarioTipo: "usuario", origem: "regra", regraContexto: ctx })).toBe("videospc_aprovar")
    const primeira = { ...ctx, revisao: "2026-11-25:1", arte: undefined }
    expect(familiaDaSaida({ chave: "regra:v1:abc", destinatarioTipo: "usuario", origem: "regra", regraContexto: primeira })).toBeNull()
  })
  it("número digitado recebe a arte da cobrança, e nenhuma outra", () => {
    const chave = chaveComArte("artespc_postar", "envio-manual:1")
    expect(familiaDaSaida({ chave, destinatarioTipo: "envio_manual", origem: "manual" })).toBe("artespc_postar")
    expect(familiaDaSaida({ chave: chaveComArte("aprovado", "envio-manual:1"), destinatarioTipo: "envio_manual", origem: "manual" })).toBeNull()
    expect(familiaDaSaida({ chave: "envio-manual:1", destinatarioTipo: "envio_manual", origem: "manual" })).toBeNull()
  })
})

describe("cobrança a quem pediu: preferências de aviso", () => {
  it("entra em Prazos e cobranças e o recorte enxerga o card", () => {
    expect(categoriaDaRegra("cobranca_aprovacao")).toBe("prazos")
    expect(categoriaDaRegra("cobranca_postagem")).toBe("prazos")
    const s = { origem: "regra", chave: "regra:v1:x", referencia: "d1", regraContexto: { tipo: "solicitante", id: "d1", regra: "cobranca_postagem" } }
    expect(categoriaDaSaida(s)).toBe("prazos")
    expect(demandaDaSaida(s)).toBe("d1")
  })
})

describe("cobrança a quem pediu: texto", () => {
  const base = { codigo: "VOP-26-0002", titulo: "Body health", link: "https://nuflow.space/aprovar/t", nome: "Ana Souza", peca: "video" as const }
  it("aprovar: link, primeiro nome e, a partir da 2ª, o número do lembrete", () => {
    const t1 = textoDaCobranca({ ...base, etapa: "aprovar", vez: 1 })
    expect(t1).toContain("Olá, Ana!")
    expect(t1).toContain("https://nuflow.space/aprovar/t")
    expect(t1).not.toContain("Lembrete")
    expect(textoDaCobranca({ ...base, etapa: "aprovar", vez: 3 })).toContain("Lembrete nº 3")
  })
  it("postar: confirma sem login; arte do Growth no feminino", () => {
    const t = textoDaCobranca({ ...base, etapa: "postar", vez: 1, peca: "arte", link: "https://nuflow.space/postado/t" })
    expect(t).toContain("A arte de *Body health*")
    expect(t).toContain("aprovada")
    expect(t).toContain("sem login")
  })
  it("sem link de aprovação, diz que é no NuFlow", () => {
    expect(textoDaCobranca({ ...base, etapa: "aprovar", vez: 1, linkDeLogin: true, link: "https://nuflow.space/demandas/d1" })).toContain("no NuFlow")
  })
})
