import { z } from "zod"
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
const chave = z.string().max(2048).refine(s => s.split("/").every(p => /^[a-zA-Z0-9_.-]+$/.test(p) && p !== "." && p !== ".."), "chave canônica, sem URL ou token")
const data = z.string().datetime({ offset: true })
const objeto = z.object({ bucket: z.string().min(1).max(64), chave, bytes: z.number().int().nonnegative().safe(), criadoEm: data }).strict()
export const snapshotSchema = z.object({
  versao: z.literal(1), organizacaoId: id, observadoEm: data,
  // A coleta deve provar estas condições; o classificador não as deduz de uma amostra.
  evidencia: z.object({ storageCompleto: z.boolean(), referenciasCompletas: z.boolean(), jobsCompletos: z.boolean(), recibosConciliados: z.boolean(), consistente: z.boolean() }).strict(),
  carenciaHoras: z.number().int().min(24).max(87600),
  objetos: z.array(objeto).max(100000),
  referencias: z.array(z.object({ bucket: z.string().min(1).max(64), chave, tipo: z.enum(["fonte", "original", "atual", "publicacao", "thumbnail", "demanda", "aprovacao", "outro"]), registroId: id }).strict()).max(500000),
  arquivos: z.array(z.object({ id, demandaId: id, organizacaoId: id }).strict()).max(100000),
  jobs: z.array(z.object({ id, tipo: z.literal("midia.converter"), organizacaoId: id, arquivoId: id, fonteVersao: z.number().int().positive().safe(), perfil: z.literal("h264-720p-v1"), estado: z.enum(["pendente", "executando", "concluido", "falhou", "cancelado", "expirado"]), encerradoEm: data.nullable(), leaseToken: id.nullable() }).strict()).max(100000),
}).strict()
const identidade = (bucket, key) => `${bucket}\0${key}`
function indexar(itens, key) {
  const map = new Map(), ambiguos = new Set()
  for (const item of itens) { const k = key(item); if (map.has(k)) ambiguos.add(k); else map.set(k, item) }
  return { map, ambiguos }
}
/** Puro/offline. Resultado nunca contém uma instrução de exclusão. */
export function analisarInventario(entrada) {
  const s = snapshotSchema.parse(entrada), agora = Date.parse(s.observadoEm), carencia = s.carenciaHoras * 3600000
  const referencias = new Set(s.referencias.map(r => identidade(r.bucket, r.chave)))
  const arquivos = indexar(s.arquivos, a => a.id), jobs = indexar(s.jobs, j => j.id)
  const objetos = indexar(s.objetos, o => identidade(o.bucket, o.chave))
  const completa = Object.values(s.evidencia).every(Boolean)
  const itens = [...objetos.map.values()].map(o => {
    const base = { ...o, organizacaoId: s.organizacaoId }
    const resultado = (situacao, motivo, extra = {}) => ({ ...base, ...extra, situacao, motivo })
    const p = o.chave.split("/")
    if (o.bucket !== "midia" || p[0] !== "org" || p[1] !== s.organizacaoId || p[2] !== "videos" || p[4] !== "previews" || p.length !== 9 || p[7] !== "h264-720p-v1" || !/^[1-9]\d*$/.test(p[6]) || !p[8].endsWith(".mp4")) return resultado("fora_escopo", "nao_e_previa_v2_da_empresa")
    if (referencias.has(identidade(o.bucket, o.chave))) return resultado("preservar", "objeto_referenciado")
    if (objetos.ambiguos.has(identidade(o.bucket, o.chave))) return resultado("inconclusivo", "objeto_duplicado_no_inventario")
    if (!completa) return resultado("inconclusivo", "coleta_incompleta_ou_nao_conciliada")
    const arquivo = arquivos.map.get(p[5])
    if (!arquivo || arquivos.ambiguos.has(p[5]) || arquivo.organizacaoId !== s.organizacaoId || arquivo.demandaId !== p[3]) return resultado("inconclusivo", "vinculo_do_arquivo_nao_confirmado")
    // Job/lease podem conter hífens: nunca dividir o nome supondo posição fixa.
    const nome = p[8].slice(0, -4), candidatos = []
    for (let i = nome.indexOf("-"); i !== -1; i = nome.indexOf("-", i + 1)) {
      const job = jobs.map.get(nome.slice(0, i)), lease = nome.slice(i + 1)
      if (job && /^[a-zA-Z0-9_-]{1,128}$/.test(lease)) candidatos.push({ job, lease })
    }
    if (candidatos.length !== 1) return resultado("inconclusivo", "tentativa_desconhecida_ou_ambigua")
    const { job } = candidatos[0]
    const extra = { arquivoId: arquivo.id, demandaId: arquivo.demandaId, jobId: job.id, fonteVersao: Number(p[6]), perfil: p[7] }
    if (jobs.ambiguos.has(job.id) || job.organizacaoId !== s.organizacaoId || job.arquivoId !== arquivo.id || job.fonteVersao !== Number(p[6]) || job.perfil !== p[7]) return resultado("inconclusivo", "job_incompativel", extra)
    if (["pendente", "executando"].includes(job.estado)) return resultado("preservar", "job_ativo", extra)
    if (job.leaseToken !== null) return resultado("inconclusivo", "lease_ainda_registrado", extra)
    if (!job.encerradoEm) return resultado("inconclusivo", "sem_data_de_encerramento", extra)
    if (Date.parse(o.criadoEm) > agora || Date.parse(job.encerradoEm) > agora) return resultado("inconclusivo", "data_futura", extra)
    if (agora - Math.max(Date.parse(o.criadoEm), Date.parse(job.encerradoEm)) < carencia) return resultado("preservar", "dentro_da_carencia", extra)
    return resultado("revisar", "sem_referencia_no_snapshot_declarado_completo", extra)
  }).sort((a,b) => a.bucket.localeCompare(b.bucket) || a.chave.localeCompare(b.chave))
  const resumo = Object.fromEntries(["preservar", "inconclusivo", "fora_escopo", "revisar"].map(tipo => [tipo, { objetos: itens.filter(i => i.situacao === tipo).length, bytes: itens.filter(i => i.situacao === tipo).reduce((n,i) => n + BigInt(i.bytes), 0n).toString() }]))
  return { versao: 1, modo: "somente_leitura", autorizaExclusao: false, organizacaoId: s.organizacaoId, observadoEm: s.observadoEm, carenciaHoras: s.carenciaHoras, evidenciaDeclarada: s.evidencia, resumo, itens }
}
