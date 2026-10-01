// Ensaio descartável: Next completo + logins sem bypass + SDK Supabase real
// contra storage HTTP simulado. Nenhum .env ou credencial externa é aceito.
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import assert from 'node:assert/strict'
import pg from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { validarBancoTeste } from '../lib/banco-teste.mjs'
const url = validarBancoTeste(process.env.DATABASE_URL_TEST)
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  if (await access(file).then(() => true, () => false)) throw new Error(`Remova a ambiguidade do ambiente antes do ensaio: ${file}`)
}
const root = await mkdtemp(join(tmpdir(), 'nuflow-next-'))
const id = `ensaio-${randomBytes(6).toString('hex')}`, org = `${id}-org`, demanda = `${id}-d`, token = randomUUID(), outroToken = randomUUID()
const secret = randomBytes(24).toString('hex'), roles = [`teste_app_${randomBytes(6).toString('hex')}`, `teste_auth_${randomBytes(6).toString('hex')}`]
const sql = new pg.Client({ connectionString: url }), db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
const objetos = new Map(), tickets = new Map(), children = new Set()
let appOrigin, storageOrigin, previa, uploads = 0, ranges = 0, finalizando = false
const logs = []
function iniciar(args, env) {
  const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] }); children.add(child)
  child.stdout.on('data', c => logs.push(c.toString())); child.stderr.on('data', c => logs.push(c.toString()))
  child.done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => { children.delete(child); resolve(code) }) })
  return child
}
const json = (res, body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
const storage = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, storageOrigin)
    if (u.pathname === '/ensaio') {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(`<!doctype html><html lang="pt-BR"><title>Ensaio local de reprodução</title><h1>Prévia sintética — Next + worker</h1><video id="v" controls muted width="640" src="${appOrigin}${previa}?token=${token}"></video><p id="status">Aguardando metadados</p><button onclick="v.currentTime=3;v.play()">Ir para 3 segundos e reproduzir</button><script>const v=document.querySelector('video');for(const e of ['loadedmetadata','timeupdate','seeked','ended','error'])v.addEventListener(e,()=>document.querySelector('#status').textContent=JSON.stringify({evento:e,tempo:v.currentTime,duracao:v.duration,largura:v.videoWidth,altura:v.videoHeight,erro:v.error?.code??null}));</script></html>`); return
    }
    if (req.method === 'POST') {
      if (req.headers.authorization !== `Bearer ${secret}`) return json(res, {}, 403)
      const chunks = []; for await (const c of req) chunks.push(c)
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
      if (u.pathname === '/storage/v1/bucket') { assert.equal(body.public, false); return json(res, { name: 'midia' }) }
      if (!/^\/storage\/v1\/object\/(upload\/)?sign\/midia\//.test(u.pathname)) return json(res, {}, 404)
      const ticket = randomUUID(), upload = u.pathname.includes('/upload/')
      tickets.set(ticket, { path: u.pathname, ate: Date.now() + (upload ? 1200 : body.expiresIn) * 1000 })
      return json(res, upload ? { url: u.pathname.replace('/storage/v1', '') + `?token=${ticket}` } : { signedURL: u.pathname.replace('/storage/v1', '') + `?token=${ticket}` })
    }
    const t = tickets.get(u.searchParams.get('token'))
    if (!t || t.path !== u.pathname || t.ate <= Date.now()) return json(res, {}, 403)
    const key = u.pathname.replace(/^\/storage\/v1\/object\/(upload\/)?sign\/midia\//, '')
    if (req.method === 'PUT') {
      if (!u.pathname.includes('/upload/') || objetos.has(key)) return json(res, {}, 409)
      const chunks = []; for await (const c of req) chunks.push(c)
      objetos.set(key, Buffer.concat(chunks)); uploads++; return json(res, {})
    }
    const bytes = objetos.get(key); if (!bytes) return json(res, {}, 404)
    let start = 0, end = bytes.length - 1, status = 200
    if (req.headers.range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range)
      if (!m || Number(m[1]) >= bytes.length) { res.writeHead(416, { 'content-range': `bytes */${bytes.length}` }); res.end(); return }
      start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), end) : end; status = 206; ranges++
      res.setHeader('content-range', `bytes ${start}-${end}/${bytes.length}`)
    }
    res.writeHead(status, { 'content-type': key.endsWith('.mov') ? 'video/quicktime' : 'video/mp4', 'content-length': end - start + 1, 'accept-ranges': 'bytes', 'cache-control': 'no-store' })
    res.end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1))
  } catch { json(res, { erro: 'storage_sintetico' }, 500) }
})
async function encerrar() {
  if (finalizando) return; finalizando = true
  for (const c of children) c.kill('SIGTERM')
  await Promise.all([...children].map(c => c.done))
  storage.closeAllConnections(); await new Promise(resolve => storage.close(resolve))
  await db.organizacao.deleteMany({ where: { id: org } }); await db.usuario.deleteMany({ where: { id } }); await db.$disconnect()
  for (const role of roles) await sql.query(`DROP ROLE IF EXISTS "${role}"`)
  await sql.end(); await rm(root, { recursive: true, force: true })
}
try {
  await sql.connect()
  for (const [i, role] of roles.entries()) {
    await sql.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${secret}'`)
    await sql.query(`GRANT "${i ? 'app_auth' : 'app_user'}" TO "${role}"`)
  }
  const conexao = role => { const u = new URL(url); u.username = role; u.password = secret; return u.toString() }
  const probeRole = new pg.Client({ connectionString: conexao(roles[0]) }); await probeRole.connect()
  assert.equal((await probeRole.query('SELECT rolbypassrls OR rolsuper AS bypass FROM pg_roles WHERE rolname=current_user')).rows[0].bypass, false)
  await probeRole.end()
  await new Promise(resolve => storage.listen(0, '127.0.0.1', resolve)); storageOrigin = `http://127.0.0.1:${storage.address().port}`
  const porta = createServer(); await new Promise(resolve => porta.listen(0, '127.0.0.1', resolve)); const port = porta.address().port; await new Promise(resolve => porta.close(resolve)); appOrigin = `http://127.0.0.1:${port}`
  const r = spawnSync('ffmpeg', ['-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','6','-c:v','libx265','-threads','1','-x265-params','pools=1:frame-threads=1:log-level=error','-c:a','aac',join(root,'original.mov')], { timeout: 30000 }); assert.equal(r.status, 0)
  const source = await readFile(join(root,'original.mov')), key = `org/${org}/videos/${demanda}/original.mov`, originalUrl = `/api/midia/${key}`
  objetos.set(key, source)
  await db.organizacao.create({ data: { id: org, nome: 'Flow — ensaio sintético', slug: org } })
  await db.usuario.create({ data: { id, nome: id, tipo: 'admin', senhaHash: 'sem-login' } })
  for (const [d, tok] of [[demanda,token],[`${demanda}-outra`,outroToken]]) await db.demanda.create({ data: { id: d, organizacaoId: org, solicitanteId: id, codigo: d, titulo: 'Vídeo sintético de homologação', descricao: 'Teste local sem dados reais', cidade: 'Teste', departamento: 'growth', tipoVideo: 'reels', publicToken: tok, publicTokenAtivo: true, statusVisivel: 'finalizado', finalizadaEm: new Date() } })
  const arquivo = await db.arquivo.create({ data: { demandaId: demanda, tipoArquivo: 'final', nomeArquivo: 'original.mov', url: originalUrl, fonteProvedor: 'supabase', fonteBucket: 'midia', fonteObjectKey: key, fonteVersao: 1, fonteSha256: createHash('sha256').update(source).digest('hex') } })
  await db.jobAutomacao.create({ data: { organizacaoId: org, tipo: 'midia.preparar', referencia: arquivo.id, chave: `${arquivo.id}:1:h264-720p-v1`, payload: { fonteVersao: 1, perfil: 'h264-720p-v1' }, expiraEm: new Date(Date.now()+3600000) } })
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: root, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: `--import=${resolve('scripts/ensaio-midia/rede-local.mjs')}`, DATABASE_URL: conexao(roles[0]), AUTH_DATABASE_URL: conexao(roles[1]), RLS_ATIVO: 'sim', AUTH_SECRET: secret, AUTH_TRUST_HOST: 'true', MIDIA_WORKER_V2_ATIVO: 'sim', MIDIA_WORKER_ORGANIZACAO_ID: org, MIDIA_WORKER_SECRET: secret, NEXT_PUBLIC_SUPABASE_URL: storageOrigin, SUPABASE_SERVICE_ROLE_KEY: secret }
  const app = iniciar(['node_modules/next/dist/bin/next','dev','--webpack','-H','127.0.0.1','-p',String(port)],env)
  let ready = false
  for (let i=0;i<120;i++) { if (app.exitCode !== null) throw new Error('next_encerrou'); try { const r = await fetch(`${appOrigin}/api/transcode/worker`,{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(2000)}); if(r.status===401){ready=true;break} }catch{} await sleep(500) }
  assert.ok(ready, 'Next disponível')
  const worker = iniciar(['--import',resolve('scripts/ensaio-midia/rede-local.mjs'),'scripts/ensaio-midia/worker.mjs'],{PATH:process.env.PATH,HOME:process.env.HOME,ENSAIO_API_URL:`${appOrigin}/api/transcode/worker`,ENSAIO_STORAGE_URL:storageOrigin,ENSAIO_TEMP_DIR:join(root,'temps'),ENSAIO_STATE_DIR:join(root,'recibos'),MIDIA_WORKER_SECRET:secret})
  assert.equal(await worker.done,0)
  const salvo = await db.arquivo.findUniqueOrThrow({where:{id:arquivo.id}})
  assert.equal(salvo.transcodeStatus,'done'); assert.equal(salvo.originalUrl,originalUrl); assert.equal(uploads,1); previa=salvo.url
  for (const suffix of ['',`?token=${outroToken}`]) assert.equal((await fetch(`${appOrigin}${previa}${suffix}`,{redirect:'manual'})).status,404)
  const autorizado = await fetch(`${appOrigin}${previa}?token=${token}`,{redirect:'manual'}); assert.equal(autorizado.status,302)
  const assinada = autorizado.headers.get('location'), bytes = await fetch(assinada)
  assert.equal(createHash('sha256').update(Buffer.from(await bytes.arrayBuffer())).digest('hex'),salvo.previewSha256)
  await db.demanda.update({where:{id:demanda},data:{publicTokenAtivo:false}})
  assert.equal((await fetch(`${appOrigin}${previa}?token=${token}`,{redirect:'manual'})).status,404)
  assert.equal((await fetch(assinada)).status,200) // assinatura já emitida mantém TTL
  for(const t of tickets.values()) t.ate=0
  assert.equal((await fetch(assinada)).status,403)
  await db.demanda.update({where:{id:demanda},data:{publicTokenAtivo:true}})
  const manifest = { app: `${appOrigin}/d/${token}`, navegador: `${storageOrigin}/ensaio`, root, pid: process.pid, verificacoes: ['conversão real','login sem bypass','original preservado','token válido','sem token','token de outra demanda','revogação','TTL assinatura simulado'], modo:'Next dev webpack; storage simulado' }
  await writeFile(join(root,'resultado.json'),JSON.stringify(manifest,null,2))
  console.log('ENSAIO_PRONTO',JSON.stringify(manifest))
  if (!process.argv.includes('--verificar')) await new Promise(resolve => { const timer=setTimeout(resolve,15*60000); for(const s of ['SIGTERM','SIGINT'])process.once(s,()=>{clearTimeout(timer);resolve()}) })
  console.log('ENSAIO_FINAL',JSON.stringify({uploads,ranges}))
} catch(e) { console.error('ENSAIO_FALHOU',e.message); await writeFile('/private/tmp/nuflow-next-erro.log',logs.join('')); process.exitCode=1 }
finally { await encerrar() }
