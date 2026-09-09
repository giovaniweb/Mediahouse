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

// ─────────────────────────────────────────────────────────────────────────────
// O QUE ENTRA NO QUADRO DE JOBS
//
// Três responsabilidades separadas: Demandas é o kanban geral, Aprovações é a
// caixa de entrada das solicitações, e Jobs é a operação das coberturas já
// aprovadas. Estes testes prendem essa fronteira.
// ─────────────────────────────────────────────────────────────────────────────
import {
  AGUARDANDO_APROVACAO,
  DEPARTAMENTO_COBERTURA,
  TIPO_COBERTURA,
  ehJob,
  ehSolicitacaoDeCobertura,
  foiAprovada,
} from "@/lib/job-fase"

describe("origem: só solicitação de cobertura", () => {
  it("reconhece pelo tipo e pelo departamento", () => {
    // O formulário público grava os dois juntos; a criação interna deixa
    // escolher separado, então qualquer um dos dois marca.
    expect(ehSolicitacaoDeCobertura({ tipoVideo: TIPO_COBERTURA })).toBe(true)
    expect(ehSolicitacaoDeCobertura({ departamento: DEPARTAMENTO_COBERTURA })).toBe(true)
    expect(ehSolicitacaoDeCobertura({ tipoVideo: TIPO_COBERTURA, departamento: "eventos" })).toBe(true)
  })

  it("deixa de fora o resto do audiovisual", () => {
    // Os tipos que dominam a base: reels (182) e video_institucional (173).
    // Nenhum deles é Job, e é essa a correção desta etapa.
    for (const t of ["reels", "video_institucional", "youtube", "apresentacao_equipamento", "outro"]) {
      expect(ehSolicitacaoDeCobertura({ tipoVideo: t, departamento: "audiovisual" }), t).toBe(false)
    }
    expect(ehSolicitacaoDeCobertura({})).toBe(false)
    expect(ehSolicitacaoDeCobertura({ tipoVideo: null, departamento: null })).toBe(false)
  })
})

describe("portão de aprovação", () => {
  it("o que ainda espera decisão não é Job", () => {
    expect(AGUARDANDO_APROVACAO).toHaveLength(2)
    for (const s of AGUARDANDO_APROVACAO) {
      expect(foiAprovada({ statusInterno: s, statusVisivel: "entrada" }), s).toBe(false)
    }
  })

  it("recusada não é Job — encerrado AINDA na coluna entrada", () => {
    // Assinatura da recusa: api/demandas/[id]/aprovar preserva a coluna ao
    // recusar. Na base, as 6 demandas `encerrado` estão todas em `entrada`.
    // Sem esta regra, uma solicitação recusada apareceria no quadro como
    // trabalho a fazer.
    expect(foiAprovada({ statusInterno: "encerrado", statusVisivel: "entrada" })).toBe(false)
  })

  it("encerrada DEPOIS de aprovada continua sendo Job", () => {
    // Um job que andou e foi encerrado no fim não é o mesmo que uma
    // solicitação recusada na porta.
    expect(foiAprovada({ statusInterno: "encerrado", statusVisivel: "finalizado" })).toBe(true)
  })

  it("aprovada normal e aprovada por urgência entram", () => {
    // Os dois destinos de `aprovar`: aguardando_triagem e urgencia_aprovada.
    expect(foiAprovada({ statusInterno: "aguardando_triagem", statusVisivel: "entrada" })).toBe(true)
    expect(foiAprovada({ statusInterno: "urgencia_aprovada", statusVisivel: "producao" })).toBe(true)
  })

  it("todo status fora do portão passa", () => {
    const fora = TODOS.filter((s) => !AGUARDANDO_APROVACAO.includes(s) && s !== "encerrado")
    for (const s of fora) {
      expect(foiAprovada({ statusInterno: s, statusVisivel: "producao" }), s).toBe(true)
    }
  })
})

describe("ehJob — as duas condições juntas", () => {
  const cobertura = { tipoVideo: TIPO_COBERTURA, departamento: DEPARTAMENTO_COBERTURA }

  it("cobertura aprovada entra", () => {
    expect(ehJob({ ...cobertura, statusInterno: "videomaker_aceitou", statusVisivel: "producao" })).toBe(true)
    expect(ehJob({ ...cobertura, statusInterno: "entregue_cliente", statusVisivel: "finalizado" })).toBe(true)
  })

  it("cobertura ainda em aprovação não entra — é da caixa de Aprovações", () => {
    expect(ehJob({ ...cobertura, statusInterno: "aguardando_aprovacao_interna", statusVisivel: "entrada" })).toBe(false)
  })

  it("cobertura recusada não entra", () => {
    expect(ehJob({ ...cobertura, statusInterno: "encerrado", statusVisivel: "entrada" })).toBe(false)
  })

  it("demanda comum aprovada não entra — é do quadro de Demandas", () => {
    expect(
      ehJob({ tipoVideo: "reels", departamento: "growth", statusInterno: "editando", statusVisivel: "edicao" })
    ).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AÇÕES DO VIDEOMAKER — a tela não pode oferecer o que o servidor recusaria
// ─────────────────────────────────────────────────────────────────────────────
import { acoesDoVideomaker, captacaoIniciada, rotuloDeEvento } from "@/lib/job-fase"
import { EVENTO_CAPTACAO_INICIADA } from "@/lib/status"
import { ACOES_DO_VIDEOMAKER, podeTransicionar } from "@/lib/job-transicoes"
import { permissaoEfetiva } from "@/lib/permissoes"

describe("ações do videomaker (§13)", () => {
  it("oferece a ação certa em cada etapa dele", () => {
    const esperado: Record<string, string[]> = {
      videomaker_notificado: ["aceitar", "recusar"],
      videomaker_aceitou:    ["iniciar_captacao"],
      captacao_agendada:     ["finalizar_captacao"],
      captacao_realizada:    ["enviar_material"],
      brutos_enviados:       ["enviar_nf"],
    }
    for (const [status, chaves] of Object.entries(esperado)) {
      expect(acoesDoVideomaker(status as StatusInterno).map((a) => a.chave), status).toEqual(chaves)
    }
  })

  it("captação: iniciar é EVENTO, finalizar é status — e o status não muda entre os dois", () => {
    // O §14 pede timestamp e evento para o início, não transição. Apontar
    // "Iniciar captação" para `captacao_agendada` daria a "agendar" o sentido
    // de "começar" — é a semântica falsa que esta correção remove.
    const iniciar = acoesDoVideomaker("videomaker_aceitou")[0]
    expect(iniciar.chave).toBe("iniciar_captacao")
    expect(iniciar.ehEvento).toBe(true)
    expect(iniciar.alvo).toBeNull()
    expect(iniciar.alvo).not.toBe("captacao_agendada")

    // Mesmo status, depois do evento: o que muda é a ação oferecida.
    const depois = acoesDoVideomaker("videomaker_aceitou", { captacaoIniciada: true })
    expect(depois.map((a) => a.chave)).toEqual(["finalizar_captacao"])
    expect(depois[0].alvo).toBe("captacao_realizada")
  })

  it("nenhuma ação do videomaker aponta para captacao_agendada", () => {
    // A trava contra a regressão: `captacao_agendada` é agendamento, e nunca
    // foi usado uma vez em produção. Nenhum botão dele pode levar até lá.
    for (const s of TODOS) {
      for (const flag of [false, true]) {
        for (const a of acoesDoVideomaker(s, { captacaoIniciada: flag })) {
          expect(a.alvo, `${s} → ${a.chave}`).not.toBe("captacao_agendada")
        }
      }
    }
  })

  it("captacaoIniciada lê o histórico, que é onde o fato mora", () => {
    expect(captacaoIniciada([])).toBe(false)
    expect(captacaoIniciada(null)).toBe(false)
    expect(captacaoIniciada([{ statusNovo: "videomaker_aceitou" }])).toBe(false)
    expect(captacaoIniciada([{ statusNovo: EVENTO_CAPTACAO_INICIADA }])).toBe(true)
  })

  it("a timeline nomeia o evento sem expor o slug", () => {
    expect(rotuloDeEvento(EVENTO_CAPTACAO_INICIADA)).toBe("Captação iniciada")
    // E o status homônimo mantém o sentido dele.
    expect(rotuloDeEvento("captacao_agendada")).toBe("Captação agendada")
    expect(rotuloDeEvento("captacao_realizada")).toBe("Captação finalizada")
  })

  it("nas demais etapas não oferece nada — a bola não é dele", () => {
    const dele = ["videomaker_notificado", "videomaker_aceitou", "captacao_agendada", "captacao_realizada", "brutos_enviados"]
    for (const s of TODOS.filter((s) => !dele.includes(s))) {
      expect(acoesDoVideomaker(s), s).toEqual([])
    }
  })

  it("recusa exige motivo (§6) e material exige link", () => {
    const recusar = acoesDoVideomaker("videomaker_notificado").find((a) => a.chave === "recusar")!
    expect(recusar.exigeMotivo).toBe(true)
    const material = acoesDoVideomaker("captacao_realizada")[0]
    expect(material.exigeLink).toBe(true)
  })

  it("todo alvo oferecido é uma transição que a guarda autoriza ao videomaker", () => {
    // A trava que impede a tela de oferecer botão que o servidor recusa.
    for (const s of TODOS) {
      for (const acao of acoesDoVideomaker(s, { captacaoIniciada: true })) {
        if (!acao.alvo) continue
        expect(ACOES_DO_VIDEOMAKER, `${acao.chave} → ${acao.alvo}`).toContain(acao.alvo)
      }
    }
  })

  it("a guarda de fato aceita cada ação oferecida, para o videomaker dono", () => {
    const permissoes = permissaoEfetiva({
      membro: { papel: "videomaker", organizacaoId: "org-1", statusUsuario: "ativo" },
      organizacaoId: "org-1",
    })
    for (const s of TODOS) {
      for (const acao of acoesDoVideomaker(s, { captacaoIniciada: true })) {
        if (!acao.alvo) continue
        const r = podeTransicionar({
          statusAtual: s,
          novoStatus: acao.alvo,
          usuario: { id: "u-vm", papel: "videomaker", videomakerId: "vm-1", permissoes, origem: "dona" },
          demanda: {
            videomakerId: "vm-1", editorId: null,
            linkBrutos: "https://drive/brutos", linkFolderBrutos: null,
            linkFinal: null, motivoImpedimento: null,
          },
        })
        expect(r.ok, `${s} → ${acao.alvo} foi recusada: ${r.motivo}`).toBe(true)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSÃO ENTRE DEMANDA E JOB — o mesmo registro trocando de esteira
// ─────────────────────────────────────────────────────────────────────────────
import {
  DEPARTAMENTO_AUDIOVISUAL,
  TIPO_NEUTRO,
  conversaoDeFluxo,
  descricaoDaConversao,
  fluxoAtual,
} from "@/lib/job-fase"

const umaDemanda = { departamento: "audiovisual", tipoVideo: "reels" }
const umaCobertura = { departamento: DEPARTAMENTO_COBERTURA, tipoVideo: TIPO_COBERTURA }

describe("fluxo atual do registro", () => {
  it("lê a classificação que o quadro de Jobs já consulta", () => {
    expect(fluxoAtual(umaDemanda)).toBe("demanda")
    expect(fluxoAtual(umaCobertura)).toBe("job")
    // Basta UMA das marcas para o registro estar no fluxo de Job.
    expect(fluxoAtual({ departamento: "eventos", tipoVideo: "reels" })).toBe("job")
    expect(fluxoAtual({ departamento: "audiovisual", tipoVideo: TIPO_COBERTURA })).toBe("job")
  })
})

describe("Demanda → Job", () => {
  it("marca as duas chaves", () => {
    const m = conversaoDeFluxo(umaDemanda, "job")!
    expect(m).toEqual({ departamento: DEPARTAMENTO_COBERTURA, tipoVideo: TIPO_COBERTURA })
    // E o resultado é, de fato, um Job.
    expect(fluxoAtual(m)).toBe("job")
  })

  it("converter o que já é Job não faz nada (§53)", () => {
    expect(conversaoDeFluxo(umaCobertura, "job")).toBeNull()
  })
})

describe("Job → Demanda", () => {
  it("limpa AS DUAS marcas — deixar uma manteria o card no quadro de Jobs", () => {
    // É a armadilha do OR em `ehSolicitacaoDeCobertura`: trocar só o tipoVideo
    // e esquecer o departamento faria a conversão parecer não ter funcionado.
    const m = conversaoDeFluxo(umaCobertura, "demanda")!
    expect(m.departamento).not.toBe(DEPARTAMENTO_COBERTURA)
    expect(m.tipoVideo).not.toBe(TIPO_COBERTURA)
    expect(fluxoAtual(m)).toBe("demanda")
  })

  it("cai no audiovisual genérico quando não dizem para onde", () => {
    expect(conversaoDeFluxo(umaCobertura, "demanda")).toEqual({
      departamento: DEPARTAMENTO_AUDIOVISUAL,
      tipoVideo: TIPO_NEUTRO,
    })
  })

  it("respeita o destino informado", () => {
    const m = conversaoDeFluxo(umaCobertura, "demanda", { departamento: "growth", tipoVideo: "reels" })!
    expect(m).toEqual({ departamento: "growth", tipoVideo: "reels" })
    expect(fluxoAtual(m)).toBe("demanda")
  })

  it("recusa um destino que ainda seria cobertura", () => {
    // Pedir para "sair de Job" mandando eventos/cobertura_evento é contradição;
    // aplicar produziria um registro que a tela diria ter convertido e o quadro
    // continuaria mostrando.
    expect(conversaoDeFluxo(umaCobertura, "demanda", { departamento: "eventos" })).toBeNull()
    expect(conversaoDeFluxo(umaCobertura, "demanda", { tipoVideo: TIPO_COBERTURA })).toBeNull()
  })

  it("converter o que já é Demanda não faz nada (§53)", () => {
    expect(conversaoDeFluxo(umaDemanda, "demanda")).toBeNull()
  })

  it("uma marca só também sai do fluxo de Job", () => {
    // Registro marcado só pelo departamento: converter tem que limpar mesmo
    // assim, senão volta a aparecer no quadro.
    const m = conversaoDeFluxo({ departamento: "eventos", tipoVideo: "reels" }, "demanda")!
    expect(fluxoAtual(m)).toBe("demanda")
  })
})

describe("ida e volta preserva o fluxo, não os valores", () => {
  it("Demanda → Job → Demanda termina em Demanda", () => {
    const paraJob = conversaoDeFluxo(umaDemanda, "job")!
    const deVolta = conversaoDeFluxo(paraJob, "demanda")!
    expect(fluxoAtual(deVolta)).toBe("demanda")
  })

  it("o histórico guarda de onde veio — é o que a troca apaga", () => {
    const texto = descricaoDaConversao(umaDemanda, "job")
    expect(texto).toContain("audiovisual")
    expect(texto).toContain("reels")
    expect(descricaoDaConversao(umaCobertura, "demanda")).toContain("Demanda")
  })
})

describe("a conversão não muda o que o registro é", () => {
  it("um Job convertido continua obedecendo ao portão de aprovação", () => {
    // Converter classifica; não aprova. Uma solicitação convertida em Job que
    // ainda espera decisão continua fora do quadro.
    const m = conversaoDeFluxo(umaDemanda, "job")!
    expect(ehJob({ ...m, statusInterno: "aguardando_aprovacao_interna", statusVisivel: "entrada" })).toBe(false)
    expect(ehJob({ ...m, statusInterno: "aguardando_triagem", statusVisivel: "entrada" })).toBe(true)
  })
})
