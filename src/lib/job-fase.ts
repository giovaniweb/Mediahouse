// A fase macro do Job — a leitura de gestão sobre os 27 status da operação.
//
// `NUFLOW_JOB_WORKFLOW_CODEX_CLAUDE.md` descreve seis estados em inglês
// (pending_assignment → dispatched → in_progress → material_uploaded →
// in_editing → finished). O NUFLOW já tinha esse fluxo, em português e com
// granularidade maior: `StatusInterno`, 27 valores, 1.439 linhas de histórico
// gravadas neles.
//
// A decisão (validada em 07/09/2026) foi NÃO criar um segundo status no banco.
// `StatusInterno` continua sendo a fonte de verdade operacional; a fase é
// DERIVADA aqui, em função pura. Dois campos de estado precisariam ser
// sincronizados a cada escrita, e o dia em que divergissem ninguém saberia qual
// dos dois acreditar.
//
// O critério do mapeamento não é a coluna em que o card aparece hoje — é a
// pergunta do §2: DE QUEM É A BOLA AGORA? Por isso `planejamento` e
// `urgencia_aprovada` vivem na coluna "Produção" e mesmo assim são
// `pending_assignment`: ninguém foi acionado ainda, a bola é do Admin.
//
// Este módulo é importado por telas. Como `lib/status.ts`, usa import de TIPO —
// o runtime do Prisma não pode ir para o bundle do navegador.
import type { StatusInterno } from "@prisma/client"
import { estaAtrasada, venceHoje } from "./status"

/** As seis fases do documento. */
export type JobFase =
  | "pending_assignment"
  | "dispatched"
  | "in_progress"
  | "material_uploaded"
  | "in_editing"
  | "finished"

/** Ordem do fluxo (§4). Serve para ordenar e para comparar avanço. */
export const FASES_ORDEM: JobFase[] = [
  "pending_assignment",
  "dispatched",
  "in_progress",
  "material_uploaded",
  "in_editing",
  "finished",
]

/** Rótulo de gestão. A frase de "próxima ação" (§32) é outra coisa, e virá depois. */
export const FASE_LABEL: Record<JobFase, string> = {
  pending_assignment: "Aguardando atribuição",
  dispatched:         "Aguardando aceite",
  in_progress:        "Captação",
  material_uploaded:  "Material entregue",
  in_editing:         "Produção",
  finished:           "Concluído",
}

/**
 * StatusInterno → JobFase.
 *
 * `Record<StatusInterno, JobFase>` é a primeira trava de exaustividade: criar um
 * valor novo no enum sem mapeá-lo aqui não compila. A segunda trava é o teste,
 * que enumera o enum em runtime — porque `tsc` não roda em todo caminho.
 */
export const FASE_DE_STATUS: Record<StatusInterno, JobFase> = {
  // ── pending_assignment — a bola é do Admin/Moderador (§4.1, §9) ────────────
  pedido_criado:                "pending_assignment",
  aguardando_aprovacao_interna: "pending_assignment",
  aguardando_triagem:           "pending_assignment",
  urgencia_pendente_aprovacao:  "pending_assignment",
  // Vive na coluna "Produção", mas a urgência aprovada só destrava a
  // atribuição — o videomaker ainda não existe para este job.
  urgencia_aprovada:            "pending_assignment",
  // Idem: planejar não é despachar. §4.2 só vira `dispatched` quando há
  // videomaker selecionado aguardando aceite.
  planejamento:                 "pending_assignment",
  // §6: a recusa devolve o job para a fila de atribuição. É o caso especial
  // mais importante deste mapa — o card volta a aparecer para quem realoca.
  videomaker_recusou:           "pending_assignment",

  // ── dispatched — escolhido, aguardando aceite (§4.2) ───────────────────────
  videomaker_notificado:        "dispatched",

  // ── in_progress — a bola é do videomaker (§4.3) ────────────────────────────
  videomaker_aceitou:           "in_progress",
  captacao_agendada:            "in_progress",
  // Captou, mas não entregou. §4.4 exige as duas metades — captação concluída
  // E material entregue. Só a primeira aconteceu, e a bola continua com ele.
  captacao_realizada:           "in_progress",

  // ── material_uploaded — material entregue (§4.4) ───────────────────────────
  brutos_enviados:              "material_uploaded",

  // ── in_editing — a bola é do editor ou de quem aprova (§4.5, §22) ──────────
  // §18: atribuir a edição já leva a `in_editing`.
  editor_atribuido:             "in_editing",
  fila_edicao:                  "in_editing",
  editando:                     "in_editing",
  // V1 enviada e ciclo de aprovação: NÃO é `finished`. §24 só finaliza com
  // master aprovado, e aqui ele ainda não é.
  edicao_finalizada:            "in_editing",
  revisao_pendente:             "in_editing",
  ajuste_solicitado:            "in_editing",
  // Bloqueio nasce do ciclo de edição (ver TRANSICOES_VALIDAS: só `editando` e
  // `revisao_pendente` levam a ele). A fase diz onde o job parou; `ehBloqueado`
  // diz que ele está parado — §33 trata bloqueio como eixo próprio.
  impedimento:                  "in_editing",

  // ── finished — produção audiovisual concluída (§4.6, §23) ──────────────────
  // Master aprovado. §25: publicação é outro eixo — `finished` não é `published`.
  aprovado:                     "finished",
  postagem_pendente:            "finished",
  postado:                      "finished",
  entregue_cliente:             "finished",
  contagem_15_dias_iniciada:    "finished",
  lembrete_15_dias_enviado:     "finished",
  expirado:                     "finished",
  // Alcançável SEM entrega (`impedimento → encerrado`,
  // `urgencia_pendente_aprovacao → encerrado`). A especificação não tem fase de
  // cancelamento; `ehCancelado` distingue sem inventar uma sétima fase.
  encerrado:                    "finished",
}

/** A fase macro do job. */
export function faseDoJob(statusInterno: StatusInterno): JobFase {
  return FASE_DE_STATUS[statusInterno]
}

/** Posição no fluxo — para ordenar e comparar avanço. */
export function ordemDaFase(fase: JobFase): number {
  return FASES_ORDEM.indexOf(fase)
}

/**
 * O job está travado esperando alguém destravar (§33).
 *
 * Não é fase, é condição: um job bloqueado continua em `in_editing`, e é isso
 * que a coluna deve mostrar. O que muda é o alerta em cima do card.
 */
export function ehBloqueado(statusInterno: StatusInterno): boolean {
  return statusInterno === "impedimento"
}

/** Estados dos quais não se sai — o job acabou, bem ou mal. */
const TERMINAIS: StatusInterno[] = ["expirado", "encerrado"]

export function ehTerminal(statusInterno: StatusInterno): boolean {
  return TERMINAIS.includes(statusInterno)
}

/**
 * Terminou SEM ter entregue.
 *
 * `encerrado` e `expirado` caem em `finished` porque não há fase de
 * cancelamento na especificação — mas pôr um job cancelado na mesma leitura de
 * um job entregue seria mentira de gestão. A evidência de entrega é o vídeo
 * final; sem ele, o job foi encerrado, não concluído.
 */
export function ehCancelado(job: {
  statusInterno: StatusInterno
  linkFinal?: string | null
}): boolean {
  return ehTerminal(job.statusInterno) && !job.linkFinal
}

// ── Publicação: eixo independente (§25) ──────────────────────────────────────

/** §25. `finished` não implica nenhum destes — são eixos separados. */
export type StatusPublicacao = "not_published" | "scheduled" | "published"

/**
 * Status internos que só são alcançáveis DEPOIS de `postado`
 * (ver TRANSICOES_VALIDAS: postado → entregue_cliente → contagem_15_dias_iniciada
 * → lembrete_15_dias_enviado). Estar num deles é prova de que a postagem saiu.
 *
 * `expirado` e `encerrado` ficam de fora de propósito: chega-se a eles também
 * por `impedimento` e por urgência recusada, sem nunca ter publicado. Para esses
 * a resposta vem da evidência, não da posição na cadeia.
 */
const POS_PUBLICACAO: StatusInterno[] = [
  "postado",
  "entregue_cliente",
  "contagem_15_dias_iniciada",
  "lembrete_15_dias_enviado",
]

/**
 * Derivada, como a fase — e pelos mesmos motivos (§25).
 *
 * NOTA SOBRE `scheduled`: o tipo existe porque a especificação o define, mas
 * hoje NADA na base produz esse valor. `dataPostagem` só é gravada no ato de
 * marcar como `postado` (ver api/demandas/[id]/status/route.ts) e a tela a
 * exibe como "Postado em" — é fato consumado, não agendamento. Não há campo de
 * "agendado para" no schema. Inferir `scheduled` de uma data que nunca está no
 * futuro produziria um estado que não corresponde a nada.
 *
 * `scheduled` fica declarado e sem produtor até existir o campo de agendamento.
 */
export function publicacaoDoJob(job: {
  statusInterno: StatusInterno
  linkPostagem?: string | null
  dataPostagem?: Date | string | null
}): StatusPublicacao {
  if (POS_PUBLICACAO.includes(job.statusInterno)) return "published"
  // A evidência: existe link do post, ou existe data de postagem registrada.
  // É o que responde por `expirado` e `encerrado`, e por qualquer job cujo
  // status tenha sido corrigido à mão sem passar pela cadeia.
  if (job.linkPostagem?.trim()) return "published"
  if (job.dataPostagem) return "published"
  return "not_published"
}

/** A fila do Social (§31, §50): produção pronta, publicação pendente. */
export function aguardandoPublicacao(job: {
  statusInterno: StatusInterno
  linkPostagem?: string | null
  dataPostagem?: Date | string | null
  linkFinal?: string | null
}): boolean {
  return (
    faseDoJob(job.statusInterno) === "finished" &&
    publicacaoDoJob(job) === "not_published" &&
    !ehCancelado(job)
  )
}

// ── DE QUEM É A BOLA AGORA? (§2, §31) ────────────────────────────────────────
//
// A pergunta que o módulo inteiro existe para responder. Derivada, como a fase:
// a demanda tem sete FKs de pessoa (solicitante, gestor, videomaker, editor,
// social, designer, responsável) e nenhuma delas diz QUAL das sete é a vez.
// Guardar um oitavo campo criaria mais uma coisa que pode divergir das outras
// sete; a resposta é sempre calculável a partir do estado.

/** O papel que precisa agir, e quem é a pessoa quando já se sabe. */
export type Responsavel = {
  /** Rótulo do papel — sempre presente, mesmo sem pessoa designada. */
  papel: string
  /** Nome de quem vai agir. `null` quando ainda não há alguém designado. */
  nome: string | null
}

/** O que o cálculo precisa saber. Tudo já vem do include padrão de /api/demandas. */
export type JobParaLeitura = {
  statusInterno: StatusInterno
  linkPostagem?: string | null
  dataPostagem?: Date | string | null
  linkFinal?: string | null
  videomaker?: { nome: string } | null
  editor?: { nome: string } | null
  designer?: { nome: string } | null
  responsavel?: { nome: string } | null
  responsaveis?: { usuario: { nome: string } }[] | null
  gestor?: { nome: string } | null
}

/** Quem executa a produção: editor, designer ou o responsável interno (Growth). */
function executor(job: JobParaLeitura): string | null {
  return (
    job.editor?.nome ??
    job.designer?.nome ??
    job.responsavel?.nome ??
    job.responsaveis?.[0]?.usuario.nome ??
    null
  )
}

/**
 * De quem é a bola agora.
 *
 * Segue as fases, com dois desvios que a fase sozinha não expressa:
 * `impedimento` devolve a bola para quem destrava, e `finished` só é do Social
 * enquanto houver publicação pendente — depois disso não há bola nenhuma.
 */
export function responsavelAtual(job: JobParaLeitura): Responsavel {
  if (job.statusInterno === "impedimento") {
    return { papel: "Bloqueado", nome: executor(job) }
  }

  switch (faseDoJob(job.statusInterno)) {
    case "pending_assignment":
      return { papel: "Admin", nome: job.gestor?.nome ?? null }
    case "dispatched":
    case "in_progress":
      return { papel: "Videomaker", nome: job.videomaker?.nome ?? null }
    case "material_uploaded":
      // §31: a bola é de quem faz a triagem de edição. Se o editor já está
      // definido, é dele; senão, de quem decide.
      return job.editor
        ? { papel: "Editor", nome: job.editor.nome }
        : { papel: "Triagem de edição", nome: null }
    case "in_editing":
      // No ciclo de aprovação a bola é de quem aprova, não de quem edita.
      return ["edicao_finalizada", "revisao_pendente"].includes(job.statusInterno)
        ? { papel: "Aprovação", nome: null }
        : { papel: "Editor", nome: executor(job) }
    case "finished":
      if (ehCancelado(job as { statusInterno: StatusInterno; linkFinal?: string | null })) {
        return { papel: "Encerrado", nome: null }
      }
      return aguardandoPublicacao(job)
        ? { papel: "Social", nome: null }
        : { papel: "Concluído", nome: null }
  }
}

// ── QUAL É A PRÓXIMA AÇÃO? (§32) ─────────────────────────────────────────────
//
// Frase curta e objetiva, derivada do status. §32 é explícito: "Evitar depender
// apenas de cores" — a etapa precisa estar escrita, não só pintada.
//
// Mapeada por StatusInterno, e não por fase, porque os 27 valores distinguem
// coisas que importam para quem lê o card: "aguardando material" e "captação
// agendada" são a mesma fase e ações bem diferentes.
export const PROXIMA_ACAO: Record<StatusInterno, string> = {
  pedido_criado:                "Aguardando triagem",
  aguardando_aprovacao_interna: "Aguardando aprovação interna",
  aguardando_triagem:           "Aguardando triagem",
  urgencia_pendente_aprovacao:  "Aguardando aprovação da urgência",
  urgencia_aprovada:            "Aguardando atribuição",
  planejamento:                 "Aguardando atribuição",
  videomaker_recusou:           "Recusado — realocar videomaker",
  videomaker_notificado:        "Aguardando aceite do videomaker",
  videomaker_aceitou:           "Aguardando agendamento da captação",
  captacao_agendada:            "Captação agendada",
  captacao_realizada:           "Aguardando envio do material",
  brutos_enviados:              "Aguardando editor",
  editor_atribuido:             "Aguardando início da edição",
  fila_edicao:                  "Na fila de edição",
  editando:                     "Em edição",
  edicao_finalizada:            "Aguardando aprovação",
  revisao_pendente:             "Aguardando aprovação",
  ajuste_solicitado:            "Ajuste solicitado",
  impedimento:                  "Bloqueado",
  aprovado:                     "Aguardando publicação",
  postagem_pendente:            "Aguardando publicação",
  postado:                      "Publicado",
  entregue_cliente:             "Entregue",
  contagem_15_dias_iniciada:    "Entregue",
  lembrete_15_dias_enviado:     "Entregue",
  expirado:                     "Encerrado",
  encerrado:                    "Encerrado",
}

export function proximaAcao(job: JobParaLeitura): string {
  // A publicação já saiu, mas o status ainda não acompanhou: o card não pode
  // pedir uma ação que já foi feita.
  if (
    faseDoJob(job.statusInterno) === "finished" &&
    PROXIMA_ACAO[job.statusInterno] === "Aguardando publicação" &&
    publicacaoDoJob(job) === "published"
  ) {
    return "Publicado"
  }
  return PROXIMA_ACAO[job.statusInterno]
}

// ── PRAZO E RISCO (§33) ──────────────────────────────────────────────────────

export type NivelDeRisco = "on_time" | "attention" | "overdue"

/**
 * Reaproveita a regra de atraso que já existe (`lib/status.ts`), inclusive o
 * prazo pausado nas colunas em que a bola está com o cliente — quem produziu
 * não é marcado como atrasado por espera alheia.
 */
export function nivelDeRisco(job: {
  dataLimite?: string | Date | null
  statusVisivel?: string | null
}): NivelDeRisco {
  if (estaAtrasada(job)) return "overdue"
  if (venceHoje(job)) return "attention"
  return "on_time"
}
