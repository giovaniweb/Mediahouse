import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Dois pedidos do Giovani (05/11/2026) para Gravações Externas:
// 1. "na hora de encontra um videomaker tinha que ter uma pesquisa por nome ou
//    cidade, um campo de pesquisa que fica na lista, a medida que for
//    escrevendo vai filtrando";
// 2. "organizar os card de acordo com vencimento, por exemplo card A vence hoje
//    e Card B vence amanha. O card A fica em cima do card B".
import { casaComABusca, filtrarGrupos, semAcento, textoDaOpcao, type GrupoDaLista } from "@/lib/busca-na-lista"
import { ordenarColuna, vencimentoNoQuadro, type CardParaOrdenar } from "@/lib/vencimento-no-quadro"
import { EscolhaComBusca } from "@/components/ui/EscolhaComBusca"

const grupos: GrupoDaLista[] = [
  { rotulo: "Externos (freelance)", opcoes: [
    { value: "vm:1", label: "Alan Souza", detalhe: "Curitiba" },
    { value: "vm:2", label: "João Pereira", detalhe: "São Paulo" },
    { value: "vm:3", label: "Ana Lúcia", detalhe: "Curitiba" },
    { value: "vm:4", label: "Ana Beatriz", detalhe: "Florianópolis" },
  ] },
  { rotulo: "Internos / Social", opcoes: [
    { value: "user:9", label: "Mariana Curi", detalhe: "Social media", extra: " (usuário)" },
  ] },
]
const nomes = (g: GrupoDaLista[]) => g.flatMap((x) => x.opcoes.map((o) => o.label))

describe("a busca na lista de videomaker", () => {
  it("acha pela cidade, a cada letra", () => {
    expect(nomes(filtrarGrupos(grupos, "c"))).toEqual(["Alan Souza", "Ana Lúcia", "Mariana Curi"])
    expect(nomes(filtrarGrupos(grupos, "cur"))).toEqual(["Alan Souza", "Ana Lúcia", "Mariana Curi"])
    expect(nomes(filtrarGrupos(grupos, "curitiba"))).toEqual(["Alan Souza", "Ana Lúcia"])
  })

  it("não diferencia acento nem maiúscula, nos dois sentidos", () => {
    expect(nomes(filtrarGrupos(grupos, "sao paulo"))).toEqual(["João Pereira"])
    expect(nomes(filtrarGrupos(grupos, "JOAO"))).toEqual(["João Pereira"])
    expect(nomes(filtrarGrupos(grupos, "Florianopolis"))).toEqual(["Ana Beatriz"])
    expect(nomes(filtrarGrupos(grupos, "lúcia"))).toEqual(["Ana Lúcia"])
    expect(nomes(filtrarGrupos(grupos, "CUR"))).toEqual(nomes(filtrarGrupos(grupos, "cur")))
    expect(semAcento("São Paulo · ÇÃO")).toBe("sao paulo · cao")
  })

  it("acha pelo nome, e com duas palavras as duas precisam aparecer", () => {
    expect(nomes(filtrarGrupos(grupos, "ana"))).toEqual(["Ana Lúcia", "Ana Beatriz", "Mariana Curi"])
    expect(nomes(filtrarGrupos(grupos, "ana cur"))).toEqual(["Ana Lúcia", "Mariana Curi"])
    expect(nomes(filtrarGrupos(grupos, "  ana   flor "))).toEqual(["Ana Beatriz"])
  })

  it("o grupo sem ninguém some; busca vazia mostra tudo; a marca \"(usuário)\" não entra", () => {
    expect(filtrarGrupos(grupos, "sao").map((g) => g.rotulo)).toEqual(["Externos (freelance)"])
    expect(filtrarGrupos(grupos, "   ")).toEqual(grupos)
    expect(filtrarGrupos(grupos, "usuario")).toEqual([])
    expect(casaComABusca({ value: "x", label: "Sem cidade" }, "sem")).toBe(true)
  })

  it("o texto é o mesmo do <select> de antes", () => {
    expect(textoDaOpcao(grupos[0].opcoes[1])).toBe("João Pereira · São Paulo")
    expect(textoDaOpcao(grupos[1].opcoes[0])).toBe("Mariana Curi · Social media (usuário)")
    expect(textoDaOpcao({ value: "x", label: "Só nome" })).toBe("Só nome")
  })

  it("fechada, a lista mostra a escolha como antes; sem escolha, a opção vazia", () => {
    const html = (value: string, rotuloAtual?: string) => renderToStaticMarkup(createElement(EscolhaComBusca, {
      value, onChange: () => {}, grupos, vazio: "— Sem videomaker —", rotuloAtual, ariaLabel: "Videomaker (Captação)",
    }))
    expect(html("vm:2")).toContain("João Pereira · São Paulo")
    expect(html("vm:2")).toContain('aria-haspopup="listbox"')
    expect(html("vm:2")).toContain('aria-expanded="false"')
    expect(html("")).toContain("— Sem videomaker —")
    // O videomaker do card que não está mais na lista continua com o nome.
    expect(html("vm:999", "Carlos Antigo")).toContain("Carlos Antigo")
  })
})

describe("a ordem do quadro: o que vence primeiro fica em cima", () => {
  // 05/11/2026, meio-dia em São Paulo.
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T15:00:00Z")) })
  afterAll(() => { vi.useRealTimers() })

  const card = (codigo: string, c: Partial<CardParaOrdenar> = {}): CardParaOrdenar => ({ codigo, prioridade: "normal", statusVisivel: "producao", ...c })
  const codigos = (l: CardParaOrdenar[]) => l.map((c) => c.codigo)
  // Horários em UTC: 12h UTC = 9h em São Paulo.
  const as = (dia: string, horaSP: number) => `${dia}T${String(horaSP + 3).padStart(2, "0")}:00:00.000Z`

  it("antes da gravação: hoje às 9h, depois hoje às 14h, depois amanhã (o exemplo do Giovani)", () => {
    const cards = [
      card("B-amanha", { dataCaptacao: as("2026-11-06", 9) }),
      card("A-hoje-14h", { dataCaptacao: as("2026-11-05", 14) }),
      card("A-hoje-9h", { dataCaptacao: as("2026-11-05", 9) }),
    ]
    expect(codigos(ordenarColuna(cards, "agendado"))).toEqual(["A-hoje-9h", "A-hoje-14h", "B-amanha"])
    expect(codigos(ordenarColuna(cards, "a_agendar"))).toEqual(["A-hoje-9h", "A-hoje-14h", "B-amanha"])
  })

  it("no mesmo dia, sem hora vai depois das que têm; sem data vai para o fim", () => {
    const cards = [
      card("sem-data"),
      card("dia-sem-hora", { dataCaptacao: "2026-11-05T00:00:00.000Z" }),
      card("dia-17h", { dataCaptacao: as("2026-11-05", 17) }),
    ]
    expect(codigos(ordenarColuna(cards, "agendado"))).toEqual(["dia-17h", "dia-sem-hora", "sem-data"])
    expect(vencimentoNoQuadro(cards[1], "agendado")).toBe("2026-11-05T24:00")
    expect(vencimentoNoQuadro(cards[0], "agendado")).toBeNull()
  })

  it("a hora do pedido público (dataEvento) conta quando a captação não tem hora", () => {
    const cards = [
      card("captacao-10h", { dataCaptacao: as("2026-11-07", 10) }),
      card("evento-8h", { dataCaptacao: "2026-11-07T00:00:00.000Z", dataEvento: as("2026-11-07", 8) }),
    ]
    expect(codigos(ordenarColuna(cards, "agendado"))).toEqual(["evento-8h", "captacao-10h"])
  })

  it("atrasado fica no topo, do que venceu primeiro, em qualquer coluna", () => {
    const cards = [
      card("hoje-9h", { dataCaptacao: as("2026-11-05", 9) }),
      card("atrasado-ontem", { dataLimite: "2026-11-04T00:00:00.000Z", dataCaptacao: as("2026-11-20", 9) }),
      card("atrasado-mes-passado", { dataLimite: "2026-10-01T00:00:00.000Z" }),
    ]
    expect(codigos(ordenarColuna(cards, "agendado"))).toEqual(["atrasado-mes-passado", "atrasado-ontem", "hoje-9h"])
    // Prazo pausado (com o cliente) não é atraso.
    const pausado = card("pausado", { dataLimite: "2026-10-01T00:00:00.000Z", statusVisivel: "aprovacao" })
    expect(codigos(ordenarColuna([pausado, card("amanha", { dataLimite: "2026-11-06T00:00:00.000Z" })], "para_enviar")))
      .toEqual(["pausado", "amanha"])
  })

  it("depois da gravação vale o prazo; sem prazo no fim, quem gravou primeiro em cima", () => {
    const cards = [
      card("sem-prazo-gravou-19-10", { dataCaptacao: as("2026-10-19", 15) }),
      card("prazo-dia-10", { dataLimite: "2026-11-10T00:00:00.000Z" }),
      card("sem-prazo-gravou-22-09", { dataCaptacao: as("2026-09-22", 6) }),
      card("prazo-hoje", { dataLimite: "2026-11-05T00:00:00.000Z" }),
    ]
    expect(codigos(ordenarColuna(cards, "em_edicao"))).toEqual(["prazo-hoje", "prazo-dia-10", "sem-prazo-gravou-22-09", "sem-prazo-gravou-19-10"])
    expect(codigos(ordenarColuna(cards, "para_enviar"))).toEqual(["prazo-hoje", "prazo-dia-10", "sem-prazo-gravou-22-09", "sem-prazo-gravou-19-10"])
  })

  it("urgente só desempata: a data manda", () => {
    const cards = [
      card("urgente-amanha", { prioridade: "urgente", dataCaptacao: as("2026-11-06", 9) }),
      card("normal-hoje", { dataCaptacao: as("2026-11-05", 16) }),
      card("urgente-hoje-mesma-hora", { prioridade: "urgente", dataCaptacao: as("2026-11-05", 16) }),
    ]
    expect(codigos(ordenarColuna(cards, "agendado"))).toEqual(["urgente-hoje-mesma-hora", "normal-hoje", "urgente-amanha"])
  })

  it("Concluído não vence: a gravação mais recente fica em cima, sem data no fim", () => {
    const cards = [
      card("marco", { dataLimite: "2026-03-06T00:00:00.000Z", statusVisivel: "finalizado" }),
      card("set", { dataCaptacao: as("2026-09-29", 9), statusVisivel: "finalizado" }),
      card("out", { dataCaptacao: as("2026-10-23", 19), statusVisivel: "finalizado" }),
    ]
    expect(codigos(ordenarColuna(cards, "concluido"))).toEqual(["out", "set", "marco"])
  })

  it("não mexe na lista recebida, e o empate final é pelo código (a ordem não pula a cada recarga)", () => {
    const cards = [card("VOP-2"), card("VOP-1")]
    expect(codigos(ordenarColuna(cards, "em_edicao"))).toEqual(["VOP-1", "VOP-2"])
    expect(codigos(cards)).toEqual(["VOP-2", "VOP-1"])
  })
})
