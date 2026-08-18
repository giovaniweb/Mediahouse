import { describe, it, expect } from "vitest"
import { TIPOS_PENDENTES, TIPOS_FATO, DIAS_ATE_EXPIRAR_FATO, ehTipoConhecido } from "@/lib/alertas"

// Cada tipo de pendência tem que saber dizer quando ainda vale e quando não vale
// mais. É o par que importa: um predicado que só devolve `true` fecha nada (é o
// bug que deixou 706 alertas ativos), e um que só devolve `false` apaga alerta
// legítimo.

const vale = (tipo: string, ctx: Parameters<(typeof TIPOS_PENDENTES)[string]>[0]) =>
  TIPOS_PENDENTES[tipo](ctx)

describe("aprovacao_pendente / urgencia_pendente", () => {
  it("vale enquanto a demanda espera decisão", () => {
    expect(vale("aprovacao_pendente", { statusDemanda: "aguardando_aprovacao_interna" })).toBe(true)
    expect(vale("urgencia_pendente", { statusDemanda: "urgencia_pendente_aprovacao" })).toBe(true)
  })

  it("deixa de valer quando a demanda foi aprovada", () => {
    // Este é o caso concreto: 172 dos 173 alertas ativos em 18/08/2026 estavam
    // exatamente aqui — demanda já aprovada, alerta ainda aberto.
    expect(vale("aprovacao_pendente", { statusDemanda: "aguardando_triagem" })).toBe(false)
    expect(vale("urgencia_pendente", { statusDemanda: "urgencia_aprovada" })).toBe(false)
  })

  it("deixa de valer quando a demanda foi recusada", () => {
    expect(vale("aprovacao_pendente", { statusDemanda: "encerrado" })).toBe(false)
  })

  it("deixa de valer quando a demanda não existe mais", () => {
    expect(vale("aprovacao_pendente", { statusDemanda: undefined })).toBe(false)
  })
})

describe("ajuste_solicitado", () => {
  it("vale enquanto o ajuste está pedido", () => {
    expect(vale("ajuste_solicitado", { statusDemanda: "ajuste_solicitado" })).toBe(true)
  })

  it("deixa de valer quando o ajuste foi feito", () => {
    expect(vale("ajuste_solicitado", { statusDemanda: "editando" })).toBe(false)
    expect(vale("ajuste_solicitado", { statusDemanda: "aprovado" })).toBe(false)
  })
})

describe("pagamento_pendente", () => {
  it("vale enquanto a NF espera decisão de aprovação", () => {
    expect(vale("pagamento_pendente", { temCustoAguardandoDecisao: true })).toBe(true)
  })

  it("deixa de valer assim que alguém decide, sem esperar o dinheiro sair", () => {
    // O alerta é sobre a DECISÃO. Amarrá-lo a `pago` deixaria o aviso aberto
    // por semanas depois de o gestor já ter aprovado.
    expect(vale("pagamento_pendente", { temCustoAguardandoDecisao: false })).toBe(false)
  })

  it("deixa de valer se a demanda sumiu (sem contexto de custo)", () => {
    expect(vale("pagamento_pendente", { temCustoAguardandoDecisao: undefined })).toBe(false)
  })
})

describe("demanda_parada", () => {
  const criado = new Date("2026-08-10T12:00:00Z")

  it("vale enquanto ninguém mexeu na demanda depois do alerta", () => {
    expect(vale("demanda_parada", {
      statusDemanda: "aguardando_triagem",
      alertaCriadoEm: criado,
      demandaMexidaEm: new Date("2026-08-01T12:00:00Z"),
    })).toBe(true)
  })

  it("deixa de valer no instante em que a demanda anda", () => {
    // Sem isto o alerta era imortal: demanda destravada, aviso de pé. Eram 274
    // assim na base.
    expect(vale("demanda_parada", {
      statusDemanda: "editando",
      alertaCriadoEm: criado,
      demandaMexidaEm: new Date("2026-08-15T12:00:00Z"),
    })).toBe(false)
  })

  it("deixa de valer quando encerrada ou apagada", () => {
    expect(vale("demanda_parada", { statusDemanda: "encerrado" })).toBe(false)
    expect(vale("demanda_parada", { statusDemanda: undefined })).toBe(false)
  })
})

describe("tipos que a IA inventa", () => {
  it("os que o código declara são reconhecidos", () => {
    expect(ehTipoConhecido("aprovacao_pendente")).toBe(true)
    expect(ehTipoConhecido("video_aprovado")).toBe(true)
  })

  it("os que a IA cria não são — e é por isso que precisam expirar", () => {
    // `criar_alerta` grava `tipoAlerta: input.tipo`: a string vem do modelo.
    // Estes existem na base e não aparecem em lugar nenhum do código.
    for (const inventado of [
      "capacidade_baixa", "sobrecarga_editor", "processo_falho",
      "processo_quebrado", "dados_incompletos", "cadastro_incompleto",
      "demandas_sem_prazo", "gestor_sem_telefone",
    ]) {
      expect(ehTipoConhecido(inventado)).toBe(false)
    }
  })
})

describe("alertas de WhatsApp", () => {
  it("valem enquanto o WhatsApp estiver fora do ar", () => {
    expect(vale("whatsapp_desconectado", { whatsappConectado: false })).toBe(true)
    expect(vale("whatsapp_webhook_rejeitado", { whatsappConectado: false })).toBe(true)
  })

  it("deixam de valer quando reconecta", () => {
    expect(vale("whatsapp_desconectado", { whatsappConectado: true })).toBe(false)
    expect(vale("whatsapp_webhook_rejeitado", { whatsappConectado: true })).toBe(false)
  })
})

describe("separação entre pendência e fato", () => {
  it("nenhum tipo está nas duas listas", () => {
    // Um tipo em ambas seria fechado por dois critérios diferentes, e o
    // resultado dependeria da ordem — bug silencioso.
    const nos_dois = TIPOS_FATO.filter((t) => t in TIPOS_PENDENTES)
    expect(nos_dois).toEqual([])
  })

  it("os fatos que entopem a lista estão cobertos", () => {
    // Estes quatro somavam a maior parte dos alertas ativos da base.
    expect(TIPOS_FATO).toContain("video_aprovado")
    expect(TIPOS_FATO).toContain("nova_demanda_audiovisual")
    expect(TIPOS_FATO).toContain("demanda_externa")
    expect(TIPOS_FATO).toContain("mencao_comentario")
  })

  it("fato expira em prazo curto o bastante para não virar entulho", () => {
    expect(DIAS_ATE_EXPIRAR_FATO).toBeLessThanOrEqual(14)
    expect(DIAS_ATE_EXPIRAR_FATO).toBeGreaterThan(0)
  })
})
