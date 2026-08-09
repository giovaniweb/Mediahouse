#!/usr/bin/env node
// Auditor de isolamento multiempresa.
//
// Varre as consultas Prisma do código e aponta as que não filtram por
// organização. O objetivo NÃO é corrigir as violações existentes — é impedir a
// próxima: a allowlist começa com o que já existe hoje e só encolhe. Se alguém
// escrever uma consulta nova sem escopo, o CI reprova.
//
// Uso:
//   node scripts/auditar-tenancy.mjs            # falha se houver violação fora da allowlist
//   node scripts/auditar-tenancy.mjs --listar    # imprime todas as violações (para popular a allowlist)
//   node scripts/auditar-tenancy.mjs --gerar     # regrava a allowlist com o estado atual
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative } from "node:path"

const RAIZ = process.cwd()
const ALLOWLIST_PATH = join(RAIZ, "scripts/tenancy-allowlist.json")

// Métodos que leem/escrevem em massa: sem escopo, atravessam empresas.
// `create` fica de fora (o valor de organizacaoId é validado em revisão, não aqui);
// `findUnique`/`update`/`delete` por id entram porque são a porta do IDOR.
const METODOS = [
  "findMany", "findFirst", "findUnique", "findUniqueOrThrow", "findFirstOrThrow",
  "count", "aggregate", "groupBy",
  "updateMany", "deleteMany", "update", "delete", "upsert",
]

// Models que não pertencem a nenhuma empresa por natureza.
const MODELS_GLOBAIS = new Set([
  "organizacao", "usuario", "session", "passwordResetToken",
  "fabricante", "agenteExecucao", "$transaction", "$queryRaw", "$executeRaw",
])

// Sinais de que o ARQUIVO tem noção de organização. Basta um.
//
// A verificação é por arquivo, não por consulta: um scanner de texto não enxerga
// que `requireDemandaOrg` três linhas acima já garantiu o dono da linha que o
// `update({ where: { id } })` vai alterar. Auditar consulta a consulta produzia
// 350 alarmes, quase todos falsos — inútil como gate. Por arquivo, o que sobra é
// o caso real: rota que manipula dado de negócio e nunca ouviu falar de empresa.
const SINAIS_DE_ESCOPO = [
  "organizacaoId",
  "getOrgId",
  "requireDemandaOrg",
  "requireEventoGestaoOrg",
  "requireEventoAccess",
  "requireSuperAdmin",
  "pertenceAOrg",
  "orgPublica",
  "orgPorRelatorioToken",
  "contourlineOrgId",
]

function listarArquivos(dir, out = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next" || nome.startsWith(".")) continue
    const caminho = join(dir, nome)
    const st = statSync(caminho)
    if (st.isDirectory()) listarArquivos(caminho, out)
    else if (/\.(ts|tsx)$/.test(nome)) out.push(caminho)
  }
  return out
}

function linhaDe(texto, indice) {
  return texto.slice(0, indice).split("\n").length
}

function auditar() {
  const alvos = [join(RAIZ, "src/app/api"), join(RAIZ, "src/lib")]
  const violacoes = []

  for (const alvo of alvos) {
    if (!existsSync(alvo)) continue
    for (const arquivo of listarArquivos(alvo)) {
      const texto = readFileSync(arquivo, "utf8")
      const rel = relative(RAIZ, arquivo)

      // O arquivo sabe o que é organização? Se sim, confiamos na revisão humana
      // de COMO ele escopa — aqui só pegamos quem não sabe nem que ela existe.
      if (SINAIS_DE_ESCOPO.some((s) => texto.includes(s))) continue

      const re = new RegExp(`\\bprisma\\.(\\w+)\\.(${METODOS.join("|")})\\s*\\(`, "g")
      const consultas = []
      let m
      while ((m = re.exec(texto)) !== null) {
        const [, model, metodo] = m
        if (MODELS_GLOBAIS.has(model)) continue
        consultas.push({ linha: linhaDe(texto, m.index), consulta: `prisma.${model}.${metodo}` })
      }
      if (consultas.length > 0) {
        violacoes.push({ arquivo: rel, consultas })
      }
    }
  }
  return violacoes
}

function chaveDe(v) {
  return v.arquivo
}

const violacoes = auditar()
const args = process.argv.slice(2)

if (args.includes("--listar")) {
  console.log(`${violacoes.length} arquivo(s) sem nenhuma noção de organização:\n`)
  for (const v of violacoes) {
    console.log(`  ${v.arquivo}  — ${v.consultas.length} consulta(s), 1ª: ${v.consultas[0].consulta} (linha ${v.consultas[0].linha})`)
  }
  process.exit(0)
}

if (args.includes("--gerar")) {
  const chaves = [...new Set(violacoes.map(chaveDe))].sort()
  writeFileSync(
    ALLOWLIST_PATH,
    JSON.stringify(
      {
        _comentario: [
          "Arquivos que consultam o banco sem nenhuma referência a organização — dívida conhecida.",
          "Esta lista SÓ PODE ENCOLHER: cada rota corrigida sai daqui.",
          "Não adicione entrada nova sem justificar — o auditor existe para barrar a próxima violação.",
        ],
        _gerado_em: new Date().toISOString().slice(0, 10),
        permitidas: chaves,
      },
      null,
      2
    ) + "\n"
  )
  console.log(`Allowlist regravada com ${chaves.length} entrada(s).`)
  process.exit(0)
}

// Modo CI: reprova o que não está na allowlist.
const allowlist = existsSync(ALLOWLIST_PATH)
  ? new Set(JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")).permitidas)
  : new Set()

const novas = violacoes.filter((v) => !allowlist.has(chaveDe(v)))
const cobertas = violacoes.length - novas.length

if (novas.length > 0) {
  console.error(`\n❌ ${novas.length} arquivo(s) NOVO(s) consultando o banco sem escopo de organização:\n`)
  for (const v of novas) {
    const extra = v.consultas.length > 1 ? ` (+${v.consultas.length - 1})` : ""
    console.error(`   ${v.arquivo}:${v.consultas[0].linha}  ${v.consultas[0].consulta}${extra}`)
  }
  console.error(
    `\nEscope por organizacaoId (veja src/lib/org.ts: getOrgId, pertenceAOrg, requireDemandaOrg).` +
      `\nSe for global de propósito, justifique e rode: node scripts/auditar-tenancy.mjs --gerar\n`
  )
  process.exit(1)
}

console.log(`✅ Nenhuma consulta nova sem escopo. (${cobertas} conhecida(s) na allowlist — meta: zero)`)
