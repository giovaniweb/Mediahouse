// Peças comuns da virada de produção. Nada aqui escreve por conta própria:
// cada função ou lê, ou é chamada por um passo que já anunciou o que vai fazer.
//
// Duas decisões de desenho que valem explicação:
//
// 1. O ESTADO mora fora do repositório (~/nuflow-virada/estado.json). Cada passo
//    grava o que fez e o passo seguinte confere que o anterior aconteceu. É o que
//    impede a sequência de pular o gate: `apontar` recusa rodar sem um `conferir`
//    verde no estado, e não por disciplina de quem digita.
//
// 2. Segredo nenhum é impresso. As senhas dos roles novos são geradas aqui,
//    gravadas em arquivo 600 fora do repositório e mandadas direto para a Vercel.
//    Elas não passam por terminal, por chat, nem por histórico de shell — que é
//    exatamente o defeito das senhas do preview (RLS-PLANO-DE-VOO.md §7.4).
import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { homedir } from "node:os"
import { join } from "node:path"
import { config } from "dotenv"
import pg from "pg"

export const CASA = join(homedir(), "nuflow-virada")
export const COFRE = join(homedir(), "nuflow-backups")
export const ARQ_ESTADO = join(CASA, "estado.json")
export const ARQ_DESTINO = join(CASA, "destino.env")
export const ARQ_URLS = join(CASA, "urls-destino.env")
export const ARQ_ENV_ANTES = join(CASA, "producao-antes.env")

export function garantirCasa() {
  for (const d of [CASA, COFRE]) if (!existsSync(d)) mkdirSync(d, { recursive: true })
}

// ── saída ────────────────────────────────────────────────────────────────────
export const titulo = (t) => console.log(`\n\x1b[1m▶ ${t}\x1b[0m`)
export const ok = (t) => console.log(`  ✅ ${t}`)
export const nao = (t) => console.log(`  ❌ ${t}`)
export const aviso = (t) => console.log(`  ⚠️  ${t}`)
export const nota = (t) => console.log(`     ${t}`)

export function abortar(msg, dica) {
  console.error(`\n\x1b[31m╔═══ PARADO ═══╗\x1b[0m\n\n  ${msg}\n`)
  if (dica) console.error(`  ${dica}\n`)
  process.exit(1)
}

// ── estado ───────────────────────────────────────────────────────────────────
export function lerEstado() {
  garantirCasa()
  if (!existsSync(ARQ_ESTADO)) return {}
  return JSON.parse(readFileSync(ARQ_ESTADO, "utf8"))
}

export function gravarEstado(fase, dados) {
  const e = lerEstado()
  e[fase] = { em: new Date().toISOString(), ...dados }
  writeFileSync(ARQ_ESTADO, JSON.stringify(e, null, 2))
  return e
}

/** Gate: o passo `fase` precisa ter terminado bem, senão este não começa. */
export function exigirFase(fase, comoFazer) {
  const e = lerEstado()
  if (!e[fase]?.ok) {
    abortar(
      `O passo "${fase}" não consta como concluído no estado da virada.`,
      `Rode antes:  node scripts/virada/virada.mjs ${comoFazer ?? fase}`
    )
  }
  return e[fase]
}

// ── binários do Postgres ─────────────────────────────────────────────────────
// O Mac do Giovani tem o libpq do Homebrew, que é keg-only: os binários existem
// e não estão no PATH. Procurar aqui evita "command not found" no meio da janela.
const CAMINHOS_PG = [
  "/opt/homebrew/opt/libpq/bin",
  "/opt/homebrew/opt/postgresql@17/bin",
  "/usr/local/opt/libpq/bin",
  "/Applications/Postgres.app/Contents/Versions/latest/bin",
]

export function binPg(nome) {
  for (const dir of CAMINHOS_PG) {
    const p = join(dir, nome)
    if (existsSync(p)) return p
  }
  try {
    return execFileSync("which", [nome], { encoding: "utf8" }).trim()
  } catch {
    abortar(
      `Não encontrei "${nome}".`,
      "Instale o cliente do Postgres:  brew install libpq"
    )
  }
}

export function versaoMaiorPg(bin) {
  const s = execFileSync(bin, ["--version"], { encoding: "utf8" })
  return Number((s.match(/(\d+)\./) ?? [])[1] ?? 0)
}

// ── execução ─────────────────────────────────────────────────────────────────
export function rodar(bin, args, opcoes = {}) {
  const r = spawnSync(bin, args, {
    stdio: opcoes.silencioso ? "pipe" : "inherit",
    encoding: "utf8",
    env: { ...process.env, ...(opcoes.env ?? {}) },
    input: opcoes.entrada,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) abortar(`Falhou ao executar ${bin}: ${r.error.message}`)
  return { codigo: r.status, saida: (r.stdout ?? "") + (r.stderr ?? "") }
}

export function vercel(args, opcoes = {}) {
  return rodar("vercel", [...args, "--non-interactive"], { silencioso: true, ...opcoes })
}

// ── conexões ─────────────────────────────────────────────────────────────────
export function mascarar(url) {
  try {
    const u = new URL(url)
    return `${u.username}:***@${u.host}${u.pathname}`
  } catch {
    return "url inválida"
  }
}

/** A ORIGEM é o banco de produção de hoje, lido do .env.local — nunca digitado. */
export function origem() {
  config({ path: join(process.cwd(), ".env.local") })
  const direta = process.env.DIRECT_URL
  const pooler = process.env.DATABASE_URL
  if (!direta || !pooler) {
    abortar("Sem DIRECT_URL/DATABASE_URL no .env.local — não sei qual é o banco de produção.")
  }
  return { direta, pooler }
}

/**
 * O DESTINO vem de ~/nuflow-virada/destino.env, com UMA linha:
 *
 *   DESTINO_DIRECT_URL=postgresql://postgres.<ref>:<senha>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
 *
 * É a única coisa que precisa ser colada à mão na virada inteira: a senha do
 * `postgres` só aparece no instante em que o projeto do Supabase é criado.
 */
export function destino() {
  if (!existsSync(ARQ_DESTINO)) {
    abortar(
      `Não existe ${ARQ_DESTINO}.`,
      "Crie o arquivo com uma linha DESTINO_DIRECT_URL=postgresql://postgres.<ref>:<senha>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
    )
  }
  const env = {}
  config({ path: ARQ_DESTINO, processEnv: env })
  const direta = env.DESTINO_DIRECT_URL
  if (!direta) abortar(`${ARQ_DESTINO} existe mas não tem DESTINO_DIRECT_URL.`)

  const u = new URL(direta)
  if (!u.host.includes("sa-east-1")) {
    abortar(
      `O destino não está em sa-east-1: ${u.host}`,
      "A virada existe para trazer o banco para São Paulo. Destino em outra região é engano, não atalho."
    )
  }
  if (u.port !== "5432") {
    abortar(
      `O destino aponta para a porta ${u.port}.`,
      "Restore e DDL precisam da conexão de sessão (5432). A 6543 é o pooler em modo transação."
    )
  }
  const ref = decodeURIComponent(u.username).split(".")[1]
  if (!ref) abortar("Não consegui extrair o project ref do usuário da URL de destino.")

  // A URL do pooler em modo transação, que é o que a aplicação usa. Montada, não
  // digitada: o host do Supabase que é IPv6-only não serve para a Vercel (§7.3).
  // hostname, NÃO host: `host` carrega a porta junto, e a URL do pooler sairia
  // com ":5432:6543". Custou uma prova de isolamento para aparecer.
  const poolerHost = u.hostname
  const comoUsuario = (papel, senha) =>
    `postgresql://${papel}.${ref}:${encodeURIComponent(senha)}@${poolerHost}:6543/postgres`

  return { direta, ref, poolerHost, senhaDono: decodeURIComponent(u.password), comoUsuario }
}

export async function comCliente(url, fn) {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20000 })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

export async function consultar(url, sql, params = []) {
  return comCliente(url, async (c) => (await c.query(sql, params)).rows)
}

// ── segredos ─────────────────────────────────────────────────────────────────
/** Senha forte gerada localmente. Não é impressa em lugar nenhum. */
export const senhaNova = () => randomBytes(24).toString("base64").replace(/[+/=]/g, "")

export function guardarUrls(mapa) {
  garantirCasa()
  const texto = Object.entries(mapa).map(([k, v]) => `${k}=${v}`).join("\n") + "\n"
  writeFileSync(ARQ_URLS, texto)
  chmodSync(ARQ_URLS, 0o600)
}

export function lerUrlsGuardadas() {
  if (!existsSync(ARQ_URLS)) return null
  const env = {}
  config({ path: ARQ_URLS, processEnv: env })
  return env
}
