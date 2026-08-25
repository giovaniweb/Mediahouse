#!/usr/bin/env node
// Auditor dos perfis globais de profissional.
//
// `Videomaker`, `Editor` e `Designer` são a REDE de profissionais: sob RLS, o
// perfil é legível por qualquer organização. Perfil só pode conter dado público.
// O que pertence a UMA empresa vive nas tabelas de vínculo e de dados fiscais
// (diária, salário, bloqueio, observação, CPF, endereço, PIX, banco).
//
// Este auditor existe porque limpeza não se sustenta sozinha: as colunas do
// Videomaker foram esvaziadas uma vez na R4.1 e voltaram a ser usadas em 26
// pontos, porque nada impedia. Uma varredura ingênua por `grep` contou 7 —
// errou por um fator de quatro, porque não enxergava `videomaker: true`,
// `select` dentro de `include`, nem acesso a `.videomaker.chavePix`.
//
// Duas regras, por modelo:
//
//   privadas  — ler ou escrever coluna privada VIA O MODELO DE PERFIL.
//               Depois do DROP, cada ocorrência vira erro em produção.
//   escopo    — filtrar o perfil por `organizacaoId`. Só vale para modelo que
//               AINDA é da empresa e precisa virar global: quando a coluna
//               sumir, a consulta quebra. O escopo passa a vir do vínculo.
//
// Uso:
//   node scripts/auditar-perfil-global.mjs            # falha se passar da allowlist
//   node scripts/auditar-perfil-global.mjs --listar   # lista tudo, sem falhar
//   node scripts/auditar-perfil-global.mjs --gerar    # regrava a allowlist com o estado atual
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative } from "node:path"

const RAIZ = process.cwd()
const ALLOWLIST = join(RAIZ, "scripts/perfil-global-allowlist.json")
const listar = process.argv.includes("--listar")
const gerar = process.argv.includes("--gerar")

// Colunas privadas por modelo. Nas tabelas por empresa os mesmos nomes são
// legítimos — por isso a checagem é por CONTEXTO (a consulta ao modelo de
// perfil), nunca por nome solto no arquivo.
const COMUNS = [
  "dadosBancarios", "chavePix", "cpfCnpj", "razaoSocial", "nomeFantasia",
  "representante", "endereco", "emListaNegra", "listaNegraMotivo", "observacoes",
]
const MODELOS = {
  videomaker: {
    privadas: [...COMUNS, "valorDiaria"],
    // Já é global desde a Fase A: nenhuma consulta pode filtrá-lo por empresa.
    exigeEscopoZero: true,
  },
  editor: {
    // `cargaLimite` entra: capacidade é do vínculo com a empresa, não da pessoa.
    privadas: [...COMUNS, "salario", "valorDiaria", "cargaLimite"],
    exigeEscopoZero: true,
  },
  designer: {
    privadas: [...COMUNS, "salario", "valorDiaria"],
    exigeEscopoZero: true,
  },
}

/**
 * Remove comentários preservando o comprimento (troca por espaço), para os
 * números de linha continuarem batendo com o arquivo original.
 *
 * Sem isto o auditor acusa o próprio comentário que explica a regra — e um gate
 * que aponta falso é um gate que as pessoas aprendem a ignorar.
 */
function semComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length))
}

/** Trecho a partir de `inicio` até fechar o parêntese/chave. */
function blocoBalanceado(texto, inicio) {
  let profundidade = 0, i = inicio, comecou = false
  while (i < texto.length) {
    const c = texto[i]
    if (c === "(" || c === "{") { profundidade++; comecou = true }
    else if (c === ")" || c === "}") {
      profundidade--
      if (comecou && profundidade === 0) return texto.slice(inicio, i + 1)
    }
    i++
    if (i - inicio > 6000) break
  }
  return texto.slice(inicio, Math.min(inicio + 6000, texto.length))
}

/**
 * `organizacaoId` como campo DIRETO de where/data/create/update — ou seja, a
 * coluna da própria tabela de perfil, que vai deixar de existir.
 *
 * Não conta quando ele aparece aninhado numa relação, porque aí é o escopo
 * CERTO. Os dois convivem no mesmo arquivo (src/lib/historico.ts):
 *
 *   videomaker: where: { id, vinculos: { some: { organizacaoId } } }   ✅ pelo vínculo
 *   editor:     where: { id, organizacaoId }                           ❌ pela coluna
 *
 * Sem esta distinção o auditor acusava 4 falsos no videomaker, que já está
 * migrado e tem que marcar zero. Gate que aponta falso é gate ignorado.
 */
const CHAVES_DE_CONSULTA = ["where", "data", "create", "update", "select", "omit"]

/** `coluna` como filho DIRETO do objeto — não de uma relação aninhada dentro dele. */
function noPrimeiroNivel(obj, coluna) {
  let profundidade = 0
  for (let i = 0; i < obj.length; i++) {
    const c = obj[i]
    if (c === "{") profundidade++
    else if (c === "}") profundidade--
    else if (profundidade === 1 && obj.startsWith(coluna, i)) {
      const depois = obj.slice(i + coluna.length).match(/^\s*[:,}]/)
      const antes = i === 0 || /[{,\s]/.test(obj[i - 1])
      if (depois && antes) return true
    }
  }
  return false
}

function usaColunaDireta(bloco, coluna) {
  // As chaves também precisam estar no primeiro nível DA CONSULTA. A busca era
  // pela primeira ocorrência de `select:` em qualquer profundidade, e num
  // `include: { demandas: { select: { organizacaoId: true } } }` ela encontrava
  // o select da RELAÇÃO — acusando escopo por coluna do perfil onde o perfil
  // nem era filtrado. Mesmo erro da versão que confundia relação com coluna,
  // um nível acima.
  let profundidade = 0
  for (let i = 0; i < bloco.length; i++) {
    const c = bloco[i]
    if (c === "{") { profundidade++; continue }
    if (c === "}") { profundidade--; continue }
    if (profundidade !== 1) continue

    for (const chave of CHAVES_DE_CONSULTA) {
      if (!bloco.startsWith(chave, i)) continue
      const antes = i === 0 || /[{,\s]/.test(bloco[i - 1])
      const abertura = /^\s*:\s*\{/.exec(bloco.slice(i + chave.length))
      if (!antes || !abertura) continue
      const inicioObj = i + chave.length + abertura[0].length - 1
      if (noPrimeiroNivel(blocoBalanceado(bloco, inicioObj), coluna)) return true
    }
  }
  return false
}

const linhaDe = (t, i) => t.slice(0, i).split("\n").length

const METODOS =
  "findMany|findUnique|findFirst|findUniqueOrThrow|findFirstOrThrow|create|update|upsert|updateMany|delete|deleteMany|count|aggregate|groupBy"

function ocorrencias(rel, bruto) {
  const texto = semComentarios(bruto)
  const achados = []

  for (const [modelo, cfg] of Object.entries(MODELOS)) {
    // (1) consulta direta ao modelo de perfil
    const reDireta = new RegExp(`prisma\\.${modelo}\\.(${METODOS})\\s*\\(`, "g")
    for (const m of texto.matchAll(reDireta)) {
      const bloco = blocoBalanceado(texto, m.index + m[0].length - 1)
      const linha = linhaDe(texto, m.index)

      for (const col of cfg.privadas) {
        // Mesma consciência de profundidade da regra de escopo, e pelo mesmo
        // motivo: `vinculos: { some: { emListaNegra: false } }` é campo do
        // VÍNCULO — é justamente o padrão certo — enquanto
        // `select: { salario: true }` é a coluna do perfil que vai sumir.
        // Sem isto o auditor acusa a própria correção que pede.
        if (usaColunaDireta(bloco, col)) {
          // `omit:` também conta. Parecia a forma correta de excluir a coluna —
          // e era, enquanto ela existia. Depois do DROP, `omit` de coluna
          // inexistente é erro de tipo; o tsc pegou 5 casos que uma versão
          // anterior deste auditor tinha liberado dizendo "seguro".
          const emOmit = new RegExp(`omit\\s*:\\s*\\{[^}]*\\b${col}\\s*:`, "s").test(bloco)
          achados.push({ rel, modelo, regra: "privadas", linha, col,
            forma: `${emOmit ? "omit em " : ""}prisma.${modelo}.${m[1]}` })
        }
      }

      if (cfg.exigeEscopoZero && usaColunaDireta(bloco, "organizacaoId")) {
        achados.push({ rel, modelo, regra: "escopo", linha, col: "organizacaoId",
          forma: `prisma.${modelo}.${m[1]}` })
      }
    }

    // (2) relação embutida em outro modelo
    for (const m of texto.matchAll(new RegExp(`\\b${modelo}\\s*:\\s*\\{`, "g"))) {
      const bloco = blocoBalanceado(texto, m.index + m[0].length - 1)
      for (const col of cfg.privadas) {
        if (new RegExp(`\\b${col}\\s*:\\s*true`).test(bloco)) {
          achados.push({ rel, modelo, regra: "privadas", linha: linhaDe(texto, m.index),
            col, forma: `relação ${modelo}:{select}` })
        }
      }
    }
    // `<modelo>: true` traz a linha inteira, colunas privadas incluídas.
    for (const m of texto.matchAll(new RegExp(`\\b${modelo}\\s*:\\s*true\\b`, "g"))) {
      achados.push({ rel, modelo, regra: "privadas", linha: linhaDe(texto, m.index),
        col: "(todas)", forma: `${modelo}: true` })
    }

    // (3) leitura do resultado
    for (const col of cfg.privadas) {
      for (const m of texto.matchAll(new RegExp(`\\.${modelo}\\??\\.${col}\\b`, "g"))) {
        achados.push({ rel, modelo, regra: "privadas", linha: linhaDe(texto, m.index),
          col, forma: `acesso .${modelo}` })
      }
    }
  }
  return achados
}

function listarArquivos(dir, out = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next" || nome.startsWith(".")) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) listarArquivos(caminho, out)
    else if (/\.(ts|tsx)$/.test(nome)) out.push(caminho)
  }
  return out
}

// ── varredura ────────────────────────────────────────────────────────────────
const todos = []
for (const caminho of listarArquivos(join(RAIZ, "src"))) {
  const rel = relative(RAIZ, caminho)
  // Os helpers são a porta oficial para dado privado — citam os nomes de
  // propósito, lendo e gravando nas tabelas por empresa.
  if (/^src\/lib\/videomaker-(dados|vinculo)\.ts$/.test(rel)) continue
  if (/^src\/lib\/(editor|designer)-(dados|vinculo)\.ts$/.test(rel)) continue

  const bruto = readFileSync(caminho, "utf8")
  // Só quem fala com o Prisma pode quebrar no DROP. Componente que lê
  // `custo.videomaker.valorDiaria` de um JSON continua funcionando — o campo vem
  // da API, que passou a montá-lo a partir do vínculo.
  if (!/from\s+["']@\/lib\/prisma["']/.test(bruto)) continue

  todos.push(...ocorrencias(rel, bruto))
}

// Chave da allowlist: arquivo + modelo + regra. Sem número de linha de
// propósito — linha muda a cada edição e a allowlist viraria ruído.
const chave = (o) => `${o.rel}::${o.modelo}::${o.regra}`
const atual = {}
for (const o of todos) atual[chave(o)] = (atual[chave(o)] ?? 0) + 1

if (gerar) {
  writeFileSync(ALLOWLIST, JSON.stringify({
    _comentario: [
      "Dívida conhecida dos perfis globais (Editor/Designer ainda não migrados).",
      "Chave: arquivo::modelo::regra → quantidade tolerada.",
      "Esta lista SÓ PODE ENCOLHER. Cada arquivo migrado sai daqui.",
      "regra 'privadas' = usa coluna que vira do vínculo.",
      "regra 'escopo'   = filtra o perfil por organizacaoId; a coluna vai sumir.",
    ],
    _gerado_em: new Date().toISOString().slice(0, 10),
    permitidas: Object.fromEntries(Object.entries(atual).sort()),
  }, null, 2) + "\n")
  console.log(`Allowlist regravada: ${Object.keys(atual).length} entrada(s), ${todos.length} ocorrência(s).`)
  process.exit(0)
}

const permitidas = existsSync(ALLOWLIST)
  ? JSON.parse(readFileSync(ALLOWLIST, "utf8")).permitidas ?? {}
  : {}

const violacoes = []
for (const [k, n] of Object.entries(atual)) {
  const teto = permitidas[k] ?? 0
  if (n > teto) violacoes.push({ k, n, teto })
}
// A allowlist só encolhe: entrada que sobrou sem ocorrência é dívida paga.
const obsoletas = Object.keys(permitidas).filter((k) => !(k in atual))

if (listar) {
  const porArquivo = new Map()
  for (const o of todos) {
    if (!porArquivo.has(o.rel)) porArquivo.set(o.rel, [])
    porArquivo.get(o.rel).push(o)
  }
  console.log(`\n${todos.length} ocorrência(s) em ${porArquivo.size} arquivo(s):\n`)
  for (const [rel, itens] of [...porArquivo].sort()) {
    console.log(`  ${rel}`)
    for (const i of itens.sort((a, b) => a.linha - b.linha)) {
      console.log(`     ${String(i.linha).padStart(4)}  [${i.modelo}/${i.regra}] ${i.col.padEnd(16)} ${i.forma}`)
    }
  }
  const porModelo = {}
  for (const o of todos) {
    porModelo[o.modelo] ??= { privadas: 0, escopo: 0 }
    porModelo[o.modelo][o.regra]++
  }
  console.log("\nResumo por modelo:")
  for (const [m, c] of Object.entries(porModelo)) {
    console.log(`  ${m.padEnd(12)} privadas=${String(c.privadas).padStart(3)}  escopo=${String(c.escopo).padStart(3)}`)
  }
  process.exit(0)
}

if (violacoes.length === 0 && obsoletas.length === 0) {
  const total = Object.values(atual).reduce((s, n) => s + n, 0)
  console.log(total === 0
    ? "✅ Perfis globais limpos: nenhum uso de coluna privada nem escopo por organizacaoId."
    : `✅ Nenhuma violação nova. ${total} ocorrência(s) conhecida(s) na allowlist — meta: zero.`)
  process.exit(0)
}

if (violacoes.length) {
  console.log(`\n❌ ${violacoes.length} violação(ões) acima do tolerado:\n`)
  for (const v of violacoes) {
    const [rel, modelo, regra] = v.k.split("::")
    console.log(`  ${rel}`)
    console.log(`     [${modelo}/${regra}] ${v.n} ocorrência(s), allowlist tolera ${v.teto}`)
    for (const o of todos.filter((x) => chave(x) === v.k)) {
      console.log(`        linha ${String(o.linha).padStart(4)}  ${o.col.padEnd(16)} ${o.forma}`)
    }
  }
  console.log(
    "\nDado privado vive nas tabelas de vínculo e fiscais, por empresa.\n" +
      "Leia por src/lib/<modelo>-vinculo.ts e escreva por src/lib/<modelo>-dados.ts.\n"
  )
}

if (obsoletas.length) {
  console.log(`\n⚠️  ${obsoletas.length} entrada(s) da allowlist já não têm ocorrência — dívida paga, remova:`)
  for (const k of obsoletas) console.log(`     ${k}`)
  console.log("\n   Rode: node scripts/auditar-perfil-global.mjs --gerar\n")
}

process.exit(1)
