// Copia o Storage do projeto Supabase antigo para o novo, com os mesmos caminhos.
//
// Por que existe: em 07/09/2026 o banco foi para São Paulo, mas os arquivos
// ficaram no projeto antigo (us-west-1). Em 28/10/2026 o Giovani decidiu apagar
// a conta antiga. Supabase não copia entre projetos, então cada objeto passa por
// aqui: baixa do antigo, confere, sobe no novo. Ver PLANO-MUDANCA-STORAGE.md.
//
// O que copia:
//   - `midia` (privado, em uso): tudo, mesmo caminho. Os links do banco são
//     `/api/midia/{caminho}`, então continuam valendo sem mudar nada.
//   - `uploads` (o antigo público): só o que NÃO tem cópia em
//     `midia/org/{org}/legado/{caminho}` com o mesmo tamanho. Vai para um bucket
//     `uploads` PRIVADO no novo, para nada se perder quando a conta antiga sumir.
//     O vídeo do depoimento, único sem cópia, foi copiado em 28/10 dentro do
//     projeto antigo para `midia/org/{org}/depoimentos/{id}/`, e vem com o `midia`.
//
// Garantias: nunca apaga, nunca sobrescreve. Objeto que já existe no destino com
// o mesmo tamanho é pulado, então pode rodar quantas vezes for preciso (a segunda
// passada pega o que entrou durante a virada). Cada cópia confere tamanho e, quando
// o Storage devolve um ETag simples, o MD5. O relatório (JSON por linha) guarda
// tamanho, sha256 e MD5 de cada objeto copiado.
//
// Uso (sem --aplicar, só mostra o plano):
//   node scripts/storage/copiar-projeto.mjs --origem ../../../.env.local \
//     --destino ~/nuflow-virada/storage-destino.env [--aplicar] [--maximo-mb 50]
//
// A origem lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY; o destino,
// DESTINO_SUPABASE_URL e DESTINO_SERVICE_ROLE_KEY. Nenhuma chave é impressa.
import { readFileSync, appendFileSync, mkdirSync } from "node:fs"
import { createHash } from "node:crypto"
import { homedir } from "node:os"
import { join } from "node:path"

const args = process.argv.slice(2)
const valor = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined }
const aplicar = args.includes("--aplicar")
// Limite de upload do destino, quando ainda é menor que o maior arquivo: o que passa dele
// fica "adiado" sem ser baixado, e uma rodada posterior, com o limite certo, completa.
const maximo = Number(valor("--maximo-mb") ?? Infinity) * 1024 ** 2

function lerEnv(arquivo, chaveUrl, chaveKey) {
  const env = Object.fromEntries(readFileSync(arquivo.replace(/^~/, homedir()), "utf8").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")] }))
  const u = new URL(env[chaveUrl] ?? "")
  if (u.protocol !== "https:" || !u.hostname.endsWith(".supabase.co") || u.pathname !== "/" || !env[chaveKey]) throw new Error(`${arquivo}: ${chaveUrl}/${chaveKey} ausentes ou inválidos`)
  return { origem: u.origin, key: env[chaveKey], ref: u.hostname.split(".")[0] }
}

function projeto({ origem, key }) {
  const h = { Authorization: `Bearer ${key}`, apikey: key }
  const url = (p) => `${origem}/storage/v1/${p}`
  const caminho = (bucket, p) => `${bucket}/${p.split("/").map(encodeURIComponent).join("/")}`
  async function json(p, init = {}) {
    const r = await fetch(url(p), { ...init, headers: { ...h, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers }, redirect: "error", signal: AbortSignal.timeout(60_000) })
    const corpo = await r.text()
    return { status: r.status, corpo: corpo ? JSON.parse(corpo) : null }
  }
  return {
    buckets: async () => (await json("bucket")).corpo,
    criarBucket: (id) => json("bucket", { method: "POST", body: JSON.stringify({ id, name: id, public: false }) }),
    info: async (bucket, p) => { const r = await json(`object/info/${caminho(bucket, p)}`); return r.status === 200 ? r.corpo : null },
    async listar(bucket) {
      const todos = [], fila = [""]
      while (fila.length) {
        const prefixo = fila.shift()
        for (let offset = 0; ; offset += 1000) {
          const r = await json(`object/list/${bucket}`, { method: "POST", body: JSON.stringify({ prefix: prefixo, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }) })
          if (r.status !== 200) throw new Error(`listar ${bucket}/${prefixo}: ${r.status}`)
          for (const it of r.corpo) {
            const p = prefixo ? `${prefixo}/${it.name}` : it.name
            if (it.id === null) fila.push(p)
            else todos.push({ caminho: p, tamanho: Number(it.metadata?.size ?? 0), mime: it.metadata?.mimetype, cache: it.metadata?.cacheControl })
          }
          if (r.corpo.length < 1000) break
        }
      }
      return todos
    },
    async baixar(bucket, p) {
      const r = await fetch(url(`object/${caminho(bucket, p)}`), { headers: h, redirect: "error", signal: AbortSignal.timeout(30 * 60_000) })
      if (!r.ok) throw new Error(`baixar ${bucket}/${p}: ${r.status}`)
      return Buffer.from(await r.arrayBuffer())
    },
    async subir(bucket, p, corpo, mime, cache) {
      const r = await fetch(url(`object/${caminho(bucket, p)}`), { method: "POST", body: corpo, redirect: "error", signal: AbortSignal.timeout(30 * 60_000),
        headers: { ...h, "Content-Type": mime || "application/octet-stream", "x-upsert": "false", ...(cache ? { "Cache-Control": cache } : {}) } })
      if (!r.ok) {
        const corpo = await r.text()
        // 413: o destino recusa o tamanho; baixar de novo só gasta tráfego.
        throw Object.assign(new Error(`subir ${bucket}/${p}: ${r.status} ${corpo.slice(0, 200)}`), { semRepetir: /"413"|EntityTooLarge/.test(corpo) || r.status === 413 })
      }
    },
  }
}

const origem = lerEnv(valor("--origem") ?? ".env.local", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
const destino = lerEnv(valor("--destino") ?? "~/nuflow-virada/storage-destino.env", "DESTINO_SUPABASE_URL", "DESTINO_SERVICE_ROLE_KEY")
if (origem.origem === destino.origem) throw new Error("origem e destino são o mesmo projeto")
const A = projeto(origem), B = projeto(destino)
console.log(`origem ${origem.ref} → destino ${destino.ref}${aplicar ? "" : "  (simulação: nada é escrito sem --aplicar)"}`)

// ── Plano ──────────────────────────────────────────────────────────────────
const bucketsOrigem = (await A.buckets()).map((b) => b.id).sort()
if (bucketsOrigem.join() !== "midia,uploads") throw new Error(`buckets inesperados na origem: ${bucketsOrigem}`)
const midia = await A.listar("midia"), uploads = await A.listar("uploads")
const legado = new Map()
for (const o of midia) {
  const m = o.caminho.match(/^org\/[^/]+\/legado\/(.+)$/)
  if (m) legado.set(m[1], [...(legado.get(m[1]) ?? []), o.tamanho])
}
const plano = midia.map((o) => ({ de: ["midia", o.caminho], para: ["midia", o.caminho], ...o }))
let pulados = 0
for (const o of uploads) {
  if (legado.get(o.caminho)?.includes(o.tamanho)) { pulados++; continue }
  plano.push({ de: ["uploads", o.caminho], para: ["uploads", o.caminho], ...o })
}
const gb = (n) => (n / 1024 ** 3).toFixed(2) + " GB"
const total = (l) => l.reduce((s, o) => s + o.tamanho, 0)
console.log(`midia: ${midia.length} objetos, ${gb(total(midia))}`)
console.log(`uploads: ${uploads.length} objetos; ${pulados} já têm cópia idêntica no midia/legado; ${uploads.length - pulados} vão para o uploads privado (${gb(total(plano.filter((p) => p.para[0] === "uploads")))})`)
console.log(`total a conferir: ${plano.length} objetos, ${gb(total(plano))}; maior: ${(Math.max(...plano.map((p) => p.tamanho)) / 1024 ** 2).toFixed(0)} MB`)
const adiados = plano.filter((p) => p.tamanho > maximo)
if (adiados.length) console.log(`adiados por passar de ${maximo / 1024 ** 2} MB: ${adiados.length} objetos, ${gb(total(adiados))}`)

// ── Destino ────────────────────────────────────────────────────────────────
const bucketsDestino = await B.buckets()
for (const id of ["midia", "uploads"]) {
  const b = bucketsDestino.find((x) => x.id === id)
  if (b?.public) throw new Error(`bucket ${id} do destino é público; o plano exige privado`)
  if (!b) {
    console.log(`bucket ${id} (privado) não existe no destino${aplicar ? ": criando" : ""}`)
    if (aplicar) { const r = await B.criarBucket(id); if (r.status !== 200) throw new Error(`criar bucket ${id}: ${r.status}`) }
  }
}
if (!aplicar) {
  const amostra = await Promise.all(plano.slice(0, 5).map((p) => B.info(...p.para)))
  console.log(`no destino, dos 5 primeiros: ${amostra.filter(Boolean).length} já existem`)
  process.exit(0)
}

// ── Cópia ──────────────────────────────────────────────────────────────────
const dir = join(homedir(), "nuflow-virada")
mkdirSync(dir, { recursive: true })
const relatorio = join(dir, `storage-copia-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`)
const cont = { copiados: 0, jaEstavam: 0, conflitos: 0, falhas: 0, bytes: 0 }
const inicio = Date.now()
async function copiar(p) {
  const existente = await B.info(...p.para)
  if (existente) {
    const tam = Number(existente.size ?? existente.metadata?.size)
    if (tam === p.tamanho) { cont.jaEstavam++; return }
    cont.conflitos++
    appendFileSync(relatorio, JSON.stringify({ status: "conflito", de: p.de.join("/"), para: p.para.join("/"), origem: p.tamanho, destino: tam }) + "\n")
    return
  }
  let ultimoErro
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const corpo = await A.baixar(...p.de)
      if (corpo.length !== p.tamanho) throw new Error(`tamanho baixado ${corpo.length} ≠ listado ${p.tamanho}`)
      const sha256 = createHash("sha256").update(corpo).digest("hex"), md5 = createHash("md5").update(corpo).digest("hex")
      await B.subir(...p.para, corpo, p.mime, p.cache)
      const info = await B.info(...p.para)
      const tam = Number(info?.size ?? info?.metadata?.size)
      if (tam !== corpo.length) throw new Error(`destino com ${tam} bytes, esperado ${corpo.length}`)
      const etag = String(info?.metadata?.eTag ?? info?.etag ?? "").replace(/"/g, "")
      if (/^[a-f0-9]{32}$/.test(etag) && etag !== md5) throw new Error(`MD5 diverge no destino`)
      cont.copiados++; cont.bytes += corpo.length
      appendFileSync(relatorio, JSON.stringify({ status: "copiado", de: p.de.join("/"), para: p.para.join("/"), tamanho: corpo.length, sha256, md5, md5Conferido: /^[a-f0-9]{32}$/.test(etag) }) + "\n")
      return
    } catch (e) { ultimoErro = e; if (e.semRepetir) break }
  }
  cont.falhas++
  appendFileSync(relatorio, JSON.stringify({ status: "falha", de: p.de.join("/"), para: p.para.join("/"), erro: String(ultimoErro?.message ?? ultimoErro) }) + "\n")
  console.error(`falha: ${p.para.join("/")}: ${ultimoErro?.message ?? ultimoErro}`)
}
for (const p of adiados) appendFileSync(relatorio, JSON.stringify({ status: "adiado", de: p.de.join("/"), para: p.para.join("/"), tamanho: p.tamanho }) + "\n")
const fila = plano.filter((p) => p.tamanho <= maximo)
let feitos = 0
await Promise.all(Array.from({ length: 2 }, async () => {
  while (fila.length) {
    await copiar(fila.shift())
    if (++feitos % 20 === 0) console.log(`  ${feitos}/${plano.length - adiados.length} · ${gb(cont.bytes)} em ${Math.round((Date.now() - inicio) / 60000)} min`)
  }
}))
console.log(`\ncopiados ${cont.copiados} (${gb(cont.bytes)}) · já estavam ${cont.jaEstavam} · conflitos ${cont.conflitos} · falhas ${cont.falhas} · adiados ${adiados.length}`)
console.log(`relatório: ${relatorio}`)
process.exit(cont.conflitos || cont.falhas || adiados.length ? 1 : 0)
