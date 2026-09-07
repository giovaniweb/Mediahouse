import { describe, it, expect, vi } from "vitest"
// Import de RUNTIME, ao contrário do módulo sob teste (que usa `import type`
// para não arrastar o Prisma para o bundle do navegador). O objeto do enum é o
// que permite enumerar os 27 valores sem repetir a lista à mão — e uma lista
// repetida à mão é exatamente o que deixaria de pegar o 28º status.
import { StatusInterno } from "@prisma/client"
import {
  FASES_ORDEM,
  FASE_DE_STATUS,
  FASE_LABEL,
  aguardandoPublicacao,
  ehBloqueado,
  ehCancelado,
  ehTerminal,
  faseDoJob,
  ordemDaFase,
  publicacaoDoJob,
  type JobFase,
} from "@/lib/job-fase"

const TODOS = Object.values(StatusInterno)

// ─────────────────────────────────────────────────────────────────────────────
// A TRAVA
//
// O pedido era explícito: o teste tem que FALHAR se alguém criar um
// StatusInterno novo sem mapeá-lo. `Record<StatusInterno, JobFase>` já impede
// isso no compilador, mas `tsc` não roda em todo caminho — e um mapa incompleto
// que chega em produção devolve `undefined` como fase, que vira card sem coluna.
//
// Por isso a verificação é em runtime, enumerando o enum gerado pelo Prisma:
// a fonte da lista é o schema, não uma cópia dentro do teste.
// ─────────────────────────────────────────────────────────────────────────────
describe("exaustividade do mapeamento", () => {
  it("os 27 valores de StatusInterno estão mapeados", () => {
    // Se este número mudar, o schema mudou: é o lembrete de vir aqui decidir a
    // fase do status novo, em vez de descobrir pelo card quebrado.
    expect(TODOS).toHaveLength(27)

    const semMapa = TODOS.filter((s) => FASE_DE_STATUS[s] === undefined)
    expect(semMapa, `StatusInterno sem fase: ${semMapa.join(", ")}`).toEqual([])
  })

  it("nenhum valor mapeado deixou de existir no enum", () => {
    // O outro lado da trava: status removido do schema e esquecido no mapa.
    const orfaos = Object.keys(FASE_DE_STATUS).filter((k) => !TODOS.includes(k as StatusInterno))
    expect(orfaos, `no mapa mas fora do enum: ${orfaos.join(", ")}`).toEqual([])
  })

  it("toda fase atribuída é uma das seis do documento", () => {
    for (const status of TODOS) {
      expect(FASES_ORDEM, `${status} caiu numa fase inexistente`).toContain(faseDoJob(status))
    }
  })

  it("as seis fases têm rótulo e ordem", () => {
    expect(FASES_ORDEM).toHaveLength(6)
    expect(new Set(FASES_ORDEM).size).toBe(6)
    for (const fase of FASES_ORDEM) {
      expect(FASE_LABEL[fase]).toBeTruthy()
      expect(ordemDaFase(fase)).toBeGreaterThanOrEqual(0)
    }
  })

  it("cada uma das seis fases é usada por pelo menos um status", () => {
    // Uma fase sem nenhum status é uma coluna que nunca teria card — sinal de
    // que o mapeamento se desencontrou do fluxo real.
    for (const fase of FASES_ORDEM) {
      const nela = TODOS.filter((s) => faseDoJob(s) === fase)
      expect(nela.length, `nenhum status na fase ${fase}`).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O MAPEAMENTO VALIDADO EM 07/09/2026
//
// Escrito por extenso, e não derivado do módulo, de propósito: se fosse
// derivado, testaria que o código concorda consigo mesmo. Esta tabela é o
// acordo com o Giovani, e mudá-la tem que ser um ato deliberado.
// ─────────────────────────────────────────────────────────────────────────────
const ESPERADO: Record<string, JobFase> = {
  pedido_criado:                "pending_assignment",
  aguardando_aprovacao_interna: "pending_assignment",
  aguardando_triagem:           "pending_assignment",
  urgencia_pendente_aprovacao:  "pending_assignment",
  urgencia_aprovada:            "pending_assignment",
  planejamento:                 "pending_assignment",
  videomaker_recusou:           "pending_assignment",

  videomaker_notificado:        "dispatched",

  videomaker_aceitou:           "in_progress",
  captacao_agendada:            "in_progress",
  captacao_realizada:           "in_progress",

  brutos_enviados:              "material_uploaded",

  editor_atribuido:             "in_editing",
  fila_edicao:                  "in_editing",
  editando:                     "in_editing",
  edicao_finalizada:            "in_editing",
  revisao_pendente:             "in_editing",
  ajuste_solicitado:            "in_editing",
  impedimento:                  "in_editing",

  aprovado:                     "finished",
  postagem_pendente:            "finished",
  postado:                      "finished",
  entregue_cliente:             "finished",
  contagem_15_dias_iniciada:    "finished",
  lembrete_15_dias_enviado:     "finished",
  expirado:                     "finished",
  encerrado:                    "finished",
}

describe("mapeamento StatusInterno → JobFase", () => {
  it("a tabela de referência cobre os 27 status", () => {
    expect(Object.keys(ESPERADO).sort()).toEqual([...TODOS].sort())
  })

  for (const status of TODOS) {
    it(`${status} → ${ESPERADO[status]}`, () => {
      expect(faseDoJob(status)).toBe(ESPERADO[status])
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// CASOS ESPECIAIS — os julgamentos que o mapeamento embute
// ─────────────────────────────────────────────────────────────────────────────
describe("casos especiais do mapeamento", () => {
  it("recusa devolve o job para a fila de atribuição (§6)", () => {
    // O card volta a aparecer para quem realoca. Se isto virar `dispatched` ou
    // `in_progress`, o job recusado some da fila e ninguém o reatribui.
    expect(faseDoJob("videomaker_recusou")).toBe("pending_assignment")
  })

  it("planejar e aprovar urgência ainda são bola do Admin", () => {
    // Vivem na coluna "Produção" do kanban. A fase discorda da coluna, e é o
    // ponto: ninguém foi acionado, não há produção acontecendo.
    expect(faseDoJob("planejamento")).toBe("pending_assignment")
    expect(faseDoJob("urgencia_aprovada")).toBe("pending_assignment")
  })

  it("captação realizada ainda não é material entregue (§4.4)", () => {
    expect(faseDoJob("captacao_realizada")).toBe("in_progress")
    expect(faseDoJob("brutos_enviados")).toBe("material_uploaded")
  })

  it("o ciclo de aprovação não é `finished` — §24 exige master aprovado", () => {
    for (const s of ["edicao_finalizada", "revisao_pendente", "ajuste_solicitado"] as StatusInterno[]) {
      expect(faseDoJob(s)).toBe("in_editing")
    }
  })
})

describe("bloqueio (§33)", () => {
  it("impedimento é condição, não fase: continua em in_editing", () => {
    expect(faseDoJob("impedimento")).toBe("in_editing")
    expect(ehBloqueado("impedimento")).toBe(true)
  })

  it("nenhum outro status é bloqueio", () => {
    const bloqueados = TODOS.filter(ehBloqueado)
    expect(bloqueados).toEqual(["impedimento"])
  })
})

describe("estados terminais e cancelamento", () => {
  it("expirado e encerrado são os terminais", () => {
    expect(TODOS.filter(ehTerminal).sort()).toEqual(["encerrado", "expirado"])
  })

  it("encerrado sem vídeo final é cancelamento, não conclusão", () => {
    // `impedimento → encerrado` e `urgencia_pendente_aprovacao → encerrado` são
    // caminhos legais: dá para encerrar um job que nunca entregou nada.
    expect(ehCancelado({ statusInterno: "encerrado", linkFinal: null })).toBe(true)
    expect(ehCancelado({ statusInterno: "expirado", linkFinal: null })).toBe(true)
  })

  it("terminal COM vídeo final foi entregue, não cancelado", () => {
    expect(ehCancelado({ statusInterno: "encerrado", linkFinal: "https://x/v.mp4" })).toBe(false)
  })

  it("job vivo nunca é cancelado, mesmo sem vídeo", () => {
    expect(ehCancelado({ statusInterno: "editando", linkFinal: null })).toBe(false)
    expect(ehCancelado({ statusInterno: "aprovado", linkFinal: null })).toBe(false)
  })
})

describe("publicação é eixo independente (§25)", () => {
  it("finished não implica published — é a regra que o §63 protege", () => {
    const finished = TODOS.filter((s) => faseDoJob(s) === "finished")
    const naoPublicados = finished.filter(
      (s) => publicacaoDoJob({ statusInterno: s }) === "not_published"
    )
    // Sem link nem data, `aprovado`, `postagem_pendente`, `expirado` e
    // `encerrado` estão concluídos e não publicados.
    expect(naoPublicados.sort()).toEqual(
      ["aprovado", "encerrado", "expirado", "postagem_pendente"].sort()
    )
  })

  it("a cadeia depois de postado é prova de publicação", () => {
    for (const s of [
      "postado",
      "entregue_cliente",
      "contagem_15_dias_iniciada",
      "lembrete_15_dias_enviado",
    ] as StatusInterno[]) {
      expect(publicacaoDoJob({ statusInterno: s })).toBe("published")
    }
  })

  it("terminal responde por evidência, não por posição na cadeia", () => {
    // Chega-se a `encerrado` sem nunca ter publicado.
    expect(publicacaoDoJob({ statusInterno: "encerrado" })).toBe("not_published")
    // Mas se há link do post, publicou.
    expect(
      publicacaoDoJob({ statusInterno: "encerrado", linkPostagem: "https://ig/p/1" })
    ).toBe("published")
    expect(
      publicacaoDoJob({ statusInterno: "expirado", dataPostagem: new Date("2026-08-01") })
    ).toBe("published")
  })

  it("link em branco não conta como publicado", () => {
    expect(publicacaoDoJob({ statusInterno: "aprovado", linkPostagem: "   " })).toBe("not_published")
  })

  it("nada na base produz `scheduled` hoje", () => {
    // Declarado porque o §25 o define; sem produtor porque não há campo de
    // agendamento no schema. Este teste é o registro de que a ausência é
    // sabida, e não um esquecimento.
    const produzidos = new Set(
      TODOS.map((s) => publicacaoDoJob({ statusInterno: s, linkPostagem: null, dataPostagem: null }))
    )
    expect(produzidos.has("scheduled")).toBe(false)
  })
})

describe("fila do Social (§31)", () => {
  it("pega concluído e não publicado", () => {
    expect(
      aguardandoPublicacao({ statusInterno: "postagem_pendente", linkFinal: "https://x/v.mp4" })
    ).toBe(true)
    expect(aguardandoPublicacao({ statusInterno: "aprovado", linkFinal: "https://x/v.mp4" })).toBe(true)
  })

  it("não pega o que ainda está em produção", () => {
    expect(aguardandoPublicacao({ statusInterno: "editando", linkFinal: null })).toBe(false)
    expect(aguardandoPublicacao({ statusInterno: "brutos_enviados", linkFinal: null })).toBe(false)
  })

  it("não pega o que já foi publicado", () => {
    expect(aguardandoPublicacao({ statusInterno: "postado", linkFinal: "https://x/v.mp4" })).toBe(false)
  })

  it("não pega job cancelado — não há o que publicar", () => {
    expect(aguardandoPublicacao({ statusInterno: "encerrado", linkFinal: null })).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSÁVEL ATUAL, PRÓXIMA AÇÃO E RISCO — o que o card do quadro mostra
// ─────────────────────────────────────────────────────────────────────────────
import {
  PROXIMA_ACAO,
  nivelDeRisco,
  proximaAcao,
  responsavelAtual,
} from "@/lib/job-fase"

describe("responsável atual (§31)", () => {
  it("cobre os 27 status sem devolver papel vazio", () => {
    for (const s of TODOS) {
      const r = responsavelAtual({ statusInterno: s })
      expect(r.papel, `${s} ficou sem papel`).toBeTruthy()
    }
  })

  it("antes da atribuição a bola é do Admin", () => {
    expect(responsavelAtual({ statusInterno: "aguardando_triagem" }).papel).toBe("Admin")
    // Inclusive na recusa: o job voltou para a fila.
    expect(responsavelAtual({ statusInterno: "videomaker_recusou" }).papel).toBe("Admin")
  })

  it("na captação é do videomaker, com nome quando há", () => {
    const r = responsavelAtual({ statusInterno: "captacao_agendada", videomaker: { nome: "João" } })
    expect(r).toEqual({ papel: "Videomaker", nome: "João" })
  })

  it("com material entregue e sem editor, a bola é da triagem", () => {
    expect(responsavelAtual({ statusInterno: "brutos_enviados" }).papel).toBe("Triagem de edição")
    expect(
      responsavelAtual({ statusInterno: "brutos_enviados", editor: { nome: "Ana" } })
    ).toEqual({ papel: "Editor", nome: "Ana" })
  })

  it("no ciclo de aprovação a bola é de quem aprova, não de quem editou", () => {
    const r = responsavelAtual({ statusInterno: "revisao_pendente", editor: { nome: "Ana" } })
    expect(r.papel).toBe("Aprovação")
  })

  it("ajuste solicitado devolve a bola ao editor", () => {
    expect(
      responsavelAtual({ statusInterno: "ajuste_solicitado", editor: { nome: "Ana" } })
    ).toEqual({ papel: "Editor", nome: "Ana" })
  })

  it("o executor do Growth entra quando não há editor", () => {
    expect(responsavelAtual({ statusInterno: "editando", designer: { nome: "Bia" } }).nome).toBe("Bia")
    expect(
      responsavelAtual({ statusInterno: "editando", responsaveis: [{ usuario: { nome: "Caio" } }] }).nome
    ).toBe("Caio")
  })

  it("impedimento aparece como bloqueio, sem esconder quem destrava", () => {
    const r = responsavelAtual({ statusInterno: "impedimento", editor: { nome: "Ana" } })
    expect(r).toEqual({ papel: "Bloqueado", nome: "Ana" })
  })

  it("concluído e não publicado é do Social; publicado não tem bola", () => {
    expect(responsavelAtual({ statusInterno: "aprovado", linkFinal: "v.mp4" }).papel).toBe("Social")
    expect(responsavelAtual({ statusInterno: "postado", linkFinal: "v.mp4" }).papel).toBe("Concluído")
  })

  it("job encerrado sem entrega não fica pedindo publicação", () => {
    expect(responsavelAtual({ statusInterno: "encerrado", linkFinal: null }).papel).toBe("Encerrado")
  })
})

describe("próxima ação (§32)", () => {
  it("os 27 status têm frase, e nenhuma repete o nome do status cru", () => {
    for (const s of TODOS) {
      const frase = proximaAcao({ statusInterno: s })
      expect(frase, `${s} sem frase`).toBeTruthy()
      expect(frase).not.toBe(s)
    }
  })

  it("a tabela cobre exatamente o enum", () => {
    expect(Object.keys(PROXIMA_ACAO).sort()).toEqual([...TODOS].sort())
  })

  it("distingue etapas que a fase sozinha juntaria", () => {
    // Mesma fase `in_progress`, ações bem diferentes.
    expect(proximaAcao({ statusInterno: "captacao_agendada" })).toBe("Captação agendada")
    expect(proximaAcao({ statusInterno: "captacao_realizada" })).toBe("Aguardando envio do material")
  })

  it("não pede publicação de algo já publicado", () => {
    // O status ainda diz `postagem_pendente`, mas o link do post existe.
    expect(proximaAcao({ statusInterno: "postagem_pendente" })).toBe("Aguardando publicação")
    expect(
      proximaAcao({ statusInterno: "postagem_pendente", linkPostagem: "https://ig/p/1" })
    ).toBe("Publicado")
  })
})

describe("risco de prazo (§33)", () => {
  it("sem prazo é on_time", () => {
    expect(nivelDeRisco({ dataLimite: null, statusVisivel: "producao" })).toBe("on_time")
  })

  it("prazo vencido é overdue; vence hoje é attention", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"))
    expect(nivelDeRisco({ dataLimite: "2026-08-23T00:00:00.000Z", statusVisivel: "producao" })).toBe("overdue")
    expect(nivelDeRisco({ dataLimite: "2026-08-24T00:00:00.000Z", statusVisivel: "producao" })).toBe("attention")
    expect(nivelDeRisco({ dataLimite: "2026-08-30T00:00:00.000Z", statusVisivel: "producao" })).toBe("on_time")
    vi.useRealTimers()
  })

  it("respeita o prazo pausado — não pune quem espera o cliente", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"))
    expect(nivelDeRisco({ dataLimite: "2026-08-01", statusVisivel: "aprovacao" })).toBe("on_time")
    vi.useRealTimers()
  })
})
