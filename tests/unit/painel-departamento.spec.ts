import { describe, expect, it } from "vitest"
import { acessoDasAreas, departamentosVisiveis, etapaSocial, lerDepartamento, resumoSocial, type PedidoSocial } from "@/lib/painel-departamento"
import { opcoesDePessoa, parametroDaPessoa } from "@/components/kanban/filtroPessoa"
import { lerPeriodo, valorPeriodo } from "@/components/kanban/FiltrosQuadro"

const HOJE = "2026-10-05"
const pedido = (id: string, statusVisivel: string, extra: Partial<PedidoSocial> = {}): PedidoSocial => ({
  id, codigo: id.toUpperCase(), titulo: id, statusVisivel, statusInterno: null,
  dataLimite: null, linha: "Linha A", ultimaMudanca: null, ...extra,
})

describe("departamentosVisiveis", () => {
  it("gestor vê os três; sem o módulo Growth, o Growth some", () => {
    expect(departamentosVisiveis({ tipo: "gestor", membership: { areas: [] } })).toEqual(["audiovisual", "growth", "social"])
    expect(departamentosVisiveis({ tipo: "admin", membership: null, modulos: { growth: false } })).toEqual(["audiovisual", "social"])
  })
  it("admin pelo papel na empresa vê os três mesmo com o tipo legado de outra coisa", () => {
    const me = { tipo: "solicitante", membership: { papel: "admin", areas: ["audiovisual"] }, permissoes: { verSocial: false, verDesign: false } }
    expect(departamentosVisiveis(me)).toEqual(["audiovisual", "growth", "social"])
    expect(acessoDasAreas(me)?.gestor).toBe(true)
  })
  it("perfil carregando ou com erro: lista vazia, e a página não troca de área", () => {
    expect(departamentosVisiveis(undefined)).toEqual([])
    expect(departamentosVisiveis({ error: "Não autorizado" } as never)).toEqual([])
    expect(acessoDasAreas(null)).toBeNull()
  })
  it("quem atua só no Growth não vê o Audiovisual; a social vê a área dela", () => {
    expect(departamentosVisiveis({ tipo: "equipe", membership: { areas: ["growth"] } })).toEqual(["growth"])
    expect(departamentosVisiveis({ tipo: "equipe", membership: { papel: "social", areas: ["growth"] } })).toEqual(["growth", "social"])
    expect(departamentosVisiveis({ tipo: "equipe", membership: { areas: ["audiovisual"] }, permissoes: { verSocial: true } })).toEqual(["audiovisual", "social"])
  })
  it("ninguém fica sem departamento", () => {
    expect(departamentosVisiveis({ tipo: "equipe", membership: { areas: ["eventos"] } })).toEqual(["audiovisual"])
  })
  it("lerDepartamento: vazio é Audiovisual, desconhecido é inválido", () => {
    expect(lerDepartamento(null)).toBe("audiovisual")
    expect(lerDepartamento("social")).toBe("social")
    expect(lerDepartamento("design")).toBeNull()
  })
})

describe("painel da Social Media", () => {
  it("as seis colunas viram quatro palavras; recusado e finalizado ficam de fora", () => {
    expect(["entrada", "producao", "edicao", "aprovacao", "para_postar"].map((s) => etapaSocial(s)))
      .toEqual(["recebido", "produzindo", "produzindo", "revisar", "pronto"])
    expect(etapaSocial("entrada", "encerrado")).toBeNull()
    expect(etapaSocial("finalizado")).toBeNull()
  })

  it("conta por etapa, atrasados pelo prazo e parados pela última mudança", () => {
    const r = resumoSocial([
      pedido("a", "entrada", { dataLimite: "2026-10-01T00:00:00.000Z", ultimaMudanca: "2026-09-28T15:00:00.000Z" }),
      pedido("b", "edicao", { ultimaMudanca: "2026-10-02T12:00:00.000Z" }), // 3 dias: parado
      pedido("c", "edicao", { ultimaMudanca: "2026-10-03T12:00:00.000Z" }), // 2 dias: não
      pedido("d", "aprovacao", { dataLimite: "2026-09-01T00:00:00.000Z" }), // prazo suspenso na revisão
      pedido("e", "para_postar", { ultimaMudanca: "2026-09-01T12:00:00.000Z" }), // pronto não é parado
      pedido("f", "entrada", { statusInterno: "encerrado" }), // recusado
    ], HOJE)
    expect(r.etapas.map((e) => [e.id, e.demandas])).toEqual([["recebido", 1], ["produzindo", 2], ["revisar", 1], ["pronto", 1]])
    expect(r.comEquipe).toBe(4)
    expect(r.atrasados).toEqual([{ id: "a", codigo: "A", titulo: "a", linha: "Linha A", etapa: "Recebido", dias: 4 }])
    expect(r.parados.map((p) => [p.id, p.dias])).toEqual([["a", 7], ["b", 3]])
  })
})

describe("filtros do quadro", () => {
  it("Pessoa: uma lista só, e o prefixo diz qual parâmetro a API recebe", () => {
    const opcoes = opcoesDePessoa([
      { papel: "ed", id: "1", nome: "Bruno", funcao: "Editor" },
      { papel: "vm", id: "2", nome: "Ana", funcao: "Videomaker" },
    ])
    expect(opcoes).toEqual([{ valor: "vm:2", rotulo: "Ana · Videomaker" }, { valor: "ed:1", rotulo: "Bruno · Editor" }])
    expect(parametroDaPessoa("vm:2")).toEqual(["videomakerId", "2"])
    expect(parametroDaPessoa("us:abc")).toEqual(["responsavelId", "abc"])
    expect(parametroDaPessoa("xx:1")).toBeNull()
    expect(parametroDaPessoa("")).toBeNull()
  })
  it("período guarda os dois lados num valor só, e um lado pode faltar", () => {
    expect(valorPeriodo("", "")).toBe("")
    expect(lerPeriodo(valorPeriodo("2026-10-01", ""))).toEqual({ de: "2026-10-01", ate: "" })
    expect(lerPeriodo("")).toEqual({ de: "", ate: "" })
  })
})
