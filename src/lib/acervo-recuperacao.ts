import { identidadeEntregavel } from "@/lib/metricas-entregaveis"
import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "@prisma/client"
import { comOrg } from "@/lib/org-contexto"
import { identificarMidia, videoDaDemanda } from "@/lib/midia-identidade"
import { metadadosFonte } from "@/lib/arquivo-fonte"
import { exigeArquivo, POLITICA_RETENCAO } from "@/lib/acervo-regras"
import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
const select = { id: true, codigo: true, titulo: true, organizacaoId: true, area: true, tipoVideo: true, statusVisivel: true, updatedAt: true, linkFinal: true,
  arquivos: { orderBy: { id: "asc" as const }, select: { id: true, tipoArquivo: true, url: true } },
  aprovacoesVideo: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 21, select: { id: true, urlVideo: true, status: true } },
} satisfies Prisma.DemandaSelect
type Registro = Prisma.DemandaGetPayload<{ select: typeof select }>
type Ator = { organizacaoId: string; usuarioId: string }
type Item = { id: string; codigo: string; titulo: string; hash: string; classe: string; confianca: string; motivo: string; aplicavel: boolean; referencias: number }
export class ErroAcervo extends Error {}
function urlSegura(url: string, d: Registro) {
  const identidade = identificarMidia(url)
  if (!identidade) return false
  if (identidade.provedor === "supabase") return videoDaDemanda(identidade,d.organizacaoId,d.id) && !url.includes("?")
  try { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password && !u.hash } catch { return false }
}
function classificar(d: Registro) {
  const finais = d.arquivos.filter(a => a.tipoArquivo === "final" && a.url.trim())
  const ultimas = new Map<string,{status:string;url:string}>()
  for (const a of d.aprovacoesVideo) if (!ultimas.has(identidadeEntregavel(a.urlVideo))) ultimas.set(identidadeEntregavel(a.urlVideo),{status:a.status,url:a.urlVideo})
  const aprovadas = [...ultimas.values()].filter(a => a.status === "aprovado").map(a => a.url)
  const bruto = (url: string) => d.arquivos.some(a => a.tipoArquivo === "bruto" && identidadeEntregavel(a.url) === identidadeEntregavel(url))
  const candidato = d.linkFinal?.trim() || (aprovadas.length === 1 && d.aprovacoesVideo.length < 21 ? aprovadas[0] : null)
  const base = { id: d.id, codigo: d.codigo, titulo: d.titulo, hash: createHash("sha256").update(JSON.stringify(d)).digest("hex"), referencias: finais.length+aprovadas.length+(d.linkFinal ? 1 : 0) }
  let classe = "legado_sem_dado", confianca = "inconclusiva", motivo = "Nenhuma referência final demonstrável; isso não comprova perda de arquivo.", aplicavel = false
  if (finais.length) { classe = "final_vinculado"; confianca = "registro"; motivo = "Já existe registro final. Disponibilidade no armazenamento não verificada." }
  else if (candidato && d.aprovacoesVideo.length < 21 && urlSegura(candidato,d) && !bruto(candidato) && (!ultimas.has(identidadeEntregavel(candidato)) || ultimas.get(identidadeEntregavel(candidato))?.status === "aprovado")) {
    classe = identificarMidia(candidato)?.provedor === "supabase" ? "final_nao_vinculado" : "entrega_externa"
    confianca = "referencia_explicita"; motivo = "Link final explícito ou aprovação única; só o vínculo será recuperado, sem baixar ou certificar bytes."; aplicavel = true
  } else if (exigeArquivo(d.area,d.tipoVideo) === false) { classe = "tipo_sem_arquivo"; confianca = "regra_tipo"; motivo = "Este tipo não exige arquivo final. Serviço e custos permanecem no histórico." }
  else if (candidato || aprovadas.length > 1 || d.aprovacoesVideo.length >= 21) { classe = "revisao_manual"; motivo = "Referência ambígua, não aprovada, insegura ou vinculada a bruto. Nenhuma promoção automática." }
  return { item: { ...base, classe, confianca, motivo, aplicavel } satisfies Item, candidato }
}
/** Só referências do banco: não consulta Storage, não escreve arquivo e não promove bruto. */
export async function simularAcervo(db: PrismaClient, ator: Ator, cursor?: string) {
  if (cursor && !/^[\w-]{1,128}$/.test(cursor)) throw new ErroAcervo("Cursor inválido")
  return comOrg(ator.organizacaoId, () => db.$transaction(async tx => {
    const demandas = await tx.demanda.findMany({ where: { organizacaoId: ator.organizacaoId, statusVisivel: { in: ["finalizado", "para_postar"] }, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: 26, select })
    const itens = demandas.slice(0,25).map(d => classificar(d).item)
    const lote = await tx.loteAcervo.create({ data: { organizacaoId: ator.organizacaoId, operadorId: ator.usuarioId, snapshot: itens, expiraEm: new Date(Date.now()+3600000) } })
    await registrarAuditoria(tx,ator,{ acao: "manutencao.arquivos", recurso: "lote_acervo", recursoId: lote.id, correlationId: correlacaoAuditoria(), resultado: "intencao", depois: { processados: itens.length } })
    return { loteId: lote.id, expiraEm: lote.expiraEm, itens, proximoCursor: demandas.length > 25 ? itens.at(-1)!.id : null, retencao: POLITICA_RETENCAO }
  }))
}
export async function aplicarAcervo(db: PrismaClient, ator: Ator, loteId: string) {
  if (!/^[\w-]{1,128}$/.test(loteId)) throw new ErroAcervo("Lote inválido")
  return comOrg(ator.organizacaoId, () => db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM lotes_acervo WHERE id=${loteId} AND "organizacaoId"=${ator.organizacaoId} FOR UPDATE`
    const lote = await tx.loteAcervo.findFirst({ where: { id: loteId, organizacaoId: ator.organizacaoId, operadorId: ator.usuarioId } })
    if (!lote) throw new ErroAcervo("Lote não encontrado para este operador")
    if (lote.estado === "aplicado") return lote.resultado
    if (lote.expiraEm <= new Date()) throw new ErroAcervo("Simulação expirada; simule novamente")
    const itens = lote.snapshot as unknown as Item[]
    const relatorio: { demandaId: string; antes: number; depois: number; resultado: string; arquivoId?: string }[] = []
    for (const item of itens) {
      if (!item.aplicavel) continue
      await tx.$queryRaw`SELECT id FROM demandas WHERE id=${item.id} AND "organizacaoId"=${ator.organizacaoId} FOR UPDATE`
      const atual = await tx.demanda.findFirst({ where: { id: item.id, organizacaoId: ator.organizacaoId }, select })
      const plano = atual ? classificar(atual) : null
      if (!plano || plano.item.hash !== item.hash || !plano.item.aplicavel || !plano.candidato || !atual) {
        relatorio.push({ demandaId: item.id, antes: 0, depois: 0, resultado: "precondicao_alterada" }); continue
      }
      const arquivo = await tx.arquivo.create({ data: { ...metadadosFonte(plano.candidato,ator.organizacaoId,item.id), demandaId: item.id, tipoArquivo: "final", url: plano.candidato, nomeArquivo: `${atual.codigo} — referência recuperada`, origem: "recuperacao_assistida", sequencia: 1 } })
      relatorio.push({ demandaId: item.id, antes: 0, depois: 1, resultado: "vinculo_recuperado", arquivoId: arquivo.id })
      await registrarAuditoria(tx,ator,{ acao: "manutencao.arquivos", recurso: "arquivo", recursoId: arquivo.id, correlationId: lote.id, antes: { alterados: 0 }, depois: { alterados: 1, publicado: false } })
    }
    const resultado = { loteId, relatorio, recuperados: relatorio.filter(r => r.resultado === "vinculo_recuperado").length, armazenamentoVerificado: false }
    await tx.loteAcervo.update({ where: { id: loteId, organizacaoId: ator.organizacaoId }, data: { estado: "aplicado", aplicadoEm: new Date(), resultado } })
    return resultado
  }, { isolationLevel: "Serializable", timeout: 15000 }))
}
