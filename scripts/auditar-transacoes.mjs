#!/usr/bin/env node
// Auditor de transações que pedem uma segunda conexão.
//
// Dentro de `prisma.$transaction(async tx => …)` a transação segura uma conexão
// do Pool. Se o corpo consultar por fora do `tx` — `prisma.x` em vez de `tx.x`,
// ou uma função que usa `prisma` por dentro —, essa consulta pede OUTRA conexão
// do mesmo Pool. Com o Pool cheio de transações assim, todas esperam por uma
// conexão que só elas mesmas soltariam: trava até o timeout da transação, com
// qualquer teto de Pool (src/lib/banco-pool.ts).
//
// O auditor segue o corpo da transação e as funções que ele chama, de arquivo em
// arquivo, até achar um cliente global (prisma, prismaBase, prismaAuth,
// prismaAdmin). Também segue o corpo que chega por parâmetro (os invólucros
// `transacao(org, efeito)`) até quem chama o invólucro.
//
// prismaAuth e prismaAdmin dentro de uma transação do app não travam — cada
// papel tem o seu Pool —, mas também entram: a consulta sai da transação, sem a
// mesma visão dos dados, e o próximo a mexer no Pool não vai lembrar disso.
//
// Uso: node scripts/auditar-transacoes.mjs
import { createRequire } from "node:module"
import { join, relative } from "node:path"

const RAIZ = process.cwd()
const ts = createRequire(join(RAIZ, "package.json"))("typescript")

const cfg = ts.getParsedCommandLineOfConfigFile(join(RAIZ, "tsconfig.json"), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })
const programa = ts.createProgram({ rootNames: cfg.fileNames.filter(f => relative(RAIZ, f).startsWith("src/")), options: cfg.options })
const tc = programa.getTypeChecker()
const rel = f => relative(RAIZ, f)
const linha = no => `${rel(no.getSourceFile().fileName)}:${no.getSourceFile().getLineAndCharacterOfPosition(no.getStart()).line + 1}`

const CLIENTES = {
  "src/lib/prisma.ts": ["prisma", "prismaBase"],
  "src/lib/prisma-auth.ts": ["prismaAuth"],
  "src/lib/prisma-admin.ts": ["prismaAdmin"],
}
// A própria camada de RLS abre a transação e declara a empresa; não é uso.
const FORA = new Set(["src/lib/prisma-rls.ts", ...Object.keys(CLIENTES)])

const original = sym => (sym && sym.flags & ts.SymbolFlags.Alias ? tc.getAliasedSymbol(sym) : sym)
function cliente(sym) {
  sym = original(sym)
  return sym?.declarations?.some(d => CLIENTES[rel(d.getSourceFile().fileName)]?.includes(sym.name)) ? sym.name : null
}
const ehFuncao = n => n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n))
function funcaoDe(sym) {
  sym = original(sym)
  for (const d of sym?.declarations ?? []) {
    if (!rel(d.getSourceFile().fileName).startsWith("src/")) continue
    if (ehFuncao(d)) return d
    const ini = ts.isVariableDeclaration(d) ? d.initializer : null
    if (ehFuncao(ini)) return ini
    // cache(async () => …) e afins
    if (ini && ts.isCallExpression(ini) && ehFuncao(ini.arguments[0])) return ini.arguments[0]
  }
  return null
}
const parametroDe = sym => original(sym)?.declarations?.find(d => ts.isParameter(d))

// Caminhos de `fn` até um cliente global, seguindo chamadas e parâmetros.
const memo = new Map()
function alcanca(fn, pilha = new Set()) {
  if (memo.has(fn)) return memo.get(fn)
  if (pilha.has(fn)) return []
  pilha.add(fn)
  const achados = []
  const visitar = no => {
    if (ts.isIdentifier(no)) {
      const c = cliente(tc.getSymbolAtLocation(no))
      if (c) achados.push(`${c} (${linha(no)})`)
    }
    if (ts.isCallExpression(no)) {
      const alvo = ts.isPropertyAccessExpression(no.expression) ? no.expression.name : no.expression
      const sym = tc.getSymbolAtLocation(alvo)
      const decl = funcaoDe(sym)
      if (decl && decl !== fn) for (const c of alcanca(decl, pilha)) achados.push(`${alvo.getText()}() → ${c}`)
      const param = parametroDe(sym)
      if (param) for (const c of repassados(param, pilha)) achados.push(`${alvo.getText()}() → ${c}`)
    }
    ts.forEachChild(no, visitar)
  }
  if (fn.body) visitar(fn.body)
  pilha.delete(fn)
  memo.set(fn, achados)
  return achados
}

// Um corpo que chega por parâmetro: segue cada chamada do invólucro.
const chamadas = []
for (const sf of programa.getSourceFiles()) {
  if (!rel(sf.fileName).startsWith("src/")) continue
  const v = no => { if (ts.isCallExpression(no)) chamadas.push(no); ts.forEachChild(no, v) }
  v(sf)
}
function repassados(param, pilha) {
  const involucro = param.parent
  const pos = involucro.parameters.indexOf(param)
  const achados = []
  for (const ch of chamadas) {
    const alvo = ts.isPropertyAccessExpression(ch.expression) ? ch.expression.name : ch.expression
    if (funcaoDe(tc.getSymbolAtLocation(alvo)) !== involucro) continue
    const arg = ch.arguments[pos]
    const fn = ehFuncao(arg) ? arg : arg && funcaoDe(tc.getSymbolAtLocation(arg))
    if (fn) for (const c of alcanca(fn, pilha)) achados.push(`${linha(ch)} → ${c}`)
  }
  return achados
}

const problemas = []
let total = 0
for (const sf of programa.getSourceFiles()) {
  if (!rel(sf.fileName).startsWith("src/") || FORA.has(rel(sf.fileName))) continue
  const visitar = no => {
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && no.expression.name.text === "$transaction") {
      const arg = no.arguments[0]
      if (arg && !ts.isArrayLiteralExpression(arg)) {
        total++
        const caminhos = []
        const corpo = ehFuncao(arg) ? arg : funcaoDe(tc.getSymbolAtLocation(arg))
        if (corpo) caminhos.push(...alcanca(corpo))
        const param = !corpo && parametroDe(tc.getSymbolAtLocation(arg))
        if (param) caminhos.push(...repassados(param, new Set()))
        // db.$transaction(tx => db.x): o mesmo cliente usado de novo lá dentro.
        const dono = ts.isIdentifier(no.expression.expression) ? tc.getSymbolAtLocation(no.expression.expression) : null
        const reuso = n => {
          if (n !== no.expression.expression && ts.isIdentifier(n) && dono && tc.getSymbolAtLocation(n) === dono) caminhos.push(`${n.text} de novo (${linha(n)})`)
          ts.forEachChild(n, reuso)
        }
        if (ehFuncao(arg)) reuso(arg.body)
        if (!corpo && !param) caminhos.push(`corpo da transação não analisável: ${arg.getText().slice(0, 60)}`)
        if (caminhos.length) problemas.push({ onde: linha(no), caminhos: [...new Set(caminhos)] })
      }
    }
    ts.forEachChild(no, visitar)
  }
  visitar(sf)
}

if (problemas.length) {
  console.error(`\n❌ ${problemas.length} transação(ões) consultam por fora do tx:\n`)
  for (const p of problemas) {
    console.error(`   ${p.onde}`)
    for (const c of p.caminhos.slice(0, 5)) console.error(`      ${c}`)
  }
  console.error(
    `\nDentro da transação, tudo passa pelo tx — inclusive o que vai para funções auxiliares` +
      `\n(receba o tx como parâmetro). Consulta por fora pede outra conexão do Pool e trava` +
      `\nquando o Pool enche de transações assim.\n`
  )
  process.exit(1)
}
console.log(`✅ ${total} transação(ões) com corpo; nenhuma consulta por fora do tx.`)
