import { describe, it, expect } from "vitest"
import { StatusInterno } from "@prisma/client"
import {
  ETAPAS,
  ETAPA_DO_STATUS,
  ehEdicaoDaGravacao,
  etapaDaGravacao,
  faltaOMaterial,
  materialChegouAgora,
  passoDaGravacao,
  situacaoDaNota,
  statusAoSoltar,
} from "@/lib/etapas-da-gravacao"

describe("etapas de Gravações Externas", () => {
  it("todo status do banco cai numa etapa que existe", () => {
    const ids = ETAPAS.map((e) => e.id)
    for (const status of Object.values(StatusInterno)) {
      expect(ids, `${status} sem etapa`).toContain(ETAPA_DO_STATUS[status])
    }
  })

  it("antes da edição: a agendar até alguém confirmar, agendado até o material chegar", () => {
    expect(etapaDaGravacao({ statusInterno: "planejamento" })).toBe("a_agendar")
    expect(etapaDaGravacao({ statusInterno: "videomaker_notificado" })).toBe("a_agendar")
    expect(etapaDaGravacao({ statusInterno: "videomaker_aceitou" })).toBe("agendado")
    expect(etapaDaGravacao({ statusInterno: "captacao_realizada" })).toBe("agendado")
    expect(etapaDaGravacao({ statusInterno: "brutos_enviados" })).toBe("em_edicao")
  })

  it("revisão e ajuste ainda são edição; aprovado é para enviar", () => {
    expect(etapaDaGravacao({ statusInterno: "revisao_pendente" })).toBe("em_edicao")
    expect(etapaDaGravacao({ statusInterno: "ajuste_solicitado" })).toBe("em_edicao")
    expect(etapaDaGravacao({ statusInterno: "aprovado" })).toBe("para_enviar")
    expect(etapaDaGravacao({ statusInterno: "entregue_cliente" })).toBe("concluido")
  })

  it("status desconhecido não some do quadro: fica em A agendar", () => {
    expect(etapaDaGravacao({ statusInterno: "inventado" })).toBe("a_agendar")
  })

  it("Em edição: chegando de antes é o material que chegou; voltando é edição de novo", () => {
    expect(statusAoSoltar("em_edicao", "agendado")).toBe("brutos_enviados")
    expect(statusAoSoltar("em_edicao", "a_agendar")).toBe("brutos_enviados")
    expect(statusAoSoltar("em_edicao", "para_enviar")).toBe("editando")
    expect(statusAoSoltar("para_enviar", "agendado")).toBe("aprovado")
  })

  it("todo status aplicado ao soltar fica na etapa em que o card foi solto", () => {
    for (const destino of ETAPAS) {
      for (const origem of ETAPAS) {
        if (origem.id === destino.id) continue
        expect(etapaDaGravacao({ statusInterno: statusAoSoltar(destino.id, origem.id) }), `${origem.id}→${destino.id}`).toBe(destino.id)
      }
    }
  })
})

describe("quando a nota do videomaker é pedida", () => {
  it("material bruto ou editado chegando pede a nota", () => {
    expect(materialChegouAgora("captacao_realizada", "brutos_enviados")).toBe(true)
    expect(materialChegouAgora("captacao_realizada", "aprovado")).toBe(true)
    expect(materialChegouAgora("captacao_agendada", "entregue_cliente")).toBe(true)
  })

  it("andar dentro da edição, voltar ou encerrar sem entrega não pede", () => {
    expect(materialChegouAgora("editando", "aprovado")).toBe(false)
    expect(materialChegouAgora("aprovado", "editando")).toBe(false)
    expect(materialChegouAgora("captacao_agendada", "videomaker_aceitou")).toBe(false)
    expect(materialChegouAgora("captacao_realizada", "encerrado")).toBe(false)
  })
})

describe("linha da nota no card", () => {
  const base = { videomakerId: "vm-1", custos: [], notasFiscais: [] }

  it("sem permissão (a API não manda) ou sem videomaker, não mostra nada", () => {
    expect(situacaoDaNota({ statusInterno: "editando", videomakerId: "vm-1" })).toBeNull()
    expect(situacaoDaNota({ ...base, statusInterno: "editando", videomakerId: null })).toBeNull()
  })

  it("antes do material, a nota ainda não foi pedida", () => {
    expect(situacaoDaNota({ ...base, statusInterno: "captacao_realizada" })).toBeNull()
  })

  it("material chegou e nada da nota: falta", () => {
    expect(situacaoDaNota({ ...base, statusInterno: "brutos_enviados" })).toEqual({ texto: "Falta a nota", tom: "falta" })
  })

  it("a nota segue o pagamento até o fim", () => {
    const comCusto = (statusPagamento: string, pago = false) => situacaoDaNota({ ...base, statusInterno: "editando", custos: [{ statusPagamento, pago }] })?.texto
    expect(comCusto("pendente_nf")).toBe("Falta a nota")
    expect(comCusto("nf_enviada")).toBe("Nota recebida")
    expect(comCusto("aguardando_pagamento")).toBe("Pagamento programado")
    expect(comCusto("contestado")).toBe("Nota contestada")
    expect(comCusto("pendente_nf", true)).toBe("Videomaker pago")
    expect(comCusto("pago")).toBe("Videomaker pago")
  })

  it("nota enviada pelo link antes do custo existir já conta como recebida", () => {
    expect(situacaoDaNota({ ...base, statusInterno: "editando", notasFiscais: [{ status: "enviada" }] })?.texto).toBe("Nota recebida")
  })

  it("encerrado sem entrega e sem nota não cobra nota", () => {
    expect(situacaoDaNota({ ...base, statusInterno: "encerrado" })).toBeNull()
  })
})

describe("falta o material — a etiqueta que substituiu a coluna \"Gravado\"", () => {
  const hoje = "2026-10-28"
  it("agendado com o dia já passado, ou o videomaker marcou que gravou", () => {
    expect(faltaOMaterial({ statusInterno: "captacao_agendada", dataCaptacao: "2026-10-27T17:00:00.000Z" }, hoje)).toBe(true)
    expect(faltaOMaterial({ statusInterno: "captacao_realizada" }, hoje)).toBe(true)
  })
  it("hoje, no futuro, sem data ou fora do agendado, não", () => {
    expect(faltaOMaterial({ statusInterno: "captacao_agendada", dataCaptacao: "2026-10-28T17:00:00.000Z" }, hoje)).toBe(false)
    expect(faltaOMaterial({ statusInterno: "captacao_agendada", dataEvento: "2026-11-02T00:00:00.000Z" }, hoje)).toBe(false)
    expect(faltaOMaterial({ statusInterno: "videomaker_aceitou" }, hoje)).toBe(false)
    expect(faltaOMaterial({ statusInterno: "planejamento", dataCaptacao: "2026-10-01T17:00:00.000Z" }, hoje)).toBe(false)
    expect(faltaOMaterial({ statusInterno: "brutos_enviados", dataCaptacao: "2026-10-01T17:00:00.000Z" }, hoje)).toBe(false)
  })
})

describe("próximo passo do card aberto", () => {
  it("um passo por etapa, na ordem do trabalho", () => {
    expect(passoDaGravacao({ statusInterno: "aguardando_triagem", videomakerId: null })).toBe("escalar")
    expect(passoDaGravacao({ statusInterno: "videomaker_notificado", videomakerId: "vm" })).toBe("confirmar")
    expect(passoDaGravacao({ statusInterno: "captacao_agendada", videomakerId: "vm" })).toBe("material")
    expect(passoDaGravacao({ statusInterno: "editando", videomakerId: "vm" })).toBe("edicao")
    expect(passoDaGravacao({ statusInterno: "aprovado", videomakerId: "vm" })).toBe("enviar")
    expect(passoDaGravacao({ statusInterno: "entregue_cliente", videomakerId: "vm" })).toBe("concluido")
  })
})

describe("quem edita", () => {
  it("só os três combinados valem", () => {
    expect(["videomaker", "equipe", "sem_edicao"].every(ehEdicaoDaGravacao)).toBe(true)
    expect(ehEdicaoDaGravacao("cliente")).toBe(false)
    expect(ehEdicaoDaGravacao(null)).toBe(false)
  })
})
