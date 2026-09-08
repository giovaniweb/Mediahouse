#!/usr/bin/env node
// Prova que o RLS isola — sem tocar em dado real e sem precisar de credencial.
//
// O truque é `SET LOCAL ROLE app_user`: dentro da transação, `current_user` passa
// a ser o role da aplicação, que NÃO tem BYPASSRLS, então as políticas valem de
// verdade. Tudo acontece dentro de um BEGIN ... ROLLBACK, incluindo as duas
// empresas de mentira que o teste cria. Nada sobra.
//
// É o teste que responde à única pergunta que importa antes da virada:
// se a aplicação conectar como `app_user`, ela vê o que deveria e só isso?
//
//   node scripts/verificar-rls.mjs
//
// Sai 1 se qualquer isolamento falhar.
import { config } from "dotenv"
import pg from "pg"

config({ path: ".env.local" })
config({ path: ".env" })

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) {
  console.error("\n❌ Sem DIRECT_URL/DATABASE_URL.\n")
  process.exit(1)
}

const c = new pg.Client({ connectionString: url })
await c.connect()

let falhas = 0
function conferir(condicao, texto) {
  if (condicao) {
    console.log(`  ✅ ${texto}`)
  } else {
    falhas++
    console.log(`  ❌ ${texto}`)
  }
}

const { rows: [role] } = await c.query(`SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_user'`)
if (!role) {
  console.error("\n❌ Role `app_user` não existe. A migration de RLS não foi aplicada neste banco.\n")
  process.exit(1)
}
if (role.rolbypassrls) {
  console.error("\n❌ `app_user` tem BYPASSRLS — as políticas seriam decorativas.\n")
  process.exit(1)
}

// Preenche sozinho as colunas obrigatórias que o teste não citou. Sem isto, o
// dia em que alguém tornar mais uma coluna NOT NULL quebra a verificação de RLS
// por um motivo que não tem nada a ver com RLS — e um gate que falha por motivo
// errado é um gate que as pessoas aprendem a ignorar.
async function inserir(tabela, valores) {
  const { rows: obrigatorias } = await c.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1
        AND is_nullable='NO' AND column_default IS NULL`,
    [tabela]
  )
  // Coluna obrigatória que é chave estrangeira não pode ser inventada: "teste"
  // não existe na tabela apontada. Nesses casos o teste tem que fornecer o
  // valor, e a mensagem diz qual.
  const { rows: fks } = await c.query(
    `SELECT kcu.column_name FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name=$1`,
    [tabela]
  )
  const chavesEstrangeiras = new Set(fks.map((f) => f.column_name))

  const completo = { ...valores }
  for (const { column_name: col, data_type: tipo, udt_name: udt } of obrigatorias) {
    if (col in completo) continue
    if (chavesEstrangeiras.has(col)) {
      throw new Error(
        `verificar-rls: "${tabela}"."${col}" é obrigatória e é chave estrangeira — ` +
          `o teste precisa passar um id válido para ela.`
      )
    }
    if (tipo === "USER-DEFINED") {
      // Enum: qualquer rótulo serve, mas tem que ser um que exista.
      const { rows: [e] } = await c.query(
        `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = $1 ORDER BY e.enumsortorder LIMIT 1`, [udt]
      )
      completo[col] = e?.enumlabel ?? "teste"
    }
    else if (tipo.includes("timestamp")) completo[col] = new Date()
    else if (tipo.includes("char") || tipo === "text") completo[col] = "teste"
    else if (tipo.includes("int") || tipo.includes("numeric") || tipo === "double precision") completo[col] = 0
    else if (tipo === "boolean") completo[col] = false
    else if (tipo === "ARRAY") completo[col] = []
  }
  const cols = Object.keys(completo)
  await c.query(
    `INSERT INTO "${tabela}" (${cols.map((k) => `"${k}"`).join(", ")})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
    cols.map((k) => completo[k])
  )
}

console.log("\n── Isolamento, com dado de mentira numa transação desfeita ──\n")

await c.query("BEGIN")
try {
  const A = "rls-teste-org-a"
  const B = "rls-teste-org-b"
  for (const [id, slug] of [[A, "rls-teste-a"], [B, "rls-teste-b"]]) {
    await inserir("organizacoes", { id, nome: `RLS Teste ${slug}`, slug })
  }
  // A pessoa vem antes: `demandas.solicitanteId` é obrigatória e aponta para ela.
  await inserir("usuarios", { id: "rls-user-1", nome: "RLS Teste", email: "rls-teste@exemplo.invalido", senhaHash: "x" })
  await inserir("videomakers", { id: "rls-vm-1", nome: "RLS Teste VM" })

  for (const [org, codigo, id] of [[A, "RLS-A-1", "rls-dem-a"], [B, "RLS-B-1", "rls-dem-b"]]) {
    await inserir("demandas", { id, codigo, organizacaoId: org, solicitanteId: "rls-user-1" })
  }
  // Filhas, para provar que a política que pergunta ao PAI também segura.
  await inserir("historico_status", { id: "rls-hist-a", demandaId: "rls-dem-a", statusNovo: "entrada" })
  await inserir("historico_status", { id: "rls-hist-b", demandaId: "rls-dem-b", statusNovo: "entrada" })

  async function comoRole(nomeRole, orgId, sql, params = []) {
    await c.query("SAVEPOINT sp")
    await c.query(`SET LOCAL ROLE ${nomeRole}`)
    // `SET LOCAL` vale até o fim da TRANSAÇÃO, e RELEASE SAVEPOINT não o desfaz:
    // sem limpar aqui, a empresa da chamada anterior continuava valendo e o
    // teste do "sem empresa declarada" herdava a de antes. Foi o verificador
    // pegando um erro no próprio verificador.
    await c.query(`SELECT set_config('app.org_id', $1, true)`, [orgId ?? ""])
    try {
      return await c.query(sql, params)
    } finally {
      await c.query("RESET ROLE")
      await c.query("RELEASE SAVEPOINT sp")
    }
  }
  const comoApp = (orgId, sql, params) => comoRole("app_user", orgId, sql, params)

  // Erro ESPERADO, com a transação preservada.
  //
  // `comoRole` não serve para isso: quando a consulta falha, o `RESET ROLE` do
  // finally já morre com 25P02 (transação abortada), o erro real some, e todo
  // comando seguinte morre junto. Enquanto a verificação que esperava erro era
  // a ÚLTIMA do arquivo isso não aparecia — o `ROLLBACK` do finally limpava
  // tudo logo depois. Bastou existir verificação depois dela para aparecer.
  //
  // `ROLLBACK TO SAVEPOINT` é o único comando que uma transação abortada aceita,
  // e é ele que a devolve ao estado utilizável. Devolve também o `SET LOCAL
  // ROLE` e o `app.org_id` ao que eram antes, então não há contexto vazando
  // para a verificação seguinte.
  async function erroComoRole(nomeRole, orgId, sql, params = []) {
    await c.query("SAVEPOINT sp_erro")
    try {
      await c.query(`SET LOCAL ROLE ${nomeRole}`)
      await c.query(`SELECT set_config('app.org_id', $1, true)`, [orgId ?? ""])
      await c.query(sql, params)
      await c.query("RESET ROLE")
      await c.query("RELEASE SAVEPOINT sp_erro")
      return null
    } catch (e) {
      await c.query("ROLLBACK TO SAVEPOINT sp_erro")
      await c.query("RELEASE SAVEPOINT sp_erro")
      return String(e.message).split("\n")[0]
    }
  }
  const erroComoApp = (orgId, sql, params) => erroComoRole("app_user", orgId, sql, params)

  // 1. Antes de qualquer coisa: sem empresa declarada, nada sai. É a falha
  // fechada, e testar isso PRIMEIRO garante que nenhuma declaração anterior
  // esteja mascarando o resultado.
  let r = await comoApp(null, `SELECT count(*)::int n FROM demandas`)
  conferir(r.rows[0].n === 0, "sem app.org_id declarado: zero linhas — falha fechada")

  // 2. Coluna direta
  r = await comoApp(A, `SELECT codigo FROM demandas WHERE codigo LIKE 'RLS-%' ORDER BY codigo`)
  const vistos = r.rows.map((x) => x.codigo)
  conferir(
    vistos.length === 1 && vistos[0] === "RLS-A-1",
    `demandas: a empresa A vê ${JSON.stringify(vistos)} e não a da B`
  )

  // 3. Política por PAI — a filha não tem coluna de empresa
  r = await comoApp(A, `SELECT id FROM historico_status WHERE id LIKE 'rls-hist-%'`)
  conferir(
    r.rows.length === 1 && r.rows[0].id === "rls-hist-a",
    "historico_status: a filha segue o dono do pai"
  )

  // 4. Escrever na empresa dos outros
  let recusou = false
  try {
    await comoApp(A, `UPDATE demandas SET titulo = 'invadido' WHERE codigo = 'RLS-B-1'`)
    const chk = await c.query(`SELECT titulo FROM demandas WHERE codigo = 'RLS-B-1'`)
    recusou = chk.rows[0].titulo !== "invadido"
  } catch {
    recusou = true
  }
  conferir(recusou, "UPDATE na demanda da outra empresa não pega")

  // 5. INSERT carimbando outra empresa
  let bloqueou = false
  try {
    await c.query("SAVEPOINT sp_ins")
    await c.query("SET LOCAL ROLE app_user")
    await c.query(`SELECT set_config('app.org_id', $1, true)`, [A])
    try {
      await inserir("demandas", { id: "rls-dem-x", codigo: "RLS-X-1", organizacaoId: B, solicitanteId: "rls-user-1" })
    } finally {
      await c.query("RESET ROLE")
    }
  } catch {
    bloqueou = true
    await c.query("ROLLBACK TO SAVEPOINT sp_ins")
  }
  await c.query("RELEASE SAVEPOINT sp_ins")
  conferir(bloqueou, "INSERT carimbando a empresa alheia é recusado (WITH CHECK)")

  // 6. A rede continua legível — é o marketplace
  r = await comoApp(A, `SELECT count(*)::int n FROM videomakers WHERE id = 'rls-vm-1'`)
  conferir(r.rows[0].n === 1, "videomakers: a rede segue legível — o marketplace continua de pé")

  // 7. O caminho de login enxerga usuarios
  r = await comoRole("app_auth", null, `SELECT count(*)::int n FROM usuarios WHERE id = 'rls-user-1'`)
  conferir(r.rows[0].n === 1, "app_auth lê usuarios — o login sobrevive ao RLS")

  // 8. E NÃO enxerga dado de cliente
  const erroAuth = await erroComoRole("app_auth", null, `SELECT count(*) FROM demandas`)
  conferir(!!erroAuth, "app_auth não alcança demandas — o role está estreito")

  // ─────────────────────────────────────────────────────────────────────────
  // Espelhamento cross-tenant: a empresa B executa um job da empresa A.
  //
  // O que estas provas cobrem, e que nenhuma das oito acima cobria: agora
  // EXISTE um caminho legítimo de uma empresa ver a linha de outra. Um caminho
  // assim só é seguro se as bordas dele estiverem provadas — quem entra, quem
  // NÃO entra, o que dá para escrever, e o que acontece quando se revoga.
  // ─────────────────────────────────────────────────────────────────────────
  const C = "rls-teste-org-c"
  await inserir("organizacoes", { id: C, nome: "RLS Teste C", slug: "rls-teste-c" })
  await inserir("custos_videomaker", {
    id: "rls-custo-a", organizacaoId: A, demandaId: "rls-dem-a", videomakerId: "rls-vm-1", valor: 500,
  })

  // 9. O aperto de mão é pré-requisito, e quem confere é o banco — não a rota.
  let erro = await erroComoApp(A, `INSERT INTO demanda_compartilhamento
    ("id","demandaId","organizacaoOrigemId","organizacaoDestinoId","nomeOrigem","nomeDestino","criadoPorId")
    VALUES ('rls-esp-cedo','rls-dem-a','${A}','${B}','x','y','rls-user-1')`)
  conferir(!!erro && /parceria aceita/.test(erro), "sem parceria aceita, compartilhar é recusado")

  await inserir("parceria_organizacao", {
    id: "rls-par-1", organizacaoConvidanteId: A, organizacaoConvidadaId: B,
    // Rótulos mentirosos de propósito: o gatilho tem que derivá-los.
    nomeConvidante: "MENTIRA", nomeConvidada: "MENTIRA",
    status: "pendente", criadoPorId: "rls-user-1",
  })
  r = await c.query(`SELECT "nomeConvidante" FROM parceria_organizacao WHERE id='rls-par-1'`)
  conferir(
    r.rows[0].nomeConvidante !== "MENTIRA",
    "o nome do parceiro é derivado — nenhuma empresa lê a linha da outra em `organizacoes`"
  )

  // 10. O par é um só. A→B e B→A seriam duas verdades sobre a mesma relação.
  erro = await erroComoApp(B, `INSERT INTO parceria_organizacao
    ("id","organizacaoConvidanteId","organizacaoConvidadaId","nomeConvidante","nomeConvidada","status","criadoPorId")
    VALUES ('rls-par-2','${B}','${A}','x','y','pendente','rls-user-1')`)
  conferir(!!erro, "parceria no sentido inverso é recusada — o par é um só")

  // 11. Quem convida não aceita o próprio convite, senão o aceite é decoração.
  erro = await erroComoApp(A, `UPDATE parceria_organizacao SET status='aceita' WHERE id='rls-par-1'`)
  conferir(!!erro && /convidada/.test(erro), "quem convidou não aceita o próprio convite")

  await comoApp(B, `UPDATE parceria_organizacao SET status='aceita' WHERE id='rls-par-1'`)
  r = await c.query(`SELECT status FROM parceria_organizacao WHERE id='rls-par-1'`)
  conferir(r.rows[0].status === "aceita", "a empresa convidada aceita a parceria")

  // 12. A origem da aresta é DERIVADA do pai. Vai um valor mentiroso de
  // propósito: se o gatilho não estivesse lá, a mentira ficaria gravada e a
  // política de `demandas` passaria a confiar nela.
  await inserir("demanda_compartilhamento", {
    id: "rls-esp-1", demandaId: "rls-dem-a",
    organizacaoOrigemId: "FORJADO", organizacaoDestinoId: B,
    nomeOrigem: "MENTIRA", nomeDestino: "MENTIRA", criadoPorId: "rls-user-1",
  })
  r = await c.query(`SELECT "organizacaoOrigemId","nomeOrigem" FROM demanda_compartilhamento WHERE id='rls-esp-1'`)
  conferir(
    r.rows[0].organizacaoOrigemId === A && r.rows[0].nomeOrigem !== "MENTIRA",
    "a origem da aresta é derivada da demanda, não aceita do cliente"
  )

  // 13. Quem enxerga o card espelhado — e quem não.
  r = await comoApp(B, `SELECT codigo FROM demandas WHERE codigo LIKE 'RLS-%' ORDER BY codigo`)
  const vistosB = r.rows.map((x) => x.codigo)
  conferir(
    vistosB.length === 2 && vistosB.includes("RLS-A-1"),
    `a empresa B vê o card espelhado da A junto com o dela: ${JSON.stringify(vistosB)}`
  )
  r = await comoApp(C, `SELECT count(*)::int n FROM demandas WHERE codigo LIKE 'RLS-%'`)
  conferir(r.rows[0].n === 0, "a empresa C, fora da aresta, não vê nada — espelho não é vitrine")

  // 14. O destino não se convida: a assimetria entre a política de leitura
  // (dois lados) e a de escrita (só a origem) é a segurança do recurso.
  erro = await erroComoApp(B, `INSERT INTO demanda_compartilhamento
    ("id","demandaId","organizacaoOrigemId","organizacaoDestinoId","nomeOrigem","nomeDestino","criadoPorId")
    VALUES ('rls-esp-2','rls-dem-a','${A}','${B}','x','y','rls-user-1')`)
  conferir(!!erro, "o destino não cria aresta para si mesmo")
  r = await comoApp(B, `DELETE FROM demanda_compartilhamento WHERE id='rls-esp-1'`)
  conferir(r.rowCount === 0, "o destino não apaga a própria restrição")

  // 15. Quais COLUNAS o espelho move. É a pergunta que a RLS não responde —
  // `WITH CHECK` só enxerga a linha nova —, e por isso mora num gatilho.
  await comoApp(B, `UPDATE demandas
    SET "statusInterno"='editando', titulo='SEQUESTRADO', "dataLimite"='2027-01-01'
    WHERE codigo='RLS-A-1'`)
  r = await c.query(`SELECT "statusInterno", titulo FROM demandas WHERE codigo='RLS-A-1'`)
  conferir(r.rows[0].statusInterno === "editando", "o espelho move o status — é o trabalho dele")
  conferir(r.rows[0].titulo !== "SEQUESTRADO", "o espelho NÃO muda o título: fora da lista branca, volta ao valor da dona")

  erro = await erroComoApp(B, `UPDATE demandas SET "organizacaoId"='${B}' WHERE codigo='RLS-A-1'`)
  conferir(!!erro && /posse/.test(erro), "o espelho não transfere a posse da demanda")

  // E a dona não foi limitada por tabela: o gatilho sai pela porta quando quem
  // age é o dono do card.
  await comoApp(A, `UPDATE demandas SET titulo='A dona pode' WHERE codigo='RLS-A-1'`)
  r = await c.query(`SELECT titulo FROM demandas WHERE codigo='RLS-A-1'`)
  conferir(r.rows[0].titulo === "A dona pode", "a dona continua mudando tudo no card dela")

  // 16. O que atravessa e o que não. A ausência de política é a decisão.
  r = await comoApp(B, `SELECT count(*)::int n FROM custos_videomaker WHERE id='rls-custo-a'`)
  conferir(r.rows[0].n === 0, "o espelho NÃO alcança custos_videomaker — o cache é da origem")
  r = await comoApp(B, `SELECT count(*)::int n FROM historico_status WHERE id='rls-hist-a'`)
  conferir(r.rows[0].n === 1, "o espelho alcança historico_status — sem isso não move card")
  await comoApp(B, `INSERT INTO historico_status ("id","demandaId","statusNovo","origem")
                    VALUES ('rls-hist-esp','rls-dem-a','editando','kanban')`)
  r = await c.query(`SELECT count(*)::int n FROM historico_status WHERE id='rls-hist-esp'`)
  conferir(r.rows[0].n === 1, "o espelho GRAVA na timeline do card que executa")

  // 17. Revogar tira o acesso e preserva a prova de que ele existiu.
  await comoApp(A, `UPDATE demanda_compartilhamento SET "revogadoEm"=now() WHERE id='rls-esp-1'`)
  r = await comoApp(B, `SELECT count(*)::int n FROM demandas WHERE codigo='RLS-A-1'`)
  conferir(r.rows[0].n === 0, "revogado: o destino deixa de ver o card")
  r = await c.query(`SELECT count(*)::int n FROM demanda_compartilhamento WHERE id='rls-esp-1'`)
  conferir(r.rows[0].n === 1, "revogado: a aresta permanece — a prova do acesso não é apagada")
} finally {
  await c.query("ROLLBACK")
}

const { rows: [sobra] } = await c.query(
  `SELECT count(*)::int n FROM organizacoes WHERE slug LIKE 'rls-teste-%'`
)
conferir(sobra.n === 0, "nada de teste sobrou no banco")

// Cobertura: toda tabela com RLS tem política, menos as três intencionais.
const { rows: semPolitica } = await c.query(`
  SELECT c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
  ORDER BY c.relname`)
const previstas = ["chat_ia_mensagens", "produtos_servico_evento", "sessions"]
const inesperadas = semPolitica.map((r) => r.relname).filter((t) => !previstas.includes(t))
conferir(
  inesperadas.length === 0,
  inesperadas.length === 0
    ? `RLS ligada sem política só nas 3 previstas (${previstas.join(", ")})`
    : `tabelas ficariam vazias para a aplicação: ${inesperadas.join(", ")}`
)

const { rows: semRls } = await c.query(`
  SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity AND c.relname <> '_prisma_migrations'`)
conferir(
  semRls.length === 0,
  semRls.length === 0
    ? "nenhuma tabela de negócio ficou fora do RLS"
    : `sem RLS: ${semRls.map((r) => r.relname).join(", ")}`
)

await c.end()

if (falhas > 0) {
  console.error(`\n❌ ${falhas} verificação(ões) falharam. NÃO vire a chave.\n`)
  process.exit(1)
}
console.log("\n✅ Isolamento provado. Nada foi alterado no banco.\n")
