import type { Prisma } from "@prisma/client"
import { entregaPecaVisual, temDecisaoDePeca } from "@/lib/growth-conteudo"
export const DIAS_NA_FILA = 30
export function filtroFilaTrabalho(agora = new Date()): Prisma.DemandaWhereInput {
  return { OR: [{ statusVisivel: { not: "finalizado" } }, { finalizadaEm: null }, { finalizadaEm: { gt: new Date(agora.getTime()-DIAS_NA_FILA*86400000) } }] }
}
export function estadoHistorico(status: string, finalizadaEm: Date | null, agora = new Date()) {
  if (status !== "finalizado") return "em_trabalho"
  if (!finalizadaEm) return "legado_sem_data"
  return finalizadaEm.getTime() <= agora.getTime()-DIAS_NA_FILA*86400000 ? "historico" : "concluido_recente"
}
export function exigeArquivo(area: string, tipo: string): boolean | null {
  if (area === "design") return temDecisaoDePeca(tipo) ? entregaPecaVisual(tipo) : null
  // Tipos audiovisuais de serviço não provam entrega de vídeo.
  if (["entrega_equipamento"].includes(tipo)) return false
  return ["reels", "institucional", "video_institucional", "video_meta_ads", "ads", "depoimento", "video", "motion", "podcast", "youtube", "produto", "apresentacao_equipamento", "treinamento", "vsl", "tutorial", "social_media", "aftermovie", "corte_simples"].includes(tipo) ? true : null
}
export const POLITICA_RETENCAO = { versao: 1, original: "preservar", previa: "preservar", final: "preservar", excluirAutomaticamente: false, carenciaHoras: 48, armazenamentoVerificado: false, economiaBytes: null } as const
