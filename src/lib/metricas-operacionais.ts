import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { faixaMetricas, filtroConcluidas, type RecorteMetricas } from "@/lib/metricas-recorte"
import { contarEntregaveis } from "@/lib/metricas-entregaveis"
import { dataEmSaoPaulo, dataCalendario } from "@/lib/datas"
export async function carregarConcluidas(organizacaoId: string, recorte: RecorteMetricas) {
  return comOrg(organizacaoId, () => prisma.demanda.findMany({ where: filtroConcluidas(organizacaoId,recorte),
    select: { id: true, linkFinal: true, finalizadaEm: true, createdAt: true, dataLimite: true, tipoVideo: true, editorId: true, videomakerId: true,
      editor: { select: { id: true, nome: true } }, videomaker: { select: { id: true, nome: true } },
      arquivos: { where: { tipoArquivo: "final" }, select: { url: true, originalUrl: true } },
      aprovacoesVideo: { orderBy: [{ updatedAt: "desc" },{ id: "desc" }], select: { urlVideo: true, status: true } },
    }, orderBy: [{ finalizadaEm: "desc" },{ id: "asc" }] }))
}
export async function metricasOperacionais(organizacaoId: string, recorte: RecorteMetricas) {
  return comOrg(organizacaoId, async () => {
    const where = { organizacaoId, area: recorte.area }, faixa = faixaMetricas(recorte)
    const [finalizadas, criadas, ativas, semData, publicadas, evidenciaPublicacao, manuais] = await Promise.all([
      carregarConcluidas(organizacaoId,recorte),
      prisma.demanda.count({ where: { ...where, createdAt: faixa } }),
      prisma.demanda.count({ where: { ...where, statusVisivel: { not: "finalizado" } } }),
      prisma.demanda.count({ where: { ...where, statusVisivel: "finalizado", finalizadaEm: null } }),
      prisma.demanda.count({ where: { ...where, dataPostagem: faixa } }),
      prisma.demanda.count({ where: { ...where, dataPostagem: { not: null } } }),
      prisma.producaoManual.findMany({ where: { ...where, competencia: { gte: Number(recorte.de.slice(0,7).replace("-","")), lte: Number(recorte.ate.slice(0,7).replace("-","")) } }, select: { competencia: true, grupo: true, categoria: true, quantidade: true }, orderBy: [{ competencia: "asc" },{ categoria: "asc" }] }),
    ])
    const comPrazo = finalizadas.filter(d => d.dataLimite)
    const tempos = finalizadas.map(d => (d.finalizadaEm!.getTime()-d.createdAt.getTime())/86400000).filter(n => n >= 0)
    return {
      versao: recorte.versao, recorte, geradoEm: new Date().toISOString(), criadas, concluidas: finalizadas.length, ativas,
      entregaveis: finalizadas.reduce((n,d) => n+contarEntregaveis(d),0),
      publicacoes: evidenciaPublicacao ? publicadas : null,
      finalizadasSemData: semData,
      tempoMedioDias: tempos.length ? Math.round(tempos.reduce((a,b) => a+b,0)/tempos.length*10)/10 : null,
      noPrazoPercentual: comPrazo.length ? Math.round(comPrazo.filter(d => dataEmSaoPaulo(d.finalizadaEm!) <= dataCalendario(d.dataLimite!)!).length/comPrazo.length*100) : null,
      manual: { fonte: "lancamento_mensal" as const, lancamentos: manuais, total: manuais.filter(m => m.grupo === "producao").reduce((n,m) => n+m.quantidade,0), totalCombinado: null,
        aviso: "Lançamentos abrangem competências mensais e podem repetir entregas do sistema. Fontes não somadas." },
    }
  })
}
