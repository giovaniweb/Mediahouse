#!/usr/bin/env node
// A VIRADA DA PRODUÇÃO OFICIAL — banco de us-west-1 para sa-east-1.
//
// Um comando por passo, cada um com critério de parada e cada um recusando
// começar se o anterior não terminou bem. A sequência inteira está em
// PLANO-VIRADA-PRODUCAO.md; aqui está o que ela executa.
//
//   node scripts/virada/virada.mjs preflight      confere tudo, não toca em nada
//   node scripts/virada/virada.mjs congelar       produção para de aceitar escrita
//   node scripts/virada/virada.mjs dump           dump final, com hash
//   node scripts/virada/virada.mjs restaurar      roles, restore e senhas no destino
//   node scripts/virada/virada.mjs conferir       o gate: a cópia é a cópia?
//   node scripts/virada/virada.mjs apontar        troca as variáveis e redeploya
//   node scripts/virada/virada.mjs verificar      mede o resultado do lado de fora
//   node scripts/virada/virada.mjs executar       a sequência inteira
//   node scripts/virada/virada.mjs reverter       desfaz a virada
//   node scripts/virada/virada.mjs ligar-rls      a segunda virada, dias depois
//   node scripts/virada/virada.mjs desligar-rls   desfaz a segunda
//
// O QUE É IRREVERSÍVEL: nada até `apontar`. Depois de `apontar`, o que os
// usuários gravarem mora só no banco novo — voltar atrás a partir daí custa
// esses registros. É por isso que `apontar` é o único passo que exige
// confirmação digitada.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"
import {
  ARQ_ENV_ANTES, ARQ_URLS, COFRE, abortar, aviso, binPg, comCliente, consultar, destino,
  exigirFase, garantirCasa, gravarEstado, guardarUrls, lerEstado, lerUrlsGuardadas,
  mascarar, nao, nota, ok, origem, rodar, senhaNova, titulo, vercel, versaoMaiorPg,
} from "./lib.mjs"

const args = process.argv.slice(2)
const comando = args[0]
const tem = (f) => args.includes(f)
const valorDe = (f) => (args.find((a) => a.startsWith(`${f}=`)) ?? "").split("=")[1]

const DOMINIO = process.env.DOMINIO_PRODUCAO ?? "https://nuflow.space"
const ROLES = ["postgres", "app_user", "app_auth"]

// ─────────────────────────────────────────────────────────────────────────────
// preflight — a única coisa que roda antes da janela, e a que evita descobrir
// dentro dela que faltava um binário.
// ─────────────────────────────────────────────────────────────────────────────
async function preflight() {
  garantirCasa()
  let falhas = 0
  const conferir = (c, t, d) => {
    if (c) return ok(t)
    falhas++
    nao(t)
    if (d) nota(d)
  }

  titulo("Ferramentas")
  const dump = binPg("pg_dump")
  const restore = binPg("pg_restore")
  const vMaior = versaoMaiorPg(dump)
  ok(`pg_dump ${vMaior} em ${dump}`)
  ok(`pg_restore em ${restore}`)
  const v = vercel(["whoami"])
  conferir(v.codigo === 0, `Vercel CLI autenticada (${v.saida.trim().split("\n").pop()})`)

  titulo("Origem — a produção de hoje")
  const o = origem()
  nota(mascarar(o.direta))
  const [infoA] = await consultar(o.direta, `SELECT version() v, current_user u,
      pg_size_pretty(pg_database_size(current_database())) tamanho,
      current_setting('default_transaction_read_only') ro`)
  const majorA = Number(infoA.v.match(/PostgreSQL (\d+)/)[1])
  ok(`PostgreSQL ${majorA} · ${infoA.tamanho} · conectado como ${infoA.u}`)
  conferir(
    vMaior >= majorA,
    `pg_dump (${vMaior}) não é mais velho que o servidor (${majorA})`,
    "Dump feito por cliente mais velho que o servidor perde objeto sem avisar."
  )
  conferir(infoA.ro === "off", "a origem ainda aceita escrita (nenhum congelamento pendente)")

  const [resumoA] = await consultar(o.direta, `SELECT
      (SELECT count(*) FROM pg_tables WHERE schemaname='public') tabelas,
      (SELECT count(*) FROM pg_policies WHERE schemaname='public') politicas,
      (SELECT count(*) FROM demandas) demandas,
      (SELECT count(*) FROM usuarios) usuarios`)
  ok(`${resumoA.tabelas} tabelas · ${resumoA.politicas} políticas · ${resumoA.demandas} demandas · ${resumoA.usuarios} usuários`)

  titulo("Destino — São Paulo")
  const d = destino()
  nota(mascarar(d.direta))
  let infoB, tabelasB
  try {
    ;[infoB] = await consultar(d.direta, `SELECT version() v, current_user u`)
    ;[tabelasB] = await consultar(d.direta, `SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'`)
  } catch (e) {
    conferir(false, "o destino responde", e.message)
    return encerrarPreflight(falhas)
  }
  const majorB = Number(infoB.v.match(/PostgreSQL (\d+)/)[1])
  ok(`PostgreSQL ${majorB} · conectado como ${infoB.u} · projeto ${d.ref}`)
  conferir(
    majorA === majorB,
    `mesma versão maior de Postgres nos dois lados (${majorA})`,
    "Restore entre versões maiores diferentes é território sem garantia."
  )
  if (tabelasB.n > 0) {
    aviso(`o destino JÁ TEM ${tabelasB.n} tabelas no schema public`)
    nota("`restaurar` vai exigir --limpar-destino, que APAGA o que está lá.")
  } else {
    ok("schema public do destino está vazio")
  }

  titulo("Vercel — escopo das variáveis")
  const prod = vercel(["env", "ls", "production"]).saida
  const prev = vercel(["env", "ls", "preview"]).saida
  for (const nome of ["DATABASE_URL", "DIRECT_URL"]) {
    const linha = prod.split("\n").find((l) => l.trim().startsWith(nome))
    const compartilha = /Production,\s*Preview/.test(linha ?? "")
    conferir(
      Boolean(linha) && !compartilha,
      `${nome} existe em Production e NÃO é o mesmo registro do Preview`,
      compartilha
        ? "Um registro só servindo os dois ambientes: trocar aqui muda o preview junto. Separe no painel antes (§7.6)."
        : "Variável ausente em Production."
    )
  }
  conferir(
    !/DATABASE_URL/.test(prev.split("\n").filter((l) => !/preview\/rls/.test(l)).join("\n")),
    "nenhum preview fora de preview/rls herda banco de produção"
  )

  titulo("Deploy de produção em curso")
  const dep = deployProducaoAtual()
  conferir(Boolean(dep), `último deploy de produção: ${dep ?? "não encontrado"}`)

  const saude = await medirSaude(1)
  conferir(saude.ok, `${DOMINIO}/api/health responde ok (banco ${saude.banco}, ${saude.mediana} ms)`)

  gravarEstado("preflight", {
    ok: falhas === 0,
    origem: mascarar(o.direta),
    destino: mascarar(d.direta),
    ref: d.ref,
    resumoOrigem: resumoA,
    destinoVazio: tabelasB.n === 0,
    latenciaAntes: saude.mediana,
  })
  encerrarPreflight(falhas)
}

function encerrarPreflight(falhas) {
  if (falhas > 0) abortar(`${falhas} item(ns) do preflight falharam. A janela não começa assim.`)
  console.log("\n✅ Preflight limpo. A janela pode começar.\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// congelar / descongelar
//
// O congelamento é no BANCO, não na aplicação. Motivo: o que precisa parar não é
// só a tela — é o cron, o webhook do WhatsApp, o `after()` que ainda está
// rodando de uma requisição de dois segundos atrás. Uma trava na aplicação não
// alcança nada disso sem código novo no caminho quente, e código novo às cinco
// da manhã é o oposto de segurança.
//
// `default_transaction_read_only = on` no ROLE faz toda sessão nova nascer
// somente-leitura. As sessões velhas presas no pooler continuam com o valor
// antigo, por isso elas são derrubadas logo depois: reconectam já congeladas.
// ─────────────────────────────────────────────────────────────────────────────
async function congelar() {
  exigirFase("preflight")
  const o = origem()
  titulo("Congelando a escrita na produção")

  await comCliente(o.direta, async (c) => {
    for (const r of ROLES) await c.query(`ALTER ROLE "${r}" SET default_transaction_read_only = on`)
    ok(`roles ${ROLES.join(", ")} nascem somente-leitura a partir de agora`)

    const { rows } = await c.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND usename = ANY($1)`,
      [ROLES]
    )
    ok(`${rows.length} conexão(ões) antiga(s) derrubada(s) — reconectam congeladas`)
  })

  const congelado = await escritaBloqueada(o.pooler)
  if (!congelado) {
    abortar(
      "A trava não pegou: uma escrita pelo pooler ainda passou.",
      "Rode `descongelar` e não siga — a janela dependeria de sorte."
    )
  }
  ok("provado pelo pooler: UPDATE é recusado com 25006 (read_only_sql_transaction)")
  aviso("a partir daqui a produção mostra erro para quem tentar gravar")

  gravarEstado("congelar", { ok: true })
  console.log("\n✅ Escrita congelada. Próximo:  dump\n")
}

async function descongelar() {
  const o = origem()
  titulo("Descongelando a escrita")
  await comCliente(o.direta, async (c) => {
    // Sem esta linha a própria sessão nasce somente-leitura e o ALTER abaixo
    // falharia — a trava trancaria quem tem a chave.
    await c.query("SET default_transaction_read_only = off")
    for (const r of ROLES) await c.query(`ALTER ROLE "${r}" RESET default_transaction_read_only`)
  })
  const aindaBloqueado = await escritaBloqueada(o.pooler)
  if (aindaBloqueado) abortar("Ainda bloqueado depois do RESET. Confira as conexões presas no pooler.")
  ok("a origem voltou a aceitar escrita")
  gravarEstado("descongelar", { ok: true })
}

/** Tenta uma escrita que não muda nada e diz se o banco recusou. */
async function escritaBloqueada(url) {
  try {
    return await comCliente(url, async (c) => {
      await c.query("BEGIN")
      try {
        await c.query("UPDATE organizacoes SET slug = slug WHERE false")
        await c.query("ROLLBACK")
        return false
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {})
        return e.code === "25006"
      }
    })
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// dump — dois arquivos de propósito: o completo é a rede de segurança, o de
// `public` é a carga da migração. Misturar os dois é o erro clássico: o schema
// `auth`/`storage` do Supabase é gerenciado pela plataforma e restaurá-lo por
// cima do projeto novo dá conflito onde não havia problema.
// ─────────────────────────────────────────────────────────────────────────────
async function dump() {
  // Ensaio: a mesma carga, com a produção viva. Serve para provar o caminho
  // inteiro contra o banco de destino REAL antes da janela — e a cópia que sai
  // daqui nasce desatualizada de propósito, porque a produção continua gravando.
  // Por isso `apontar` recusa uma cópia de ensaio: ela não é a verdade final.
  const ensaio = tem("--sem-congelar")
  if (!ensaio) exigirFase("congelar")
  else aviso("ENSAIO: a produção NÃO está congelada — esta cópia vai nascer defasada")
  garantirCasa()
  const o = origem()
  const pg_dump = binPg("pg_dump")
  const pg_restore = binPg("pg_restore")
  const carimbo = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)

  const arquivos = {}
  for (const [rotulo, extra] of [["prod", []], ["public", ["--schema=public"]]]) {
    const caminho = join(COFRE, `nuflow-${rotulo}-${carimbo}.dump`)
    titulo(`Dump ${rotulo === "prod" ? "completo (rede de segurança)" : "do schema public (carga da migração)"}`)
    const r = rodar(pg_dump, ["-Fc", "--no-owner", ...extra, "-f", caminho, o.direta], { silencioso: true })
    if (r.codigo !== 0) abortar(`pg_dump falhou:\n${r.saida}`)

    const bytes = statSync(caminho).size
    const hash = createHash("sha256").update(readFileSync(caminho)).digest("hex")
    writeFileSync(`${caminho}.sha256`, `${hash}  ${caminho}\n`)

    const lista = rodar(pg_restore, ["-l", caminho], { silencioso: true })
    if (lista.codigo !== 0) abortar(`o dump não é legível pelo pg_restore:\n${lista.saida}`)
    const entradas = lista.saida.split("\n").filter((l) => l && !l.startsWith(";")).length

    ok(`${caminho.split("/").pop()} · ${(bytes / 1e6).toFixed(1)} MB · ${entradas} entradas`)
    nota(`sha256 ${hash.slice(0, 16)}…`)
    arquivos[rotulo] = { caminho, bytes, hash, entradas }
  }

  gravarEstado("dump", { ok: true, ensaio, arquivos })
  console.log("\n✅ Dump final feito e conferido. Próximo:  restaurar\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// restaurar — roles ANTES do restore (o dump traz GRANTs que citam os dois; sem
// eles existirem, o restore aborta), restore em transação única, e só então as
// senhas. Senha gerada aqui e mandada direto para a Vercel: não passa por
// terminal nem por conversa, que foi o defeito das senhas do preview (§7.4).
// ─────────────────────────────────────────────────────────────────────────────
async function restaurar() {
  const estadoDump = exigirFase("dump")
  const d = destino()
  const pg_restore = binPg("pg_restore")

  titulo("Preparando o destino")
  const [{ n: existentes }] = await consultar(d.direta, `SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'`)
  if (existentes > 0) {
    if (!tem("--limpar-destino")) {
      abortar(
        `O destino já tem ${existentes} tabelas no schema public.`,
        "Se é para apagar e restaurar por cima, repita com --limpar-destino. Isso APAGA o conteúdo atual do destino."
      )
    }
    aviso(`APAGANDO o schema public do destino (${existentes} tabelas)`)
    await comCliente(d.direta, async (c) => {
      await c.query("DROP SCHEMA public CASCADE")
      await c.query("CREATE SCHEMA public")
      // Os GRANTs que o Supabase põe num projeto novo. Sem eles, PostgREST e
      // Storage do projeto perdem acesso ao schema.
      await c.query(`GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role`)
      await c.query(`GRANT ALL ON SCHEMA public TO postgres, service_role`)
    })
    ok("schema public recriado, vazio")
  }

  await comCliente(d.direta, async (c) => {
    for (const r of ["app_user", "app_auth"]) {
      const { rows } = await c.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [r])
      if (rows.length === 0) {
        await c.query(`CREATE ROLE "${r}" NOLOGIN NOBYPASSRLS`)
        ok(`role ${r} criado — sem LOGIN, sem BYPASSRLS`)
      } else {
        ok(`role ${r} já existia`)
      }
    }
  })

  titulo("Restore")
  const carga = estadoDump.arquivos.public.caminho
  nota(carga.split("/").pop())

  // Duas classes de entrada do dump pertencem à PLATAFORMA, não à aplicação, e
  // todo projeto Supabase já nasce com elas. Tentar recriá-las derruba o restore
  // inteiro por uma linha — e recriá-las não acrescentaria nada, porque no
  // destino elas já são exatamente iguais.
  //
  // O filtro é estreito de propósito. Em particular, as entradas
  // "DEFAULT PRIVILEGES ... postgres" FICAM: é o `ALTER DEFAULT PRIVILEGES` da
  // migration 20260826000000, o que garante que tabela criada no futuro já
  // nasça com GRANT para o app_user. Perder essa linha seria perder a trava.
  const EXCLUIDAS = [
    [/\bSCHEMA - public\b/, "CREATE SCHEMA public — já existe em todo projeto Supabase"],
    [/DEFAULT ACL .*supabase_admin/, "default privileges do supabase_admin — o postgres não pode alterá-los, e a plataforma já os define"],
  ]
  const indice = rodar(pg_restore, ["-l", carga], { silencioso: true })
  if (indice.codigo !== 0) abortar(`Não consegui ler o índice do dump:\n${indice.saida}`)
  const linhas = indice.saida.split("\n")
  const filtrado = linhas.filter((l) => !EXCLUIDAS.some(([re]) => re.test(l)))
  const arqIndice = join(COFRE, `indice-restore-${Date.now()}.txt`)
  writeFileSync(arqIndice, filtrado.join("\n"))
  for (const [re, motivo] of EXCLUIDAS) {
    const n = linhas.filter((l) => re.test(l)).length
    if (n > 0) ok(`${n} entrada(s) fora do restore: ${motivo}`)
  }

  const r = rodar(pg_restore, [
    "--single-transaction", "--exit-on-error", "--no-owner",
    "-L", arqIndice, "-d", d.direta, carga,
  ], { silencioso: true })
  if (r.codigo !== 0) {
    abortar(
      `pg_restore falhou — nada foi gravado, a transação inteira voltou atrás:\n${r.saida.slice(-3000)}`,
      "A produção continua congelada. Rode `descongelar` se for desistir da janela."
    )
  }
  ok(`${estadoDump.arquivos.public.entradas} entradas restauradas em transação única`)

  titulo("Credenciais e permissões")
  const senhas = { app_user: senhaNova(), app_auth: senhaNova() }
  await comCliente(d.direta, async (c) => {
    for (const [papel, senha] of Object.entries(senhas)) {
      await c.query(`ALTER ROLE "${papel}" WITH LOGIN PASSWORD '${senha.replace(/'/g, "''")}'`)
    }
    ok("senhas novas aplicadas — geradas localmente, nunca impressas")

    // §7.4: no PostgreSQL 16+ o criador do role ganha ADMIN mas não SET, e sem
    // SET o scripts/verificar-rls.mjs não consegue provar isolamento nenhum.
    // INHERIT FALSE de propósito: o dono ASSUME o papel para testar, não herda.
    for (const papel of Object.keys(senhas)) {
      await c.query(`GRANT "${papel}" TO current_user WITH INHERIT FALSE, SET TRUE`)
    }
    ok("o dono pode SET ROLE nos dois — o verificador consegue rodar")
  })

  guardarUrls({
    DATABASE_URL_DONO: `postgresql://postgres.${d.ref}:${encodeURIComponent(d.senhaDono)}@${d.poolerHost}:6543/postgres`,
    DIRECT_URL: d.direta,
    DATABASE_URL_APP_USER: d.comoUsuario("app_user", senhas.app_user),
    AUTH_DATABASE_URL: d.comoUsuario("app_auth", senhas.app_auth),
  })
  ok(`as quatro URLs do destino guardadas em ${ARQ_URLS} (600)`)

  gravarEstado("restaurar", { ok: true, ref: d.ref, dumpHash: estadoDump.arquivos.public.hash })
  console.log("\n✅ Destino restaurado. Próximo:  conferir\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// conferir — o gate. Duas provas independentes: a cópia bate com a origem, e o
// RLS isola no banco novo.
// ─────────────────────────────────────────────────────────────────────────────
async function conferir() {
  const rest = exigirFase("restaurar")
  const o = origem()
  const d = destino()

  // O gate só vale para a carga que está de fato no destino. Sem esta conferência
  // dava para rodar um dump novo, esquecer o restore, e o `conferir` continuar
  // verde por causa da execução anterior — um gate que aprova o que não olhou.
  const hashAtual = lerEstado().dump?.arquivos?.public?.hash
  if (rest.dumpHash !== hashAtual) {
    abortar(
      "O que está no destino não veio do dump mais recente.",
      "Rode `restaurar` de novo antes de conferir — o gate não aprova carga que não olhou."
    )
  }

  titulo("A cópia é a cópia?")
  const ensaio = lerEstado().dump?.ensaio
  const cmp = rodar("node", [
    "scripts/conferir-copia.mjs", o.direta, d.direta, ...(ensaio ? ["--ensaio"] : []),
  ])
  if (cmp.codigo !== 0) abortar("A comparação acusou divergência. NÃO aponte a produção para este banco.")

  titulo("O RLS isola no banco novo?")
  const rls = rodar("node", ["scripts/verificar-rls.mjs"], { env: { DIRECT_URL: d.direta, DATABASE_URL: d.direta } })
  if (rls.codigo !== 0) abortar("O verificador de RLS falhou no destino.")

  gravarEstado("conferir", { ok: true, ensaio, dumpHash: hashAtual })
  console.log(
    ensaio
      ? "\n✅ Ensaio fechado: estrutura idêntica e isolamento provado no banco novo.\n"
      : "\n✅ Gate vencido: cópia idêntica e isolamento provado.\n"
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// apontar — o ÚNICO passo com consequência que não se apaga: a partir do
// redeploy, o que os usuários gravarem existe só no banco novo.
// ─────────────────────────────────────────────────────────────────────────────
async function apontar() {
  const conf = exigirFase("conferir")
  const estado = lerEstado()
  if (conf.dumpHash !== estado.dump?.arquivos?.public?.hash) {
    abortar(
      "A conferência verde no estado é de um dump ANTERIOR ao que está no destino.",
      "Refaça:  restaurar → conferir → apontar"
    )
  }
  if (estado.dump?.ensaio) {
    abortar(
      "A cópia que está no destino veio de um ENSAIO, com a produção viva — ela já nasceu defasada.",
      "Refaça a sequência da janela:  congelar → dump → restaurar → conferir → apontar"
    )
  }
  const d = destino()
  const urls = lerUrlsGuardadas()
  if (!urls) abortar(`Não achei ${ARQ_URLS}. Rode o passo restaurar antes.`)

  if (valorDe("--confirmo") !== d.ref) {
    abortar(
      "Este passo muda para onde a produção grava, e o que for gravado depois não estará no banco antigo.",
      `Se é para seguir:  node scripts/virada/virada.mjs apontar --confirmo=${d.ref}`
    )
  }

  titulo("Guardando os valores atuais antes de trocar")
  const bkp = vercel(["env", "pull", ARQ_ENV_ANTES, "--environment=production"])
  if (bkp.codigo !== 0 || !existsSync(ARQ_ENV_ANTES)) abortar(`Não consegui salvar o estado atual:\n${bkp.saida}`)
  ok(`Production de antes salvo em ${ARQ_ENV_ANTES} — é o que o \`reverter\` usa`)

  titulo("Trocando as variáveis de Production")
  // O que NÃO se toca, de propósito: NEXT_PUBLIC_SUPABASE_URL e
  // SUPABASE_SERVICE_ROLE_KEY continuam no projeto ANTIGO. Ele deixa de ser o
  // banco e passa a ser só o servidor de arquivos — as 105 URLs absolutas já
  // distribuídas dependem dele existir (§7.1).
  trocarEnv("DATABASE_URL", urls.DATABASE_URL_DONO)
  trocarEnv("DIRECT_URL", urls.DIRECT_URL)
  nota("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY: intocadas (Storage fica no projeto antigo)")

  titulo("Redeploy de produção")
  const dep = deployProducaoAtual()
  if (!dep) abortar("Não achei o deploy de produção atual para redeployar.")
  nota(dep)
  const r = rodar("vercel", ["redeploy", dep, "--target", "production"], { silencioso: true })
  if (r.codigo !== 0) abortar(`O redeploy falhou:\n${r.saida.slice(-2000)}`)
  ok("redeploy concluído — a produção já lê o banco de São Paulo")

  gravarEstado("apontar", { ok: true, deployAnterior: dep, ref: d.ref })
  console.log("\n✅ Produção apontada para São Paulo. Próximo:  verificar\n")
}

function trocarEnv(nome, valor) {
  let r = vercel(["env", "update", nome, "production"], { entrada: valor })
  if (r.codigo !== 0) {
    // CLI antiga não tem `update`: remove e adiciona. Só é seguro porque o
    // preflight provou que o registro serve Production e mais nada.
    vercel(["env", "rm", nome, "production", "--yes"])
    r = vercel(["env", "add", nome, "production"], { entrada: valor })
  }
  if (r.codigo !== 0) abortar(`Não consegui gravar ${nome} em Production:\n${r.saida}`)
  ok(`${nome} → ${mascarar(valor)}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// verificar — do lado de fora, como o usuário vê.
// ─────────────────────────────────────────────────────────────────────────────
async function verificar() {
  const antes = lerEstado().preflight?.latenciaAntes
  titulo("Saúde e latência, medidas de dentro da função em gru1")
  const s = await medirSaude(8)
  if (!s.ok) abortar(`${DOMINIO}/api/health respondeu ${s.banco}. A produção não está conversando com o banco.`)
  ok(`banco: ${s.banco} · mediana ${s.mediana} ms (mín ${s.min}, máx ${s.max})`)
  if (antes) {
    const ganho = (antes / Math.max(s.mediana, 1)).toFixed(0)
    ok(`antes ${antes} ms · agora ${s.mediana} ms · ${ganho}x`)
  }

  titulo("O banco novo é mesmo o que está sendo lido")
  const d = destino()
  const [c] = await consultar(d.direta, `SELECT
      (SELECT count(*) FROM demandas) demandas,
      (SELECT count(*) FROM usuarios) usuarios,
      (SELECT count(*) FROM organizacoes) orgs`)
  ok(`destino: ${c.demandas} demandas · ${c.usuarios} usuários · ${c.orgs} empresas`)

  gravarEstado("verificar", { ok: true, latencia: s.mediana })
  console.log(`
✅ Virada concluída.

   O que falta é humano e não tem substituto: abrir ${DOMINIO}, fazer login,
   olhar o Kanban, abrir uma demanda, mudar um status. Tela vazia que não
   deveria estar vazia é o único sintoma que nenhuma medição pega.

   O banco antigo ficou CONGELADO de propósito — ele não aceita mais escrita.
   Isso é a rede: nenhum deploy esquecido consegue gravar lá e criar dois
   bancos com verdades diferentes. Ele continua servindo os arquivos (§7.1).
`)
}

async function medirSaude(n) {
  const tempos = []
  let ok = false
  let banco = "?"
  for (let i = 0; i < n; i++) {
    try {
      const r = await fetch(`${DOMINIO}/api/health`, { cache: "no-store" })
      const j = await r.json()
      ok = j.ok === true
      banco = j.banco
      if (typeof j.latenciaMs === "number") tempos.push(j.latenciaMs)
    } catch {
      /* uma falha isolada não decide nada; a mediana decide */
    }
  }
  tempos.sort((a, b) => a - b)
  return {
    ok,
    banco,
    mediana: tempos[Math.floor(tempos.length / 2)] ?? -1,
    min: tempos[0] ?? -1,
    max: tempos[tempos.length - 1] ?? -1,
  }
}

function deployProducaoAtual() {
  const r = rodar("vercel", ["ls", "--prod"], { silencioso: true })
  const linha = r.saida.split("\n").find((l) => /https:\/\/\S+\.vercel\.app/.test(l) && /Ready/.test(l))
  return linha?.match(/https:\/\/\S+\.vercel\.app/)?.[0] ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// reverter — volta as variáveis, redeploya e descongela o banco antigo.
// ─────────────────────────────────────────────────────────────────────────────
async function reverter() {
  if (!existsSync(ARQ_ENV_ANTES)) abortar(`Sem ${ARQ_ENV_ANTES}, não sei para onde voltar.`)
  const antes = Object.fromEntries(
    readFileSync(ARQ_ENV_ANTES, "utf8").split("\n").filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
  )

  titulo("O que se perde ao voltar")
  try {
    const d = destino()
    const o = origem()
    const [novo] = await consultar(d.direta, `SELECT count(*)::int n FROM demandas`)
    const [velho] = await consultar(o.direta, `SELECT count(*)::int n FROM demandas`)
    if (novo.n !== velho.n) {
      aviso(`o banco novo tem ${novo.n} demandas e o antigo ${velho.n} — a diferença some ao voltar`)
    } else {
      ok("nenhuma demanda nova gravada desde a virada — voltar não custa registro")
    }
  } catch {
    aviso("não consegui comparar os dois bancos; siga sabendo que o que foi gravado no novo fica lá")
  }

  titulo("Devolvendo as variáveis de Production")
  for (const nome of ["DATABASE_URL", "DIRECT_URL"]) {
    if (!antes[nome]) abortar(`${nome} não está no backup — não posso devolver o que não guardei.`)
    trocarEnv(nome, antes[nome])
  }
  const dep = deployProducaoAtual()
  rodar("vercel", ["redeploy", dep, "--target", "production"], { silencioso: true })
  ok("redeploy feito")

  await descongelar()
  gravarEstado("reverter", { ok: true })
  console.log("\n✅ Produção de volta ao banco antigo, e ele voltou a aceitar escrita.\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// ligar-rls / desligar-rls — a SEGUNDA virada, dias depois da primeira. Não
// move dado, não pede janela, não congela nada: troca credencial e redeploya.
// Reversível em um comando, que é o que a torna segura (§1 do plano de voo).
// ─────────────────────────────────────────────────────────────────────────────
async function ligarRls() {
  exigirFase("verificar", "verificar")
  const urls = lerUrlsGuardadas()
  if (!urls?.DATABASE_URL_APP_USER) abortar(`Sem as URLs de ${ARQ_URLS}.`)

  titulo("Trocando a credencial da aplicação para o role sem BYPASSRLS")
  trocarEnv("DATABASE_URL", urls.DATABASE_URL_APP_USER)
  trocarEnv("AUTH_DATABASE_URL", urls.AUTH_DATABASE_URL)
  trocarEnv("ADMIN_DATABASE_URL", urls.DIRECT_URL)
  trocarEnv("RLS_ATIVO", "sim")

  const dep = deployProducaoAtual()
  rodar("vercel", ["redeploy", dep, "--target", "production"], { silencioso: true })
  ok("redeploy feito")

  const s = await medirSaude(8)
  if (!s.ok) {
    abortar(
      `health respondeu ${s.banco} — algo na credencial nova não está de pé.`,
      "Reverta agora:  node scripts/virada/virada.mjs desligar-rls"
    )
  }
  ok(`banco: ok · mediana ${s.mediana} ms com RLS ligada`)
  gravarEstado("ligar-rls", { ok: true, latencia: s.mediana })
  console.log(`
✅ RLS no ar. Agora o banco recusa sozinho o que o código esquecer de filtrar.

   Olhe, nesta ordem: login (é o que o app_auth resolve), Kanban das duas
   empresas, uma demanda aberta, um comentário gravado, o WhatsApp recebendo.
   Qualquer tela vazia que não deveria estar vazia:

     node scripts/virada/virada.mjs desligar-rls
`)
}

async function desligarRls() {
  const antes = existsSync(ARQ_ENV_ANTES)
    ? Object.fromEntries(readFileSync(ARQ_ENV_ANTES, "utf8").split("\n").filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]))
    : {}
  const urls = lerUrlsGuardadas()
  titulo("Voltando a aplicação para a conexão de dono")
  trocarEnv("DATABASE_URL", urls?.DATABASE_URL_DONO ?? antes.DATABASE_URL)
  trocarEnv("RLS_ATIVO", "nao")
  const dep = deployProducaoAtual()
  rodar("vercel", ["redeploy", dep, "--target", "production"], { silencioso: true })
  ok("redeploy feito — o dono ignora RLS por definição, tudo volta a aparecer")
  gravarEstado("desligar-rls", { ok: true })
}

// ─────────────────────────────────────────────────────────────────────────────
async function executar() {
  await preflight()
  await congelar()
  await dump()
  await restaurar()
  await conferir()
  console.log(`
──────────────────────────────────────────────────────────────────────────────
  Tudo verde até aqui, e NADA é irreversível ainda: a produção segue lendo e
  gravando... nada, porque está congelada, no banco antigo.

  O passo seguinte muda isso. Depois dele, o que for gravado existe só em
  São Paulo:

    node scripts/virada/virada.mjs apontar --confirmo=${destino().ref}
    node scripts/virada/virada.mjs verificar

  Para desistir agora, sem custo nenhum:

    node scripts/virada/virada.mjs descongelar
──────────────────────────────────────────────────────────────────────────────
`)
}

const COMANDOS = {
  preflight, congelar, descongelar, dump, restaurar, conferir, apontar, verificar,
  executar, reverter, "ligar-rls": ligarRls, "desligar-rls": desligarRls,
}

if (!COMANDOS[comando]) {
  console.log(`\nuso: node scripts/virada/virada.mjs <comando>\n\n  ${Object.keys(COMANDOS).join("\n  ")}\n`)
  process.exit(1)
}
await COMANDOS[comando]()
