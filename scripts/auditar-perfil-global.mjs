#!/usr/bin/env node
// Auditor do perfil global de profissional.
//
// `Videomaker` é a tabela da REDE — compartilhada entre as empresas e, sob RLS,
// legível por qualquer organização. Ela só pode conter o que é público. O que
// pertence a UMA empresa vive em `VideomakerOrganizacao` (diária, bloqueio,
// observação) e `VideomakerDadosFiscais` (CPF, endereço, PIX, banco).
//
// Este auditor existe porque a limpeza não se sustenta sozinha: as colunas
// antigas foram esvaziadas uma vez na R4.1 e voltaram a ser lidas e escritas em
// 12 pontos diferentes, porque nada impedia. Depois do DROP, cada ocorrência
// destas vira erro em produção — então o gate precisa existir ANTES do DROP.
//
// Uso:
//   node scripts/auditar-perfil-global.mjs            # falha se houver ocorrência
//   node scripts/auditar-perfil-global.mjs --listar   # lista tudo, com contexto
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const RAIZ = process.cwd()
const listar = process.argv.includes("--listar")

// Colunas que serão apagadas do perfil global. Ler ou escrever qualquer uma
// delas VIA O MODELO GLOBAL é o que este auditor barra. Nas tabelas por empresa
// os mesmos nomes são legítimos — por isso a checagem é por contexto, não por
// nome solto (foi o erro que me fez contar "0 ocorrências" numa varredura
// ingênua e quase liberar o DROP com 12 pontos ainda dependendo delas).
const COLUNAS_PRIVADAS = [
  "valorDiaria", "dadosBancarios", "chavePix", "cpfCnpj", "razaoSocial",
  "nomeFantasia", "representante", "endereco", "emListaNegra",
  "listaNegraMotivo", "observacoes",
]

/**
 * Remove comentários preservando o comprimento do arquivo (troca por espaço),
 * para que os números de linha continuem batendo com o original.
 *
 * Sem isto o auditor acusa o próprio comentário que explica a regra — e um gate
 * que aponta falso é um gate que as pessoas aprendem a ignorar.
 */
function semComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length))
}

/** Extrai o trecho de código a partir de `inicio` até fechar o parêntese/chave. */
function blocoBalanceado(texto, inicio) {
  let profundidade = 0
  let i = inicio
  let comecou = false
  while (i < texto.length) {
    const c = texto[i]
    if (c === "(" || c === "{") { profundidade++; comecou = true }
    else if (c === ")" || c === "}") {
      profundidade--
      if (comecou && profundidade === 0) return texto.slice(inicio, i + 1)
    }
    i++
    if (i - inicio > 6000) break // guarda contra arquivo mal formado
  }
  return texto.slice(inicio, Math.min(inicio + 6000, texto.length))
}

function linhaDe(texto, indice) {
  return texto.slice(0, indice).split("\n").length
}

/**
 * Ocorrências em UM arquivo. Três formas de tocar o perfil global:
 *   1. prisma.videomaker.<metodo>({ ... })          — consulta direta
 *   2. videomaker: { select: { ... } } / : true      — relação embutida em outro modelo
 *   3. .videomaker.<coluna> / .videomaker?.<coluna>  — leitura do resultado
 */
function ocorrencias(caminho, textoOriginal) {
  const texto = semComentarios(textoOriginal)
  const achados = []

  // (1) consulta direta ao modelo global
  const reDireta = /prisma\.videomaker\.(findMany|findUnique|findFirst|findUniqueOrThrow|findFirstOrThrow|create|update|upsert|updateMany|aggregate|groupBy)\s*\(/g
  for (const m of texto.matchAll(reDireta)) {
    const bloco = blocoBalanceado(texto, m.index + m[0].length - 1)
    // `omit:` é a forma CORRETA de excluir as colunas — não conta como uso.
    const semOmit = bloco.replace(/omit\s*:\s*\{[^}]*\}/g, "")
    for (const col of COLUNAS_PRIVADAS) {
      if (new RegExp(`\\b${col}\\s*:`).test(semOmit)) {
        achados.push({ linha: linhaDe(texto, m.index), col, forma: `prisma.videomaker.${m[1]}` })
      }
    }
  }

  // (2) relação embutida: include/select de `videomaker`
  for (const m of texto.matchAll(/\bvideomaker\s*:\s*\{/g)) {
    const bloco = blocoBalanceado(texto, m.index + m[0].length - 1)
    for (const col of COLUNAS_PRIVADAS) {
      if (new RegExp(`\\b${col}\\s*:\\s*true`).test(bloco)) {
        achados.push({ linha: linhaDe(texto, m.index), col, forma: "relação videomaker:{select}" })
      }
    }
  }
  // `videomaker: true` traz a linha inteira, colunas privadas incluídas.
  for (const m of texto.matchAll(/\bvideomaker\s*:\s*true\b/g)) {
    achados.push({ linha: linhaDe(texto, m.index), col: "(todas)", forma: "videomaker: true" })
  }

  // (3) leitura do resultado
  for (const col of COLUNAS_PRIVADAS) {
    for (const m of texto.matchAll(new RegExp(`\\.videomaker\\??\\.${col}\\b`, "g"))) {
      achados.push({ linha: linhaDe(texto, m.index), col, forma: "acesso .videomaker" })
    }
  }

  return achados.map((a) => ({ ...a, arquivo: relative(RAIZ, caminho) }))
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

const arquivos = listarArquivos(join(RAIZ, "src"))
const todos = []
for (const caminho of arquivos) {
  // Os helpers são a porta oficial para dado privado — citam os nomes de
  // propósito, lendo e gravando nas tabelas por empresa.
  if (/src\/lib\/videomaker-(dados|vinculo)\.ts$/.test(relative(RAIZ, caminho))) continue

  const texto = readFileSync(caminho, "utf8")

  // Só quem fala com o Prisma pode quebrar no DROP. Componente que lê
  // `custo.videomaker.valorDiaria` de um JSON continua funcionando — o campo vem
  // da API, que passou a montá-lo a partir do vínculo. Sem este corte o auditor
  // acusa 6 falsos e vira barulho que as pessoas aprendem a ignorar.
  if (!/from\s+["']@\/lib\/prisma["']/.test(texto)) continue

  todos.push(...ocorrencias(caminho, texto))
}

if (todos.length === 0) {
  console.log("✅ Nenhum uso de coluna privada no perfil global de videomaker. O DROP é seguro.")
  process.exit(0)
}

const porArquivo = new Map()
for (const o of todos) {
  if (!porArquivo.has(o.arquivo)) porArquivo.set(o.arquivo, [])
  porArquivo.get(o.arquivo).push(o)
}

console.log(`\n❌ ${todos.length} uso(s) de coluna privada no perfil global, em ${porArquivo.size} arquivo(s):\n`)
for (const [arquivo, itens] of [...porArquivo].sort()) {
  console.log(`  ${arquivo}`)
  for (const i of itens.sort((a, b) => a.linha - b.linha)) {
    console.log(`     linha ${String(i.linha).padStart(4)}  ${i.col.padEnd(18)} ${i.forma}`)
  }
}
console.log(
  "\nDado privado vive em VideomakerOrganizacao / VideomakerDadosFiscais.\n" +
    "Use src/lib/videomaker-vinculo.ts (leitura) ou src/lib/videomaker-dados.ts (escrita).\n"
)
process.exit(listar ? 0 : 1)
