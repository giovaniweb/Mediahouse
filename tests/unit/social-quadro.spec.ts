import { describe, expect, it } from "vitest"
import {
  colunaDoCard, diaDaPostagem, etapaDoPedido, jaCobrouHoje, lerDataPostagem, lerIdeiaSocial, lerSugestao,
} from "@/lib/social-quadro"
import { unicas } from "@/lib/social"
import { PERMISSAO_HREF_MAP, PRESETS } from "@/lib/permissoes"

describe("etapa que a social vê", () => {
  it("seis colunas da produção viram quatro palavras", () => {
    expect(etapaDoPedido("entrada")).toBe("recebido")
    expect(etapaDoPedido("producao")).toBe("produzindo")
    expect(etapaDoPedido("edicao")).toBe("produzindo")
    expect(etapaDoPedido("aprovacao")).toBe("revisar")
    expect(etapaDoPedido("para_postar")).toBe("pronto")
    expect(etapaDoPedido("finalizado")).toBe("pronto")
  })

  it("pedido recusado na entrada não aparece como pronto", () => {
    expect(etapaDoPedido("entrada", "encerrado")).toBe("recusado")
    expect(colunaDoCard({ dataPostagem: null, demanda: { statusVisivel: "entrada", statusInterno: "encerrado" } })).toBe("equipe")
  })
})

describe("coluna do card", () => {
  it("sem pedido: data decide entre Ideias e No plano", () => {
    expect(colunaDoCard({ dataPostagem: null, demanda: null })).toBe("ideia")
    expect(colunaDoCard({ dataPostagem: "2026-10-14T00:00:00.000Z", demanda: null })).toBe("plano")
  })

  it("com pedido: Pronto só depois da aprovação", () => {
    expect(colunaDoCard({ dataPostagem: "2026-10-14", demanda: { statusVisivel: "aprovacao" } })).toBe("equipe")
    expect(colunaDoCard({ dataPostagem: "2026-10-14", demanda: { statusVisivel: "para_postar" } })).toBe("pronto")
  })
})

describe("cobrar uma vez por dia", () => {
  it("o dia é o de Brasília, não o UTC", () => {
    // 22h de Brasília do dia 5 é 01h UTC do dia 6.
    const ontemTarde = new Date("2026-10-06T01:00:00Z")
    expect(jaCobrouHoje(ontemTarde, new Date("2026-10-06T11:00:00Z"))).toBe(false)
    expect(jaCobrouHoje(new Date("2026-10-06T12:00:00Z"), new Date("2026-10-06T20:00:00Z"))).toBe(true)
    expect(jaCobrouHoje(null)).toBe(false)
  })
})

describe("data de postagem", () => {
  it("aceita hoje e o futuro, recusa o passado e ano absurdo", () => {
    expect(lerDataPostagem("2026-10-05", "2026-10-05")).toEqual({ ok: true, dia: "2026-10-05" })
    expect(lerDataPostagem("2026-10-04", "2026-10-05").ok).toBe(false)
    expect(lerDataPostagem("20261-10-04", "2026-10-05").ok).toBe(false)
    expect(lerDataPostagem("3026-10-04", "2026-10-05").ok).toBe(false)
  })

  it("coluna DATE volta como meia-noite UTC e o dia não muda", () => {
    expect(diaDaPostagem("2026-10-14T00:00:00.000Z")).toBe("2026-10-14")
    expect(diaDaPostagem(new Date("2026-10-14T00:00:00.000Z"))).toBe("2026-10-14")
  })
})

describe("salvar como ideia", () => {
  const base = { titulo: "Reels do showroom", area: "audiovisual" }

  it("só exige título e área", () => {
    const r = lerIdeiaSocial(base)
    expect(r.ok && r.dados.dataPostagem).toBe(null)
    expect(lerIdeiaSocial({ ...base, area: "x" }).ok).toBe(false)
    expect(lerIdeiaSocial({ ...base, titulo: "ab" }).ok).toBe(false)
  })

  it("a data que já passou pode ficar se não mudou", () => {
    const corpo = { ...base, dataPostagem: "2026-10-01" }
    expect(lerIdeiaSocial(corpo, { hoje: "2026-10-05" }).ok).toBe(false)
    expect(lerIdeiaSocial(corpo, { hoje: "2026-10-05", dataAtual: "2026-10-01" }).ok).toBe(true)
  })

  it("recusa formulário gigante", () => {
    expect(lerIdeiaSocial({ ...base, formulario: { x: "a".repeat(30_000) } }).ok).toBe(false)
  })
})

describe("mandar para a social", () => {
  it("título é a primeira linha; o resto vira descrição", () => {
    const r = lerSugestao({ tipo: "solicitacao", linhaProjetoId: "l1", titulo: "Post do congresso\nCom as fotos do stand" })
    expect(r.ok && r.dados).toMatchObject({ solicitacao: true, titulo: "Post do congresso", descricao: "Post do congresso\nCom as fotos do stand", area: null })
  })

  it("exige tipo, linha e o que é", () => {
    expect(lerSugestao({ tipo: "ideia", titulo: "abc" }).ok).toBe(false)
    expect(lerSugestao({ tipo: "x", linhaProjetoId: "l1", titulo: "abc" }).ok).toBe(false)
    expect(lerSugestao({ tipo: "ideia", linhaProjetoId: "l1", titulo: "" }).ok).toBe(false)
  })
})

describe("quem é avisado na cobrança", () => {
  it("uma pessoa por usuário e por número", () => {
    const r = unicas([
      { usuarioId: "u1", nome: "Lucas", telefone: "+55 11 99999-1234" },
      { usuarioId: "u1", nome: "Lucas (editor)", telefone: null },
      { nome: "Lucas externo", telefone: "11999991234" },
      { usuarioId: "u2", nome: "Gestora", telefone: "11888887777" },
    ])
    expect(r.map((p) => p.nome)).toEqual(["Lucas", "Gestora"])
  })
})

describe("área Social Media no menu", () => {
  it("a social media vê a área; videomaker não", () => {
    expect(PRESETS.social.verSocial).toBe(true)
    expect(PRESETS.videomaker.verSocial).toBe(false)
    expect(PERMISSAO_HREF_MAP["/social"]).toBe("verSocial")
    expect(PERMISSAO_HREF_MAP["/social/enviar"]).toBeUndefined()
  })
})

describe("arquivo de referência guardado na ideia", () => {
  const ok = "/api/midia/org/org1/docs/ide1/1759700000000.pdf"
  it("só fica o que é desta ideia, desta empresa", async () => {
    const { anexosDaIdeia } = await import("@/lib/social-quadro")
    const formulario = { anexosIdeia: [
      { url: ok, nome: "briefing.pdf" },
      { url: "/api/midia/org/OUTRA/docs/ide1/1.pdf", nome: "de outra empresa" },
      { url: "/api/midia/org/org1/docs/OUTRA/1.pdf", nome: "de outra ideia" },
      { url: "/api/midia/org/org1/docs/ide1/../x.pdf", nome: "travessia" },
      { url: "https://site.com/x.pdf", nome: "externo" },
      "lixo",
    ] }
    expect(anexosDaIdeia(formulario, "org1", "ide1")).toEqual([{ url: ok, nome: "briefing.pdf" }])
    expect(anexosDaIdeia(null, "org1", "ide1")).toEqual([])
  })
})

describe("salvar como ideia pede título ou descrição", () => {
  it("sem título, vale a primeira linha da descrição", async () => {
    const { tituloDaIdeia } = await import("@/components/social/ideiaNoFormulario")
    expect(tituloDaIdeia("", "Vídeo do showroom novo\ncom a equipe toda")).toBe("Vídeo do showroom novo")
    expect(tituloDaIdeia("  Título  ", "descrição")).toBe("Título")
    expect(tituloDaIdeia("", "")).toBe("")
  })
})
