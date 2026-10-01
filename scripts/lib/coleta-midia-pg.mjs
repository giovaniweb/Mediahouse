import pg from "pg"

// SQL estático + parâmetros. Nenhum nome de tabela vem da entrada do usuário.
const consultas = {
  arquivos: `SELECT a.id,a."demandaId",d."organizacaoId",a.url,a."originalUrl",a."thumbnailUrl",a."publicacaoUrl",a."publicacaoThumbnailUrl",a."previewObjectKey",a."fonteBucket",a."fonteObjectKey"
    FROM arquivos a JOIN demandas d ON d.id=a."demandaId" WHERE d."organizacaoId"=$1 AND a.id>$2 ORDER BY a.id LIMIT $3`,
  demandas: `SELECT id,"linkFinal","linkBrutos","linkPostagem","linkCliente","thumbnailUrl" FROM demandas WHERE "organizacaoId"=$1 AND id>$2 ORDER BY id LIMIT $3`,
  aprovacoes: `SELECT a.id,a."urlVideo" FROM aprovacoes_video a JOIN demandas d ON d.id=a."demandaId" WHERE d."organizacaoId"=$1 AND a.id>$2 ORDER BY a.id LIMIT $3`,
  jobs: `SELECT id,"organizacaoId",referencia,payload,estado,"finishedAt","leaseToken" FROM jobs_automacao WHERE "organizacaoId"=$1 AND tipo='midia.converter' AND id>$2 ORDER BY id LIMIT $3`,
}
const keyValida = key => key.split("/").every(p => /^[a-zA-Z0-9_.-]+$/.test(p) && ![".", ".."].includes(p))
function chaveUrl(valor, storageOrigin) {
  if (!valor) return null
  if (valor.startsWith("/api/midia/")) {
    const chave = valor.slice(11).split("?")[0]
    return keyValida(chave) ? { bucket: "midia", chave } : null
  }
  try {
    const u = new URL(valor)
    if (u.origin !== storageOrigin || u.username || u.password || u.hash || valor.split("?")[0].includes("%") || /\\/.test(valor)) return null
    const m = /^\/storage\/v1\/object\/(?:sign|public)\/(midia|uploads)\/(.+)$/.exec(u.pathname)
    return m && keyValida(m[2]) ? { bucket: m[1], chave: m[2] } : null
  } catch { return null }
}
export function criarColetorPg({ connectionString, storageOrigin, tamanhoPagina = 250, maxPaginas = 400 }) {
  if (!Number.isInteger(tamanhoPagina) || tamanhoPagina < 1 || tamanhoPagina > 1000 || !Number.isInteger(maxPaginas) || maxPaginas < 1) throw new Error("limites_invalidos")
  return async (organizacaoId, { signal } = {}) => {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(organizacaoId)) throw new Error("empresa_invalida")
    const c = new pg.Client({ connectionString, connectionTimeoutMillis: 10000, query_timeout: 15000 })
    try {
      await c.connect()
      const { rows: [role] } = await c.query(`SELECT r.rolsuper,r.rolbypassrls,pg_has_role(current_user,'app_user','MEMBER') AS membro,
        EXISTS(SELECT 1 FROM pg_class t WHERE t.relname IN ('arquivos','demandas','jobs_automacao') AND pg_has_role(current_user,t.relowner,'USAGE')) AS dono FROM pg_roles r WHERE r.rolname=current_user`)
      if (!role || role.rolsuper || role.rolbypassrls || role.dono || !role.membro) throw new Error("login_restrito_obrigatorio")
      await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
      await c.query("SELECT set_config('app.org_id',$1,true)", [organizacaoId])
      const empresa = await c.query('SELECT id FROM organizacoes WHERE id=$1 AND ativo=true', [organizacaoId])
      if (!empresa.rowCount) throw new Error("empresa_indisponivel")
      const dados = {}, completo = {}; let paginas = 0
      for (const [tipo, sql] of Object.entries(consultas)) {
        dados[tipo] = []; completo[tipo] = false; let cursor = ""
        while (paginas < maxPaginas) {
          signal?.throwIfAborted(); paginas++
          const { rows } = await c.query(sql, [organizacaoId, cursor, tamanhoPagina])
          dados[tipo].push(...rows)
          if (rows.length < tamanhoPagina) { completo[tipo] = true; break }
          const proximo = rows.at(-1).id
          if (proximo <= cursor) throw new Error("cursor_invalido")
          cursor = proximo
        }
      }
      await c.query("COMMIT")
      const referencias = [], arquivos = [], jobs = []
      const adicionar = (ref, tipo, registroId) => { if (ref) referencias.push({ ...ref, tipo, registroId }) }
      for (const a of dados.arquivos) {
        arquivos.push({ id: a.id, demandaId: a.demandaId, organizacaoId: a.organizacaoId })
        for (const [col,tipo] of [["url","atual"],["originalUrl","original"],["thumbnailUrl","thumbnail"],["publicacaoUrl","publicacao"],["publicacaoThumbnailUrl","publicacao"]]) adicionar(chaveUrl(a[col],storageOrigin),tipo,a.id)
        if (a.previewObjectKey && keyValida(a.previewObjectKey)) adicionar({bucket:"midia",chave:a.previewObjectKey},"atual",a.id)
        if (a.fonteObjectKey && a.fonteBucket && keyValida(a.fonteObjectKey)) adicionar({bucket:a.fonteBucket,chave:a.fonteObjectKey},"fonte",a.id)
      }
      for (const d of dados.demandas) for (const col of ["linkFinal","linkBrutos","linkPostagem","linkCliente","thumbnailUrl"]) adicionar(chaveUrl(d[col],storageOrigin),"demanda",d.id)
      for (const a of dados.aprovacoes) adicionar(chaveUrl(a.urlVideo,storageOrigin),"aprovacao",a.id)
      let jobsValidos = true
      for (const j of dados.jobs) {
        if (!Number.isSafeInteger(j.payload?.fonteVersao) || j.payload.fonteVersao < 1 || j.payload.perfil !== "h264-720p-v1" || !["pendente","executando","concluido","falhou","cancelado","expirado"].includes(j.estado)) { jobsValidos = false; continue }
        jobs.push({id:j.id,tipo:"midia.converter",organizacaoId:j.organizacaoId,arquivoId:j.referencia,fonteVersao:j.payload.fonteVersao,perfil:j.payload.perfil,estado:j.estado,encerradoEm:j.finishedAt?.toISOString()??null,leaseToken:j.leaseToken ? "presente" : null})
      }
      return { referencias, arquivos, jobs, jobsCompletos: completo.jobs && jobsValidos,
        // Cobre os vínculos operacionais de demanda; outros módulos/campos JSON
        // ainda podem referenciar objetos. Jamais declarar cobertura global aqui.
        referenciasCompletas: false,
        cobertura: { arquivos: completo.arquivos, demandas: completo.demandas, aprovacoes: completo.aprovacoes, jobs: completo.jobs } }
    } finally { await c.end() }
  }
}
