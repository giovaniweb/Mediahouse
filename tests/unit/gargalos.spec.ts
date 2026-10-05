import { describe, expect, it } from "vitest"
import { calcularGargalos, entradaNaEtapa, FLUXO_GROWTH, type DemandaNaEtapa, type TrocaDeStatus } from "@/lib/gargalos"

const dia = (n: number) => new Date(Date.UTC(2026, 9, n, 12))
const job = (id: string, etapa: string, criado = dia(1)): DemandaNaEtapa =>
  ({ id, codigo: id.toUpperCase(), etapa, createdAt: criado })
const troca = (demandaId: string, statusAnterior: string | null, statusNovo: string, em: Date): TrocaDeStatus =>
  ({ demandaId, statusAnterior, statusNovo, createdAt: em })

describe("entradaNaEtapa", () => {
  it("job sem troca nenhuma na Entrada entrou quando nasceu", () => {
    expect(entradaNaEtapa(job("a", "entrada", dia(2)), [])).toEqual(dia(2))
  })

  it("fora da Entrada, sem histórico não há data", () => {
    expect(entradaNaEtapa(job("a", "producao"), [])).toBeNull()
  })

  it("conta da troca que trouxe o job para a etapa, não das trocas dentro dela", () => {
    const t = [
      troca("a", "aguardando_triagem", "planejamento", dia(3)),
      troca("a", "planejamento", "videomaker_notificado", dia(5)),
    ]
    expect(entradaNaEtapa(job("a", "producao"), t)).toEqual(dia(3))
  })

  it("eventos que não são status não mudam a entrada", () => {
    const t = [
      troca("a", "planejamento", "editor_atribuido", dia(4)),
      troca("a", null, "responsavel_alterado", dia(6)),
      troca("a", null, "edicao_campos", dia(7)),
    ]
    expect(entradaNaEtapa(job("a", "edicao"), t)).toEqual(dia(4))
  })

  it("job que saiu e voltou conta da última volta", () => {
    const t = [
      troca("a", "editando", "revisao_pendente", dia(2)),
      troca("a", "revisao_pendente", "editando", dia(4)),
      troca("a", "editando", "revisao_pendente", dia(8)),
    ]
    expect(entradaNaEtapa(job("a", "aprovacao"), t)).toEqual(dia(8))
  })

  it("histórico que não fecha com o status atual não vira data", () => {
    const t = [troca("a", "aguardando_triagem", "planejamento", dia(3))]
    expect(entradaNaEtapa(job("a", "edicao"), t)).toBeNull()
  })

  it("histórico todo na etapa: nasceu nela, a menos que a primeira troca venha de outra", () => {
    const nasceu = [troca("a", null, "aguardando_triagem", dia(3))]
    expect(entradaNaEtapa(job("a", "entrada", dia(1)), nasceu)).toEqual(dia(1))
    const veio = [troca("b", "brutos_enviados", "fila_edicao", dia(5))]
    expect(entradaNaEtapa(job("b", "edicao", dia(1)), veio)).toEqual(dia(5))
  })
})

describe("calcularGargalos", () => {
  it("uma linha por etapa ativa, na ordem do quadro, sem Finalizado", () => {
    const r = calcularGargalos([job("f", "finalizado")], [], dia(10))
    expect(r.map((g) => g.etapa)).toEqual(["entrada", "producao", "edicao", "aprovacao", "para_postar"])
    expect(r.every((g) => g.demandas === 0 && g.diasMedios === null && g.maisAntiga === null)).toBe(true)
  })

  it("média, mais antigo e jobs sem data", () => {
    const demandas = [job("a", "entrada", dia(1)), job("b", "entrada", dia(7)), job("c", "producao"), job("d", "producao")]
    const trocas = [troca("c", "aguardando_triagem", "planejamento", dia(8))]
    const [entrada, producao] = calcularGargalos(demandas, trocas, dia(10))
    expect(entrada).toMatchObject({ label: "Entrada", demandas: 2, diasMedios: 6, semHistorico: 0, maisAntiga: { codigo: "A", dias: 9 } })
    expect(producao).toMatchObject({ demandas: 2, diasMedios: 2, semHistorico: 1, maisAntiga: { codigo: "C", dias: 2 } })
  })

  it("arredonda a média para uma casa e aceita trocas fora de ordem", () => {
    const trocas = [
      troca("a", "editando", "revisao_pendente", new Date(Date.UTC(2026, 9, 8, 0))),
      troca("a", "fila_edicao", "editando", dia(2)),
    ]
    const aprovacao = calcularGargalos([job("a", "aprovacao")], trocas, dia(10)).find((g) => g.etapa === "aprovacao")
    expect(aprovacao?.diasMedios).toBe(2.5)
  })

  it("Growth: colunas próprias, agrupando o statusInterno do histórico", () => {
    const r = calcularGargalos([], [], dia(10), FLUXO_GROWTH)
    expect(r.map((g) => g.label)).toEqual(["Backlog", "Briefing", "Para fazer", "Fazendo", "Para aprovação", "Programado", "Impedimento"])
    // editando e ajuste_solicitado são a mesma coluna "Fazendo": a volta do
    // ajuste não reinicia a contagem.
    const trocas = [
      troca("a", "fila_edicao", "editando", dia(3)),
      troca("a", "editando", "ajuste_solicitado", dia(6)),
    ]
    const fazendo = calcularGargalos([job("a", "fazendo")], trocas, dia(10), FLUXO_GROWTH).find((g) => g.etapa === "fazendo")
    expect(fazendo).toMatchObject({ demandas: 1, diasMedios: 7, semHistorico: 0 })
    // Backlog sem troca nenhuma: nasceu lá.
    expect(entradaNaEtapa(job("b", "backlog", dia(4)), [], FLUXO_GROWTH)).toEqual(dia(4))
  })
})
