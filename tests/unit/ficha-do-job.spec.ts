import { describe, expect, it } from "vitest"
import {
  deCampoDataHora,
  diaComHorarioMantido,
  diaDoCampo,
  distanciaDoMomento,
  lerMomento,
  linkWhatsapp,
  momentoDoJob,
  ondeDoJob,
  origemDaConversao,
  paraCampoDataHora,
  rotuloDoMomento,
  situacaoDaEquipe,
  telefoneLegivel,
} from "@/lib/ficha-do-job"
import { descricaoDaConversao } from "@/lib/job-fase"

describe("quando é a gravação", () => {
  it("instante: dia e hora de Brasília, mesmo quando o dia UTC já virou", () => {
    // 22:30 em Brasília é 01:30 UTC do dia seguinte.
    expect(lerMomento("2026-10-31T01:30:00.000Z")).toEqual({ dia: "2026-10-30", hora: "22:30" })
    expect(lerMomento(new Date("2026-10-31T14:00:00-03:00"))).toEqual({ dia: "2026-10-31", hora: "14:00" })
  })

  it("só o dia (meia-noite UTC): não vira 21:00 do dia anterior", () => {
    expect(lerMomento("2026-10-31T00:00:00.000Z")).toEqual({ dia: "2026-10-31", hora: null })
  })

  it("vazio ou inválido não tem momento", () => {
    expect(lerMomento(null)).toBeNull()
    expect(lerMomento("não é data")).toBeNull()
  })

  it("captação vence; sem ela vale o evento do pedido público", () => {
    expect(momentoDoJob({ dataEvento: "2026-11-02T13:00:00.000Z" })).toEqual({ dia: "2026-11-02", hora: "10:00" })
    expect(momentoDoJob({ dataCaptacao: "2026-11-05T00:00:00.000Z", dataEvento: "2026-11-02T13:00:00.000Z" }))
      .toEqual({ dia: "2026-11-05", hora: null })
  })

  it("captação só com o dia herda a hora do evento no mesmo dia", () => {
    expect(momentoDoJob({ dataCaptacao: "2026-11-02T00:00:00.000Z", dataEvento: "2026-11-02T13:00:00.000Z" }))
      .toEqual({ dia: "2026-11-02", hora: "10:00" })
  })

  it("rótulo com dia da semana e distância de hoje", () => {
    expect(rotuloDoMomento({ dia: "2026-10-30", hora: "14:00" })).toBe("Sex, 30/10 · 14:00")
    expect(rotuloDoMomento({ dia: "2026-11-01", hora: null })).toBe("Dom, 01/11")
    const hoje = "2026-10-28"
    expect(distanciaDoMomento({ dia: "2026-10-28", hora: null }, hoje)).toBe("hoje")
    expect(distanciaDoMomento({ dia: "2026-10-29", hora: null }, hoje)).toBe("amanhã")
    expect(distanciaDoMomento({ dia: "2026-11-02", hora: null }, hoje)).toBe("em 5 dias")
    expect(distanciaDoMomento({ dia: "2026-10-27", hora: null }, hoje)).toBe("ontem")
    expect(distanciaDoMomento({ dia: "2026-10-20", hora: null }, hoje)).toBe("há 8 dias")
  })

  it("o campo de data e hora vai e volta em horário de Brasília", () => {
    expect(paraCampoDataHora({ dia: "2026-11-02", hora: "10:00" })).toBe("2026-11-02T10:00")
    expect(paraCampoDataHora(null)).toBe("")
    expect(deCampoDataHora("2026-11-02T10:00")).toBe("2026-11-02T13:00:00.000Z")
    expect(deCampoDataHora("")).toBeNull()
  })
})

describe("onde", () => {
  it("endereço da gravação, depois o do evento; cidade só se o endereço não a traz", () => {
    expect(ondeDoJob({ localEvento: "Rua A, 10, Curitiba - PR", cidade: "Curitiba" }))
      .toEqual({ endereco: "Rua A, 10, Curitiba - PR", cidade: null })
    expect(ondeDoJob({ localGravacao: "Clínica Bem Estar", localEvento: "Rua A", cidade: "Londrina" }))
      .toEqual({ endereco: "Clínica Bem Estar", cidade: "Londrina" })
  })

  it("N/A e traço contam como vazio", () => {
    expect(ondeDoJob({ localEvento: " ", cidade: "N/A" })).toEqual({ endereco: null, cidade: null })
    expect(ondeDoJob({ cidade: "—" })).toEqual({ endereco: null, cidade: null })
  })
})

describe("quem vai", () => {
  it("sem videomaker é alerta; recusa pede outro", () => {
    expect(situacaoDaEquipe("aguardando_triagem", false)).toEqual({ texto: "Ninguém escalado ainda", tom: "alerta" })
    expect(situacaoDaEquipe("videomaker_recusou", false).tom).toBe("alerta")
  })

  it("convite sem resposta espera; aceito é confirmado; depois da gravação, gravou", () => {
    expect(situacaoDaEquipe("videomaker_notificado", true).tom).toBe("espera")
    expect(situacaoDaEquipe("videomaker_aceitou", true)).toEqual({ texto: "Confirmado", tom: "ok" })
    expect(situacaoDaEquipe("captacao_agendada", true).texto).toBe("Confirmado")
    expect(situacaoDaEquipe("captacao_realizada", true).texto).toBe("Gravou")
    expect(situacaoDaEquipe("editando", true).texto).toBe("Gravou")
  })

  it("telefone legível e link do WhatsApp", () => {
    expect(telefoneLegivel("5541998765432")).toBe("(41) 99876-5432")
    expect(telefoneLegivel("4133334444")).toBe("(41) 3333-4444")
    expect(telefoneLegivel("")).toBeNull()
    expect(linkWhatsapp("(41) 99876-5432")).toBe("https://wa.me/5541998765432")
    expect(linkWhatsapp("5541998765432")).toBe("https://wa.me/5541998765432")
    expect(linkWhatsapp("123")).toBeNull()
  })
})

describe("a volta de uma conversão", () => {
  it("lê no histórico como o card foi pedido antes de virar Job", () => {
    const linha = descricaoDaConversao({ departamento: "growth", tipoVideo: "reels" }, "job")
    expect(origemDaConversao(linha)).toEqual({ departamento: "growth", tipoVideo: "reels" })
  })

  it("outras linhas, ou sem o valor de antes, não dizem nada", () => {
    expect(origemDaConversao(descricaoDaConversao({ departamento: null, tipoVideo: "reels" }, "job"))).toBeNull()
    expect(origemDaConversao(descricaoDaConversao({ departamento: "growth", tipoVideo: "reels" }, "demanda"))).toBeNull()
    expect(origemDaConversao("Demanda criada")).toBeNull()
    expect(origemDaConversao(null)).toBeNull()
  })
})

describe("o Editar geral não apaga o horário da captação", () => {
  // 31/10 às 15:00 em Brasília, como a ficha grava.
  const comHora = "2026-10-31T18:00:00.000Z"

  it("o campo de dia mostra o dia de Brasília, não o de UTC", () => {
    expect(diaDoCampo(comHora)).toBe("2026-10-31")
    expect(diaDoCampo("2026-11-01T01:30:00.000Z")).toBe("2026-10-31") // 22:30 em Brasília
    expect(diaDoCampo("2026-10-31T00:00:00.000Z")).toBe("2026-10-31") // só o dia
    expect(diaDoCampo(null)).toBe("")
  })

  it("dia igual: o campo fica fora do PUT e o horário fica", () => {
    expect(diaComHorarioMantido(comHora, "2026-10-31")).toBeUndefined()
    expect(diaComHorarioMantido(null, "")).toBeUndefined()
  })

  it("dia novo leva o mesmo horário; sem horário antes, vai só o dia", () => {
    expect(diaComHorarioMantido(comHora, "2026-11-02")).toBe("2026-11-02T18:00:00.000Z")
    expect(diaComHorarioMantido("2026-10-31T00:00:00.000Z", "2026-11-02")).toBe("2026-11-02")
    expect(diaComHorarioMantido(null, "2026-11-02")).toBe("2026-11-02")
  })

  it("apagar o dia apaga a data", () => {
    expect(diaComHorarioMantido(comHora, "")).toBeNull()
  })
})
