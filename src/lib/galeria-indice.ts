import { identidadeEntregavel } from "@/lib/metricas-entregaveis"
export type ItemGaleria = { id: string; demandaId: string; url: string; finalizadaEm: Date | null; anexadoEm: Date | null; updatedAt: Date; legado: boolean }
export function dataGaleria(item: ItemGaleria) {
  return { dataReferencia: item.finalizadaEm ?? item.anexadoEm ?? item.updatedAt,
    origemData: item.finalizadaEm ? "conclusao" : item.anexadoEm ? "anexacao" : "atualizacao",
    dataEstimada: !item.finalizadaEm && !item.anexadoEm }
}
/** Ordena antes de paginar; URLs equivalentes na mesma demanda são uma entrega. */
export function paginarGaleria<T extends ItemGaleria>(items: T[], page: number, limit: number) {
  const ordenados = items.filter(v => v.url.trim()).map(v => ({ ...v, ...dataGaleria(v) })).sort((a,b) =>
    b.dataReferencia.getTime()-a.dataReferencia.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const vistos = new Set<string>()
  const unicos = ordenados.filter(v => {
    const chave = JSON.stringify([v.demandaId,identidadeEntregavel(v.url)])
    if (vistos.has(chave)) return false
    vistos.add(chave); return true
  })
  return { total: unicos.length, page, limit, totalPages: Math.ceil(unicos.length/limit), unidadePaginacao: "entregaveis", itens: unicos.slice((page-1)*limit,page*limit) }
}
