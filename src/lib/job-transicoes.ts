// Guarda de transição de status — a autoridade que faltava no backend.
//
// O buraco que isto fecha: `PATCH /api/demandas/[id]/status` aceitava qualquer
// `StatusInterno` de qualquer pessoa autenticada da empresa. `requireDemandaOrg`
// confere a EMPRESA, não o papel. Um videomaker com um `curl` marcava uma
// demanda como `aprovado` ou `entregue_cliente`. As restrições que existiam
// viviam no `onDragEnd` do KanbanBoard — frontend, contornável.
//
// ─── POR QUE NÃO APLICAMOS `TRANSICOES_VALIDAS` COMO GATE ────────────────────
//
// A tentação óbvia era ligar `TRANSICOES_VALIDAS` (lib/status.ts) e pronto. Foi
// medido contra as 2.242 linhas de `historico_status` em 07/09/2026, e o
// resultado reprova a ideia:
//
//     transições reais (fora pseudo-eventos) : 1.603
//     permitidas por TRANSICOES_VALIDAS      :   202  (12,6%)
//     bloqueadas — fora da matriz            :   909  (56,7%)
//     bloqueadas — origem sem regra nenhuma  :   446  (27,8%)
//     auto-transição (de == para)            :    46  ( 2,9%)
//
// Ligá-la recusaria 84,5% do que a operação faz todo dia. Os campeões:
// `editando → revisao_pendente` (143x), `revisao_pendente → entregue_cliente`
// (129x), `aguardando_aprovacao_interna → aguardando_triagem` (287x — e
// `aguardando_aprovacao_interna` sequer é chave na matriz). O status
// `edicao_finalizada`, único sucessor legal de `editando` segundo a matriz, não
// aparece uma vez nos dados.
//
// Some-se o kanban do Growth (`lib/growth-kanban.ts`), que dirige ESTA MESMA
// rota com 8 colunas e movimento livre em qualquer direção: "backlog" →
// "finalizado" é `pedido_criado → entregue_cliente`.
//
// Conclusão: `TRANSICOES_VALIDAS` descreve o caminho feliz idealizado, não o
// fluxo real. Ela fica onde está, agora consultada para REGISTRAR desvio de
// sequência (`avisos`), nunca para recusar. Recusar é papel da autoridade.
//
// ─── O QUE ESTA GUARDA RECUSA, E COM QUE BASE ────────────────────────────────
//
// Só recusa onde a evidência sustenta que nada legítimo quebra:
//
//   videomaker            61 dos 63 têm `moverKanban: false`, e o papel produziu
//                         UMA mudança de status em 2.242 registros. Prendê-lo às
//                         ações dele, no job dele, não tira trabalho de ninguém —
//                         e é literalmente o §52 do documento.
//
//   `moverKanban: false`  recusa explícita, registrada por um gestor na tela de
//   declarado             permissões. Honrá-la é o mínimo.
//
// A guarda é DETERMINÍSTICA desde 07/09/2026: não existe mais caminho tolerante.
//
// Ela consumia `PermissaoUsuario.moverKanban` direto da tabela e tratava
// ausência de registro como um terceiro estado, que passava com aviso. A
// auditoria mostrou que ausência não é negação: 19 das 103 memberships não têm
// linha porque a linha nasce na primeira carga do app, não porque alguém negou.
//
// Agora quem responde é `permissaoEfetiva` (lib/permissoes.ts):
//
//     registro explícito  →  vence sempre (as 8 concessões da auditoria)
//     sem registro        →  preset de `membro.papel`
//     não dá para saber   →  null  →  NEGA
//
// Fail-closed sem quebrar ninguém: os 19 sem registro nunca exerceram esta rota
// (99 linhas de histórico, todas criação, zero movimentos de kanban), e a
// criação de demanda não passa por aqui.
import type { StatusInterno } from "@prisma/client"
import { STATUS_PARA_COLUNA, TRANSICOES_VALIDAS } from "./status"
import { podePermissao, type MapaPermissoes } from "./permissoes"
import type { PapelNoCard } from "./compartilhamento"

/** Motivo da recusa, para a rota escolher o HTTP e a tela escolher a frase. */
export type CodigoRecusa =
  | "status_inexistente"
  | "sem_autoridade"
  | "nao_e_seu_job"
  | "fora_do_seu_papel"
  | "fora_do_espelho"
  | "precondicao"

export type ResultadoTransicao = {
  /** Passa? */
  ok: boolean
  /** Só quando `ok: false`. Frase para o usuário. */
  motivo?: string
  codigo?: CodigoRecusa
  /**
   * `statusAtual === novoStatus`. A transição é aceita (não é erro pedir o que
   * já vale — §53), mas a rota deve pular os efeitos colaterais: sem histórico
   * novo, sem notificação repetida. Os dados têm 46 dessas, e hoje cada uma
   * dispara WhatsApp de novo.
   */
  noop?: boolean
  /**
   * Desvios que NÃO recusam, mas ficam registrados. É por aqui que se aprende
   * qual é a matriz de sequência verdadeira, antes de um dia ligá-la.
   */
  avisos: string[]
}

/** O que a guarda precisa saber sobre quem age. */
export type ActorTransicao = {
  id: string
  /** `UsuarioOrganizacao.papel` na empresa ativa — ver lib/papel.ts. */
  papel: string | null
  /**
   * A permissão EFETIVA desta pessoa nesta empresa, de `permissaoEfetiva`.
   *
   * `null` significa "não foi possível determinar" — sem vínculo, vínculo de
   * outra empresa, pessoa inativa, papel ausente ou papel sem preset. Aqui
   * `null` NEGA, sem exceção nem para admin: se não se sabe quem a pessoa é
   * nesta empresa, não se autoriza nada.
   */
  permissoes: MapaPermissoes | null
  /** `Videomaker.id` da pessoa, quando ela tem perfil de videomaker. */
  videomakerId: string | null
  /**
   * De que lado da mesa está a empresa ativa NESTE card — de `requireDemandaAcesso`.
   *
   * Obrigatório de propósito. Um campo de segurança com valor padrão permissivo
   * é o mesmo "terceiro estado" que a auditoria de permissões condenou: quem
   * esquecer de preencher tem que ser recusado pelo compilador, não atendido
   * como dono.
   */
  origem: PapelNoCard
}

/** O que a guarda precisa saber sobre o job. */
export type JobTransicao = {
  videomakerId: string | null
  editorId: string | null
  linkBrutos: string | null
  linkFolderBrutos: string | null
  linkFinal: string | null
  motivoImpedimento: string | null
}

/**
 * Ações que pertencem ao videomaker no job dele (§37.2).
 *
 * Ele pode executá-las mesmo sem `moverKanban` — é o trabalho dele, e é o que
 * o `VideomakerDashboard` já faz hoje. Fora desta lista, nada.
 */
export const ACOES_DO_VIDEOMAKER: StatusInterno[] = [
  "videomaker_aceitou",
  "videomaker_recusou",
  "captacao_agendada",
  "captacao_realizada",
  "brutos_enviados",
]

/**
 * O que a empresa que executa por ESPELHAMENTO pode fazer no card de outra.
 *
 * A régua não é o papel da pessoa, é a fronteira do contrato: quem executa
 * capta, edita e entrega o material; quem é dona aprova, publica e encerra,
 * porque é ela que responde ao cliente final (§24 e §38 do documento de Jobs,
 * aplicados entre empresas em vez de entre papéis).
 *
 * Ficam de fora, e a ausência é a regra: `aprovado`, `postagem_pendente`,
 * `postado`, `entregue_cliente`, `encerrado`, `expirado`.
 */
export const STATUS_PERMITIDOS_AO_ESPELHO: StatusInterno[] = [
  "videomaker_notificado",
  "videomaker_aceitou",
  "videomaker_recusou",
  "captacao_agendada",
  "captacao_realizada",
  "brutos_enviados",
  "editor_atribuido",
  "fila_edicao",
  "editando",
  "edicao_finalizada",
  "revisao_pendente",
  "ajuste_solicitado",
  "impedimento",
]

/** Quem administra a empresa passa por cima de tudo, como no resto do app. */
function ehGestao(papel: string | null): boolean {
  return papel === "admin" || papel === "gestor"
}

/**
 * A guarda. Pura de propósito: a rota resolve os dados, esta função decide.
 *
 * `observacao` e `body` entram para as precondições que já existiam soltas na
 * rota (link de brutos, link final, motivo de impedimento) — centralizá-las era
 * o pedido, e mudá-las não.
 */
export function podeTransicionar(entrada: {
  statusAtual: StatusInterno
  novoStatus: string
  usuario: ActorTransicao
  demanda: JobTransicao
  /** Campos que chegam no mesmo PATCH e satisfazem precondição. */
  entrada?: { linkBrutos?: string | null; linkFinal?: string | null; observacao?: string | null }
}): ResultadoTransicao {
  const { statusAtual, novoStatus, usuario, demanda } = entrada
  const corpo = entrada.entrada ?? {}
  const avisos: string[] = []

  // ── 1. O status existe? ────────────────────────────────────────────────────
  // Mesma checagem que a rota já fazia, agora aqui dentro.
  if (!STATUS_PARA_COLUNA[novoStatus as StatusInterno]) {
    return { ok: false, codigo: "status_inexistente", motivo: `Status "${novoStatus}" inválido`, avisos }
  }
  const alvo = novoStatus as StatusInterno

  // ── 2. Pedir o que já vale ─────────────────────────────────────────────────
  // Não é erro: é repetição. Aceita e sinaliza para a rota não duplicar efeito.
  //
  // Fica antes da autoridade de propósito, mas DEPOIS do fail-closed abaixo não
  // caberia: quem não tem permissão determinável não passa nem aqui. Por isso a
  // checagem de `permissoes === null` é a primeira coisa da seção 3, e o no-op
  // só vale para quem a resolução conseguiu identificar.
  if (usuario.permissoes !== null && statusAtual === alvo) {
    return { ok: true, noop: true, avisos }
  }

  // ── 3. Autoridade ──────────────────────────────────────────────────────────
  // Fail-closed antes de tudo: sem permissão determinável não se autoriza nada.
  // Vem antes do bypass de gestão de propósito — uma pessoa inativa com papel
  // `admin` continua sem autorização, e é exatamente o caso que a regra pede.
  if (usuario.permissoes === null) {
    return {
      ok: false,
      codigo: "sem_autoridade",
      motivo: "Não foi possível determinar suas permissões nesta empresa.",
      avisos: ["permissao_indeterminada"],
    }
  }

  // ── 3.1 De que lado da mesa ────────────────────────────────────────────────
  // Quem executa o card de outra empresa está preso à lista do executor, e o
  // bypass de gestão NÃO alcança aqui: um admin da produtora terceirizada é
  // gestão na empresa DELE, não no contrato que a origem tem com o cliente
  // final. Sem esta seção, `ehGestao` deixaria esse admin marcar
  // `entregue_cliente` num card que não é da empresa dele.
  if (usuario.origem === "espelho" && !STATUS_PERMITIDOS_AO_ESPELHO.includes(alvo)) {
    return {
      ok: false,
      codigo: "fora_do_espelho",
      motivo:
        "Esta demanda é executada por espelhamento. Aprovação, publicação e encerramento são da empresa de origem.",
      avisos,
    }
  }

  const podeMover = podePermissao(usuario.permissoes, "moverKanban")
  const gestao = ehGestao(usuario.papel) && usuario.origem === "dona"
  const ehAcaoDeVideomaker = ACOES_DO_VIDEOMAKER.includes(alvo)
  // "Este job é meu" — a relação exigida pelo §52.
  const jobEhDele =
    !!usuario.videomakerId && !!demanda.videomakerId && usuario.videomakerId === demanda.videomakerId

  if (!gestao) {
    if (usuario.papel === "videomaker") {
      // O papel mais restrito, e o único que os dados permitem prender com
      // segurança: 1 mudança de status em 2.242 registros.
      if (!ehAcaoDeVideomaker) {
        return {
          ok: false,
          codigo: "fora_do_seu_papel",
          motivo: "Videomaker não altera este status. As ações disponíveis são aceitar, recusar, agendar e finalizar a captação, e enviar o material.",
          avisos,
        }
      }
      if (!jobEhDele) {
        return {
          ok: false,
          codigo: "nao_e_seu_job",
          motivo: "Este job não está atribuído a você.",
          avisos,
        }
      }
    } else if (ehAcaoDeVideomaker && !jobEhDele) {
      // Alguém que não é videomaker mexendo em ação de videomaker: permitido
      // (é o admin confirmando no lugar dele, o que DemandaDetalhe já faz), mas
      // registrado quando não há relação nenhuma com o job.
      avisos.push(`acao_de_videomaker_por_terceiro:${usuario.papel ?? "sem_papel"}`)
    }

    // Sem `moverKanban` efetivo não se move — venha o valor de registro
    // explícito ou do preset do papel, a resposta é a mesma e é determinística.
    // A exceção são as ações próprias do videomaker no job dele: aquilo é o
    // trabalho dele, não gestão de quadro (§37.2), e 61 dos 63 videomakers têm
    // `moverKanban: false`.
    if (!podeMover && !(ehAcaoDeVideomaker && jobEhDele)) {
      return {
        ok: false,
        codigo: "sem_autoridade",
        motivo: "Você não tem permissão para mover demandas.",
        avisos,
      }
    }
  }

  // ── 4. Precondições de negócio ─────────────────────────────────────────────
  // Estavam soltas na rota. Comportamento idêntico ao que já valia — este passo
  // é centralização, não regra nova.
  const temBrutos = demanda.linkBrutos || corpo.linkBrutos || demanda.linkFolderBrutos
  if (alvo === "brutos_enviados" && !temBrutos) {
    return {
      ok: false,
      codigo: "precondicao",
      motivo: "Link dos brutos obrigatório para avançar. Adicione o link da pasta ou do arquivo antes de marcar como entregue.",
      avisos,
    }
  }
  if (alvo === "edicao_finalizada" && !demanda.linkFinal && !corpo.linkFinal) {
    return { ok: false, codigo: "precondicao", motivo: "Link do vídeo final obrigatório.", avisos }
  }
  if (alvo === "impedimento" && !corpo.observacao && !demanda.motivoImpedimento) {
    return { ok: false, codigo: "precondicao", motivo: "Motivo do impedimento obrigatório.", avisos }
  }

  // ── 5. Sequência: observa, não recusa ──────────────────────────────────────
  // A matriz idealizada contra a operação real. Enquanto o log não disser qual
  // é a matriz verdadeira, isto é telemetria — nunca porta.
  const permitidos = TRANSICOES_VALIDAS[statusAtual]
  if (!permitidos) {
    avisos.push(`sequencia_origem_sem_regra:${statusAtual}->${alvo}`)
  } else if (!permitidos.includes(alvo)) {
    avisos.push(`sequencia_fora_da_matriz:${statusAtual}->${alvo}`)
  }

  return { ok: true, avisos }
}
