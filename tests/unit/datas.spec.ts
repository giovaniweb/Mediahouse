import { describe, it, expect, vi, afterEach } from "vitest"
import { validarPrazo, hojeEmSaoPaulo, dataEmSaoPaulo, dataCalendario, mesmoDia, somarDias, somarMeses } from "@/lib/datas"

afterEach(() => vi.useRealTimers())

describe("hojeEmSaoPaulo", () => {
  it("às 22h de Brasília ainda é hoje — não amanhã", () => {
    // 2026-08-11 22:00 BRT = 2026-08-12 01:00 UTC. Usar toISOString() aqui
    // devolveria 12/08 e faria um prazo para hoje ser recusado como passado.
    const instante = new Date("2026-08-12T01:00:00.000Z")
    expect(hojeEmSaoPaulo(instante)).toBe("2026-08-11")
  })

  it("logo depois da meia-noite de Brasília já é o dia novo", () => {
    const instante = new Date("2026-08-12T03:30:00.000Z") // 00:30 BRT do dia 12
    expect(hojeEmSaoPaulo(instante)).toBe("2026-08-12")
  })
})

describe("dataEmSaoPaulo", () => {
  it("evento de dia inteiro às 21h não escorrega para o dia seguinte", () => {
    // É o bug da exportação .ics: 13/08 21h BRT = 14/08 00h UTC, e o
    // compromisso aparecia um dia depois na agenda de quem importava.
    expect(dataEmSaoPaulo(new Date("2026-08-14T00:00:00.000Z"))).toBe("2026-08-13")
  })
})

describe("dataCalendario", () => {
  it("lê a parte de data de um ISO completo sem deslocar o dia", () => {
    // O formulário envia new Date("2026-08-13").toISOString() → meia-noite UTC.
    // Converter para o fuso local daria 12/08; queremos 13/08.
    expect(dataCalendario("2026-08-13T00:00:00.000Z")).toBe("2026-08-13")
  })

  it("aceita data pura YYYY-MM-DD", () => {
    expect(dataCalendario("2026-08-13")).toBe("2026-08-13")
  })

  it("devolve null para texto que não é data", () => {
    expect(dataCalendario("abacaxi")).toBeNull()
    expect(dataCalendario("")).toBeNull()
  })
})

describe("validarPrazo", () => {
  const hoje = "2026-08-12"

  it("aceita o próprio dia de hoje", () => {
    expect(validarPrazo("2026-08-12", hoje).ok).toBe(true)
  })

  it("aceita data futura", () => {
    expect(validarPrazo("2026-12-01", hoje).ok).toBe(true)
  })

  it("recusa ontem", () => {
    const r = validarPrazo("2026-08-11", hoje)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain("não pode ser anterior a hoje")
  })

  it("recusa o caso real que passou: prazo de 2004 numa demanda de 2026", () => {
    // A checagem antiga só exigia ano entre 2000 e 2100, então 2004 passava.
    const r = validarPrazo("2004-08-13", hoje)
    expect(r.ok).toBe(false)
  })

  it("recusa ano com dígito faltando (0026)", () => {
    expect(validarPrazo("0026-06-29", hoje).ok).toBe(false)
  })

  it("recusa ano absurdo no futuro", () => {
    const r = validarPrazo("9999-01-01", hoje)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain("dígito")
  })

  it("ausência de prazo é válida — demanda sem prazo existe", () => {
    expect(validarPrazo(null, hoje).ok).toBe(true)
    expect(validarPrazo(undefined, hoje).ok).toBe(true)
    expect(validarPrazo("", hoje).ok).toBe(true)
  })

  it("recusa texto que não é data", () => {
    expect(validarPrazo("mês que vem", hoje).ok).toBe(false)
  })

  it("a mensagem mostra a data em formato brasileiro", () => {
    const r = validarPrazo("2026-08-01", hoje)
    if (!r.ok) expect(r.motivo).toContain("12/08/2026")
  })

  it("usa o dia de hoje quando nenhuma referência é passada", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-12T15:00:00.000Z"))
    expect(validarPrazo("2026-08-12").ok).toBe(true)
    expect(validarPrazo("2026-08-11").ok).toBe(false)
  })
})

describe("mesmoDia", () => {
  it("reconhece o prazo inalterado, mesmo vindo como Date do banco e string do form", () => {
    // É o que evita barrar a edição do título de uma demanda com prazo vencido.
    expect(mesmoDia("2026-08-13", new Date("2026-08-13T00:00:00.000Z"))).toBe(true)
  })

  it("dois vazios são o mesmo (prazo continua ausente)", () => {
    expect(mesmoDia(null, undefined)).toBe(true)
  })

  it("preencher um prazo antes ausente conta como mudança", () => {
    expect(mesmoDia(null, "2026-08-13")).toBe(false)
  })

  it("datas diferentes não são o mesmo dia", () => {
    expect(mesmoDia("2026-08-13", "2026-08-14")).toBe(false)
  })
})

describe("somarDias e somarMeses", () => {
  it("atravessa a virada do mês", () => {
    expect(somarDias("2026-08-31", 1)).toBe("2026-09-01")
  })

  it("atravessa a virada do ano", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("volta três meses", () => {
    expect(somarMeses("2026-08-12", -3)).toBe("2026-05-12")
  })

  it("DTEND de evento de dia inteiro aponta para o dia seguinte (regra do iCal)", () => {
    expect(somarDias("2026-08-13", 1)).toBe("2026-08-14")
  })
})
