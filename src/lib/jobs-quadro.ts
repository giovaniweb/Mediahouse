// Arrastar no quadro de Gravações Externas (antes "Jobs").
//
// O quadro de Jobs não arrastava: mudar de etapa era só na página do Job (§3,
// §63 — "o Kanban representa o estado, não o define"). Em 07/10/2026 o pedido
// foi o quadro igual ao de Demandas e do Growth, com o arrasto. A regra do §3
// continua valendo de outro jeito: o card só muda de coluna se a MESMA guarda
// que o servidor aplica (lib/job-transicoes.ts) deixar. Arrastar para uma
// etapa que o servidor recusaria devolve o card com a explicação, antes de
// qualquer pedido — sem o card ir e voltar.
//
// Desde 28/10/2026 as colunas são as etapas da gravação
// (lib/etapas-da-gravacao.ts), não as do audiovisual.
//
// Sem import de runtime do Prisma: este módulo vai para o navegador.
import type { StatusInterno } from "@prisma/client"
import { podeTransicionar } from "./job-transicoes"
import { PEDE_TEXTO } from "./kanban-movimento"
import { ETAPAS, PEDE_VIDEOMAKER, etapaDaGravacao, statusAoSoltar, type EtapaDaGravacao } from "./etapas-da-gravacao"
import type { MapaPermissoes } from "./permissoes"

/** Quem arrasta, como /api/me devolve. `null` enquanto não carregou. */
export type AtorDoQuadro = {
  id: string
  /** `membership.papel` na empresa ativa. */
  papel: string | null
  permissoes: MapaPermissoes | null
  /** `videomakerRef.id`, quando a pessoa tem perfil de videomaker. */
  videomakerId: string | null
}

/** O que o card do quadro já traz da lista (/api/demandas devolve os escalares). */
export type JobArrastado = {
  statusInterno: string
  statusVisivel?: string | null
  videomakerId?: string | null
  editorId?: string | null
  linkBrutos?: string | null
  linkFolderBrutos?: string | null
  linkFinal?: string | null
  motivoImpedimento?: string | null
  /** De que lado da mesa esta empresa está no card (TagEspelho). */
  espelho?: { papel?: string | null } | null
}

export type Movimento =
  | { ok: true; statusInterno: StatusInterno; mudou: boolean }
  | { ok: false; motivo: string }

/**
 * Pode soltar esta gravação nesta etapa? Responde com o status que o PATCH vai
 * levar, ou com a frase que explica a recusa.
 *
 * Enquanto o perfil não carregou (`ator` nulo), deixa o servidor decidir: a
 * recusa dele volta o card e mostra a mesma frase.
 */
export function movimentoDoJob(job: JobArrastado, etapaDestino: string, ator: AtorDoQuadro | null): Movimento {
  const destino = ETAPAS.find((e) => e.id === etapaDestino)?.id as EtapaDaGravacao | undefined
  if (!destino) return { ok: false, motivo: "Esta etapa não recebe cards arrastados." }
  const origem = etapaDaGravacao(job)
  if (origem === destino) return { ok: true, statusInterno: job.statusInterno as StatusInterno, mudou: false }
  const statusInterno = statusAoSoltar(destino, origem)
  // A guarda do servidor não pede videomaker para agendar — a do quadro pede:
  // "Agendado" sem ninguém escalado é a mentira que a planilha contava.
  if (PEDE_VIDEOMAKER.includes(destino) && !job.videomakerId) {
    return { ok: false, motivo: "Escale o videomaker antes. Abra a gravação e escolha quem vai." }
  }
  // Nenhuma etapa pede texto hoje. Se um dia pedir, o quadro precisa
  // perguntar antes (como o Impedimento do Growth) — e este teste falha.
  if (PEDE_TEXTO[statusInterno]) return { ok: false, motivo: "Abra a gravação para mover para esta etapa." }
  if (!ator) return { ok: true, statusInterno, mudou: true }

  const veredito = podeTransicionar({
    statusAtual: job.statusInterno as StatusInterno,
    novoStatus: statusInterno,
    usuario: {
      id: ator.id,
      papel: ator.papel,
      permissoes: ator.permissoes,
      videomakerId: ator.videomakerId,
      origem: job.espelho?.papel === "destino" ? "espelho" : "dona",
    },
    demanda: {
      videomakerId: job.videomakerId ?? null,
      editorId: job.editorId ?? null,
      linkBrutos: job.linkBrutos ?? null,
      linkFolderBrutos: job.linkFolderBrutos ?? null,
      linkFinal: job.linkFinal ?? null,
      motivoImpedimento: job.motivoImpedimento ?? null,
    },
  })
  if (!veredito.ok) return { ok: false, motivo: veredito.motivo ?? "Você não pode mover esta gravação para esta etapa." }
  return { ok: true, statusInterno, mudou: !veredito.noop }
}
