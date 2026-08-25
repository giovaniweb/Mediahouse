#!/usr/bin/env node
// Auditor de isolamento multiempresa.
//
// Varre as consultas Prisma do código e aponta as que não filtram por
// organização. O objetivo NÃO é corrigir as violações existentes — é impedir a
// próxima: a allowlist começa com o que já existe hoje e só encolhe. Se alguém
// escrever uma consulta nova sem escopo, o CI reprova.
//
// A allowlist tem DUAS seções, e a diferença importa:
//
//   permitidas   — dívida real. Deveria escopar por empresa e não escopa. Cada
//                  entrada diz o que falta para fechar. A meta destas é zero.
//   justificadas — global de propósito: perfil público da rede, callback de
//                  worker autenticado por segredo, rota escopada por uma chave
//                  MAIS estreita que a empresa (o usuário logado, o slug do
//                  evento). Estas nunca vão para zero, e tudo bem.
//
// Uma lista só, achatada, dizia "18 pendências" quando metade delas está certa e
// vai continuar. O número virava ruído, e a meta "zero" virava mentira.
//
// Toda entrada, nas duas seções, precisa de motivo escrito. Entrada sem motivo
// reprova o CI — é o que impede a allowlist de virar depósito.
//
// Uso:
//   node scripts/auditar-tenancy.mjs            # falha se houver violação fora da allowlist
//   node scripts/auditar-tenancy.mjs --listar    # imprime todas as violações
//   node scripts/auditar-tenancy.mjs --gerar     # regrava a allowlist preservando os motivos
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
  "requireCoberturaOrg",
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


// ── Segunda regra: parâmetro recebido e ignorado ────────────────────────────
//
// A checagem acima é POR ARQUIVO: se o arquivo cita organização em algum lugar,
// confia na revisão humana. Foi por essa fresta que buscarVideomakers passou —
// o arquivo citava organizacaoId dezenas de vezes, e a função que importava
// recebia o parâmetro e não usava. Resultado: a IA de uma empresa respondia com
// demandas e custos de outra.
//
// O ESLint já apontava ("argumento definido e nunca usado"), mas o aviso estava
// perdido entre outros 150. Aqui vira erro, com nome e linha.
function corpoDaFuncao(texto, inicio) {
  // Pular a anotação de tipo de retorno antes de achar o corpo. Em
  // `): Promise<{ ok: boolean }> {` o primeiro `{` depois do `)` é o TIPO, não
  // o corpo — e ler o tipo como corpo dá falso positivo em toda função que
  // devolve objeto. O corpo é o primeiro `{` fora de `<...>`.
  let abre = -1
  let angulo = 0
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i]
    if (c === "<") angulo++
    else if (c === ">") {
      if (texto[i - 1] !== "=") angulo = Math.max(0, angulo - 1)
    } else if (c === "{" && angulo === 0) {
      abre = i
      break
    }
  }
  if (abre === -1) return ""
  let nivel = 0
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === "{") nivel++
    else if (texto[i] === "}") {
      nivel--
      if (nivel === 0) return texto.slice(abre + 1, i)
    }
  }
  return texto.slice(abre)
}

function auditarParametroIgnorado() {
  const alvos = [join(RAIZ, "src/app/api"), join(RAIZ, "src/lib")]
  const achados = []

  for (const alvo of alvos) {
    if (!existsSync(alvo)) continue
    for (const arquivo of listarArquivos(alvo)) {
      const texto = readFileSync(arquivo, "utf8")
      const rel = relative(RAIZ, arquivo)

      const re = /(?:async\s+)?function\s+(\w+)\s*\(([^)]*organizacaoId[^)]*)\)/g
      let m
      while ((m = re.exec(texto)) !== null) {
        const [, nome] = m
        const corpo = corpoDaFuncao(texto, m.index + m[0].length)
        if (!corpo.includes("organizacaoId")) {
          achados.push({ arquivo: rel, funcao: nome, linha: linhaDe(texto, m.index) })
        }
      }
    }
  }
  return achados
}

function chaveDe(v) {
  return v.arquivo
}

const violacoes = auditar()
const ignorados = auditarParametroIgnorado()
const args = process.argv.slice(2)

if (args.includes("--listar")) {
  console.log(`${violacoes.length} arquivo(s) sem nenhuma noção de organização:\n`)
  for (const v of violacoes) {
    console.log(`  ${v.arquivo}  — ${v.consultas.length} consulta(s), 1ª: ${v.consultas[0].consulta} (linha ${v.consultas[0].linha})`)
  }
  process.exit(0)
}

function carregarAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return { permitidas: {}, justificadas: {} }
  const bruto = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"))
  // Formato antigo: `permitidas` era um array de caminhos, sem motivo.
  const permitidas = Array.isArray(bruto.permitidas)
    ? Object.fromEntries(bruto.permitidas.map((c) => [c, ""]))
    : bruto.permitidas ?? {}
  return { permitidas, justificadas: bruto.justificadas ?? {} }
}

if (args.includes("--gerar")) {
  const atual = carregarAllowlist()
  const caminhos = [...new Set(violacoes.map(chaveDe))].sort()

  // Preserva a classificação e o motivo do que já estava listado; o que é novo
  // entra como dívida SEM motivo, e o CI cobra a justificativa de quem escreveu.
  const permitidas = {}
  const justificadas = {}
  for (const c of caminhos) {
    if (c in atual.justificadas) justificadas[c] = atual.justificadas[c]
    else permitidas[c] = atual.permitidas[c] ?? ""
  }

  writeFileSync(
    ALLOWLIST_PATH,
    JSON.stringify(
      {
        _comentario: [
          "Arquivos que consultam o banco sem nenhuma referência a organização.",
          "permitidas   = dívida real. O motivo diz o que falta para fechar. Meta: zero.",
          "justificadas = global de propósito. O motivo diz por quê. Não vai para zero.",
          "Toda entrada precisa de motivo escrito — sem motivo, o CI reprova.",
          "Regenerar: node scripts/auditar-tenancy.mjs --gerar",
        ],
        _gerado_em: new Date().toISOString().slice(0, 10),
        permitidas,
        justificadas,
      },
      null,
      2
    ) + "\n"
  )
  console.log(
    `Allowlist regravada: ${Object.keys(permitidas).length} dívida(s), ` +
      `${Object.keys(justificadas).length} justificada(s).`
  )
  process.exit(0)
}

// Modo CI: reprova o que não está na allowlist.
const { permitidas, justificadas } = carregarAllowlist()
const listadas = new Set([...Object.keys(permitidas), ...Object.keys(justificadas)])

const novas = violacoes.filter((v) => !listadas.has(chaveDe(v)))

if (novas.length > 0) {
  console.error(`\n❌ ${novas.length} arquivo(s) NOVO(s) consultando o banco sem escopo de organização:\n`)
  for (const v of novas) {
    const extra = v.consultas.length > 1 ? ` (+${v.consultas.length - 1})` : ""
    console.error(`   ${v.arquivo}:${v.consultas[0].linha}  ${v.consultas[0].consulta}${extra}`)
  }
  console.error(
    `\nEscope por organizacaoId (veja src/lib/org.ts: getOrgId, pertenceAOrg, requireDemandaOrg).` +
      `\nSe for global de propósito, rode --gerar e mova a entrada para "justificadas" com o motivo.\n`
  )
  process.exit(1)
}

// Entrada que sobrou na lista depois de a rota ser corrigida. Não é perigo, é
// mentira: a lista passa a dizer que há dívida onde já não há.
const presentes = new Set(violacoes.map(chaveDe))
const obsoletas = [...listadas].filter((c) => !presentes.has(c))
if (obsoletas.length > 0) {
  console.error(`\n❌ ${obsoletas.length} entrada(s) obsoleta(s) na allowlist — a rota já escopa:\n`)
  for (const c of obsoletas) console.error(`   ${c}`)
  console.error(`\nRode: node scripts/auditar-tenancy.mjs --gerar\n`)
  process.exit(1)
}

// Motivo é obrigatório nas duas seções. É o que separa "sabemos e está mapeado"
// de "alguém silenciou o auditor e foi embora".
const semMotivo = [
  ...Object.entries(permitidas),
  ...Object.entries(justificadas),
].filter(([, motivo]) => !String(motivo ?? "").trim())

if (semMotivo.length > 0) {
  console.error(`\n❌ ${semMotivo.length} entrada(s) na allowlist sem motivo escrito:\n`)
  for (const [c] of semMotivo) console.error(`   ${c}`)
  console.error(
    `\nEm "permitidas", diga o que falta para fechar.` +
      `\nEm "justificadas", diga por que a consulta é global de propósito.\n`
  )
  process.exit(1)
}

if (ignorados.length > 0) {
  console.error(`\n❌ ${ignorados.length} função(ões) recebem organizacaoId e não usam:\n`)
  for (const i of ignorados) {
    console.error(`   ${i.arquivo}:${i.linha}  ${i.funcao}()`)
  }
  console.error(
    `\nOu a função escopa pela organização recebida, ou o parâmetro sai da assinatura.` +
      `\nRecebê-lo e ignorar é o pior dos dois: parece escopado e não é.\n`
  )
  process.exit(1)
}

console.log(`✅ Nenhuma consulta nova sem escopo.`)
console.log(`   ${Object.keys(permitidas).length} dívida(s) conhecida(s) — meta: zero.`)
console.log(`   ${Object.keys(justificadas).length} global(is) de propósito, com motivo.`)
console.log(`✅ Nenhuma função recebe organizacaoId e ignora.`)
