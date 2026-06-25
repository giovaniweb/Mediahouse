import { prisma } from "@/lib/prisma"

export interface VinculosUsuario {
  demandas: number          // como solicitante, gestor ou responsável
  historicos: number        // HistoricoStatus
  comentarios: number       // Comentario
  coberturas: number        // EventoCobertura criadas + logs
  eventos: number           // EventoGestao criados/responsável + logs
  profissional: number      // espelhos Videomaker/Editor/Designer vinculados
  memberships: number       // total de organizações a que pertence
  total: number             // soma dos vínculos que BLOQUEIAM hard delete
  podeExcluir: boolean      // true se nenhum vínculo bloqueante
}

// Conta os vínculos que orfanariam dados ou bloqueariam a exclusão física do Usuario.
// memberships é informativo (cascade no delete), não entra no total bloqueante.
export async function contarVinculos(usuarioId: string): Promise<VinculosUsuario> {
  const [
    demandas, historicos, comentarios,
    cobCriadas, cobLogs, evCriados, evResp, evLogs,
    vmMirror, edMirror, dgMirror, memberships,
  ] = await Promise.all([
    prisma.demanda.count({ where: { OR: [{ solicitanteId: usuarioId }, { gestorId: usuarioId }, { responsavelId: usuarioId }] } }),
    prisma.historicoStatus.count({ where: { usuarioId } }),
    prisma.comentario.count({ where: { usuarioId } }),
    prisma.eventoCobertura.count({ where: { createdById: usuarioId } }),
    prisma.eventoCoberturaLog.count({ where: { usuarioId } }),
    prisma.eventoGestao.count({ where: { createdById: usuarioId } }),
    prisma.eventoGestao.count({ where: { responsavelId: usuarioId } }),
    prisma.eventoGestaoLog.count({ where: { usuarioId } }),
    prisma.videomaker.count({ where: { usuarioId } }),
    prisma.editor.count({ where: { usuarioId } }),
    prisma.designer.count({ where: { usuarioId } }),
    prisma.usuarioOrganizacao.count({ where: { usuarioId } }),
  ])

  const coberturas = cobCriadas + cobLogs
  const eventos = evCriados + evResp + evLogs
  const profissional = vmMirror + edMirror + dgMirror
  const total = demandas + historicos + comentarios + coberturas + eventos + profissional

  return { demandas, historicos, comentarios, coberturas, eventos, profissional, memberships, total, podeExcluir: total === 0 }
}
