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
  const completo = { ...valores }
  for (const { column_name: col, data_type: tipo, udt_name: udt } of obrigatorias) {
    if (col in completo) continue
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
  for (const [org, codigo, id] of [[A, "RLS-A-1", "rls-dem-a"], [B, "RLS-B-1", "rls-dem-b"]]) {
    await inserir("demandas", { id, codigo, organizacaoId: org })
  }
  // Filhas, para provar que a política que pergunta ao PAI também segura.
  await inserir("historico_status", { id: "rls-hist-a", demandaId: "rls-dem-a", statusNovo: "entrada" })
  await inserir("historico_status", { id: "rls-hist-b", demandaId: "rls-dem-b", statusNovo: "entrada" })
  // Um perfil da rede e uma pessoa, para os testes 6 e 7 valerem também num
  // banco vazio — é assim que o CI roda esta verificação.
  await inserir("videomakers", { id: "rls-vm-1", nome: "RLS Teste VM" })
  await inserir("usuarios", { id: "rls-user-1", nome: "RLS Teste", email: "rls-teste@exemplo.invalido", senhaHash: "x" })

  async function comoRole(nomeRole, orgId, sql, params = []) {
    await c.query("SAVEPOINT sp")
    await c.query(`SET LOCAL ROLE ${nomeRole}`)
    if (orgId !== null) await c.query(`SELECT set_config('app.org_id', $1, true)`, [orgId])
    try {
      return await c.query(sql, params)
    } finally {
      await c.query("RESET ROLE")
      await c.query("RELEASE SAVEPOINT sp")
    }
  }
  const comoApp = (orgId, sql, params) => comoRole("app_user", orgId, sql, params)

  // 1. Coluna direta
  let r = await comoApp(A, `SELECT codigo FROM demandas WHERE codigo LIKE 'RLS-%' ORDER BY codigo`)
  const vistos = r.rows.map((x) => x.codigo)
  conferir(
    vistos.length === 1 && vistos[0] === "RLS-A-1",
    `demandas: a empresa A vê ${JSON.stringify(vistos)} e não a da B`
  )

  // 2. Política por PAI — a filha não tem coluna de empresa
  r = await comoApp(A, `SELECT id FROM historico_status WHERE id LIKE 'rls-hist-%'`)
  conferir(
    r.rows.length === 1 && r.rows[0].id === "rls-hist-a",
    "historico_status: a filha segue o dono do pai"
  )

  // 3. Sem declarar empresa: nada. É a falha fechada.
  r = await comoApp(null, `SELECT count(*)::int n FROM demandas`)
  conferir(r.rows[0].n === 0, "sem app.org_id declarado: zero linhas — falha fechada")

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
      await inserir("demandas", { id: "rls-dem-x", codigo: "RLS-X-1", organizacaoId: B })
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
  let negou = false
  try {
    await comoRole("app_auth", null, `SELECT count(*) FROM demandas`)
  } catch {
    negou = true
  }
  conferir(negou, "app_auth não alcança demandas — o role está estreito")
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
