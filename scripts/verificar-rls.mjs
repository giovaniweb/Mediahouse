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

  // Quem é o videomaker e o editor do card é decisão da dona (12/11/2026).
  await comoApp(B, `UPDATE demandas SET "videomakerId"='rls-vm-1' WHERE codigo='RLS-A-1'`)
  r = await c.query(`SELECT "videomakerId" FROM demandas WHERE codigo='RLS-A-1'`)
  conferir(r.rows[0].videomakerId === null, "o espelho NÃO troca o videomaker da dona — videomakerId fora da lista")

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

  // 17. Revogar tira o acesso e preserva a prova de que ele existiu — MESMO com
  // a parceria já encerrada. Até 12/11/2026 o gatilho conferia a parceria em
  // todo update e esta revogação dava erro: o acesso ficava preso aberto.
  await c.query(`UPDATE parceria_organizacao SET status='encerrada', "encerradaEm"=now() WHERE id='rls-par-1'`)
  erro = await erroComoApp(A, `UPDATE demanda_compartilhamento SET "revogadoEm"=now() WHERE id='rls-esp-1'`)
  conferir(erro === null, `revogar com a parceria encerrada funciona${erro ? ` (veio: ${erro})` : ""}`)
  r = await comoApp(B, `SELECT count(*)::int n FROM demandas WHERE codigo='RLS-A-1'`)
  conferir(r.rows[0].n === 0, "revogado: o destino deixa de ver o card")
  r = await c.query(`SELECT count(*)::int n FROM demanda_compartilhamento WHERE id='rls-esp-1'`)
  conferir(r.rows[0].n === 1, "revogado: a aresta permanece — a prova do acesso não é apagada")
  erro = await erroComoApp(A, `UPDATE demanda_compartilhamento SET "revogadoEm"=NULL WHERE id='rls-esp-1'`)
  conferir(!!erro && /parceria aceita/.test(erro), "reativar sem parceria aceita é recusado — a parceria vale ao DAR acesso")

  // 19. Videomaker que trabalha por uma empresa (12/11/2026): A escala o
  // rls-vm-1, que trabalha pela B. O espelho é automático, quem da B faz é dado
  // da B, e sair do card ou trocar a "Empresa dele" tira o card da B.
  await c.query(`UPDATE parceria_organizacao SET status='aceita', "encerradaEm"=NULL WHERE id='rls-par-1'`)
  erro = await erroComoApp(A, `INSERT INTO videomaker_organizacao (id,"organizacaoId","videomakerId","organizacaoExecutoraId","updatedAt")
    VALUES ('rls-vo-a','${A}','rls-vm-1','${B}',now())`)
  conferir(!!erro && /admin ou gestor/.test(erro), "a Empresa dele exige que o videomaker mande lá (sem login: recusado)")
  await c.query(`UPDATE videomakers SET "usuarioId"='rls-user-1' WHERE id='rls-vm-1'`)
  await inserir("usuario_organizacao", { id: "rls-uo-b", usuarioId: "rls-user-1", organizacaoId: B, papel: "videomaker" })
  erro = await erroComoApp(A, `INSERT INTO videomaker_organizacao (id,"organizacaoId","videomakerId","organizacaoExecutoraId","updatedAt")
    VALUES ('rls-vo-a','${A}','rls-vm-1','${B}',now())`)
  conferir(!!erro && /admin ou gestor/.test(erro), "a Empresa dele exige admin ou gestor (videomaker lá: recusado)")
  await c.query(`UPDATE usuario_organizacao SET papel='gestor' WHERE id='rls-uo-b'`)
  erro = await erroComoApp(A, `INSERT INTO videomaker_organizacao (id,"organizacaoId","videomakerId","organizacaoExecutoraId","updatedAt")
    VALUES ('rls-vo-a','${A}','rls-vm-1','${B}',now())`)
  conferir(erro === null, `com ele gestor na B, a Empresa dele é gravada${erro ? ` (veio: ${erro})` : ""}`)

  await c.query(`UPDATE demandas SET "videomakerId"='rls-vm-1' WHERE id='rls-dem-a'`)
  await c.query(`UPDATE demanda_compartilhamento SET "revogadoEm"=NULL, "porVideomakerId"='rls-vm-1' WHERE id='rls-esp-1'`)
  await inserir("videomakers", { id: "rls-vm-x", nome: "RLS X da B" })
  await inserir("videomaker_organizacao", { id: "rls-vo-x", organizacaoId: B, videomakerId: "rls-vm-x" })
  erro = await erroComoApp(B, `INSERT INTO executor_espelho (id,"organizacaoId","demandaId","videomakerId","escolhidoPorId","updatedAt")
    VALUES ('rls-ex-0','${B}','rls-dem-a','rls-vm-1','rls-user-1',now())`)
  conferir(!!erro && /videomaker desta empresa/.test(erro), "quem faz precisa ser videomaker da empresa que executa")
  erro = await erroComoApp(B, `INSERT INTO executor_espelho (id,"organizacaoId","demandaId","videomakerId","escolhidoPorId","updatedAt")
    VALUES ('rls-ex-1','${B}','rls-dem-a','rls-vm-x','rls-user-1',now())`)
  conferir(erro === null, `a B escolhe o X para o card espelhado${erro ? ` (veio: ${erro})` : ""}`)
  erro = await erroComoApp(C, `INSERT INTO executor_espelho (id,"organizacaoId","demandaId","videomakerId","escolhidoPorId","updatedAt")
    VALUES ('rls-ex-c','${C}','rls-dem-a','rls-vm-x','rls-user-1',now())`)
  conferir(!!erro, "empresa sem o card não escolhe executor")
  r = await comoApp(A, `SELECT count(*)::int n FROM executor_espelho WHERE "demandaId"='rls-dem-a'`)
  conferir(r.rows[0].n === 0, "a dona NÃO vê quem da parceira faz — executor_espelho é dado da B")
  r = await comoApp(B, `SELECT count(*)::int n FROM executor_espelho WHERE "demandaId"='rls-dem-a'`)
  conferir(r.rows[0].n === 1, "a B vê o executor que escolheu")

  await comoApp(A, `UPDATE demandas SET "videomakerId"=NULL WHERE id='rls-dem-a'`)
  r = await c.query(`SELECT "revogadoEm" IS NOT NULL AS revogado FROM demanda_compartilhamento WHERE id='rls-esp-1'`)
  conferir(r.rows[0].revogado, "tirar o videomaker do card revoga o espelho automático")
  r = await c.query(`SELECT count(*)::int n FROM executor_espelho WHERE "demandaId"='rls-dem-a'`)
  conferir(r.rows[0].n === 0, "revogado: o executor da B é apagado")
  r = await c.query(`SELECT count(*)::int n FROM historico_status WHERE "demandaId"='rls-dem-a' AND "statusNovo"='espelho_revogado'`)
  conferir(r.rows[0].n === 1, "revogado: a timeline da dona registra a saída")
  r = await c.query(`SELECT count(*)::int n FROM alertas_ia WHERE "organizacaoId"='${B}' AND "tipoAlerta"='espelho_revogado' AND "demandaId" IS NULL`)
  conferir(r.rows[0].n === 1, "revogado: o sino da B avisa, sem link para o card que não abre mais")

  await c.query(`UPDATE demandas SET "videomakerId"='rls-vm-1' WHERE id='rls-dem-a'`)
  await c.query(`UPDATE demanda_compartilhamento SET "revogadoEm"=NULL WHERE id='rls-esp-1'`)
  await comoApp(A, `UPDATE videomaker_organizacao SET "organizacaoExecutoraId"=NULL WHERE id='rls-vo-a'`)
  r = await c.query(`SELECT "revogadoEm" IS NOT NULL AS revogado FROM demanda_compartilhamento WHERE id='rls-esp-1'`)
  conferir(r.rows[0].revogado, "tirar a Empresa dele revoga o espelho dos cards abertos")

  // 18. Aceite dos termos (Onda 3): por empresa, e a prova não se reescreve.
  for (const [id, org] of [["rls-aceite-a", A], ["rls-aceite-b", B]]) {
    await inserir("aceites_termos", { id, organizacaoId: org, titularTipo: "usuario", titularId: "rls-user-1", documentos: ["termos@1.0"], origem: "primeiro_acesso" })
  }
  r = await comoApp(A, `SELECT id FROM aceites_termos WHERE id LIKE 'rls-aceite-%'`)
  conferir(r.rows.length === 1 && r.rows[0].id === "rls-aceite-a", "aceites_termos: a empresa A vê só o aceite dela")
  const aceiteNaOutra = await erroComoApp(A, `INSERT INTO aceites_termos (id, "organizacaoId", "titularTipo", "titularId", documentos, origem)
                                                VALUES ('rls-aceite-x', '${B}', 'usuario', 'rls-user-1', ARRAY['termos@1.0'], 'primeiro_acesso')`)
  conferir(aceiteNaOutra !== null, "aceites_termos: a empresa A não grava aceite na B")
  const editar = await erroComoApp(A, `UPDATE aceites_termos SET documentos = ARRAY['termos@9.9'] WHERE id = 'rls-aceite-a'`)
  conferir(editar !== null, "aceites_termos: a aplicação não edita aceite (sem UPDATE)")
  const apagar = await erroComoApp(A, `DELETE FROM aceites_termos WHERE id = 'rls-aceite-a'`)
  conferir(apagar !== null, "aceites_termos: a aplicação não apaga aceite (sem DELETE)")

  // 19. Código da demanda por empresa (Onda 2A): o mesmo código pode existir em
  // duas empresas, nunca duas vezes na mesma; o contador é de cada uma.
  const copia = (idNovo, idBase) => `INSERT INTO demandas SELECT (jsonb_populate_record(NULL::demandas,
    to_jsonb(d) || jsonb_build_object('id', '${idNovo}', 'codigo', 'RLS-A-1'))).* FROM demandas d WHERE d.id = '${idBase}'`
  const repetidoNaOutra = await erroComoApp(B, copia("rls-dem-mesmo-codigo", "rls-dem-b"))
  conferir(repetidoNaOutra === null, "código por empresa: a B pode ter o mesmo código que a A")
  const repetidoNaMesma = await erroComoApp(A, copia("rls-dem-repetida", "rls-dem-a"))
  conferir(repetidoNaMesma !== null, "código por empresa: a A não repete o próprio código")
  for (const org of [A, B]) {
    await comoApp(org, `INSERT INTO contadores_codigo ("organizacaoId", ano, ultimo) VALUES ('${org}', 26, 1)
                        ON CONFLICT ("organizacaoId", ano) DO UPDATE SET ultimo = contadores_codigo.ultimo + 1`)
  }
  r = await comoApp(A, `SELECT "organizacaoId" FROM contadores_codigo WHERE "organizacaoId" LIKE 'rls-teste-%'`)
  conferir(r.rows.length === 1 && r.rows[0].organizacaoId === A, "contadores_codigo: a empresa A vê só o contador dela")
  const contadorNaOutra = await erroComoApp(A, `INSERT INTO contadores_codigo ("organizacaoId", ano, ultimo) VALUES ('${B}', 27, 1)`)
  conferir(contadorNaOutra !== null, "contadores_codigo: a empresa A não cria contador na B")
  const apagarContador = await erroComoApp(A, `DELETE FROM contadores_codigo WHERE "organizacaoId" = '${A}'`)
  conferir(apagarContador !== null, "contadores_codigo: a aplicação não apaga contador (sem DELETE)")

  // 20. Avisos por pessoa (20261127000000): a escolha de uma empresa não aparece
  // nem é gravada na outra. "Voltar ao padrão" apaga a linha, por isso há DELETE.
  for (const [id, org] of [["rls-pref-a", A], ["rls-pref-b", B]]) {
    await inserir("preferencias_aviso", { id, organizacaoId: org, usuarioId: "rls-user-1", categoria: "andamento", whatsapp: false, updatedAt: new Date() })
  }
  r = await comoApp(A, `SELECT id FROM preferencias_aviso WHERE id LIKE 'rls-pref-%'`)
  conferir(r.rows.length === 1 && r.rows[0].id === "rls-pref-a", "preferencias_aviso: a empresa A vê só as escolhas dela")
  const prefNaOutra = await erroComoApp(A, `INSERT INTO preferencias_aviso (id, "organizacaoId", "usuarioId", categoria, "updatedAt")
                                              VALUES ('rls-pref-x', '${B}', 'rls-user-1', 'pedidos', now())`)
  conferir(prefNaOutra !== null, "preferencias_aviso: a empresa A não grava escolha na B")
  r = await comoApp(A, `DELETE FROM preferencias_aviso WHERE id IN ('rls-pref-a', 'rls-pref-b')`)
  conferir(r.rowCount === 1, "preferencias_aviso: a empresa A apaga a dela e não alcança a da B")
  const recorteInvalido = await erroComoApp(A, `INSERT INTO preferencias_aviso (id, "organizacaoId", "usuarioId", categoria, recorte, "updatedAt")
                                                 VALUES ('rls-pref-y', '${A}', 'rls-user-1', 'pedidos', 'todos_do_mundo', now())`)
  conferir(recorteInvalido !== null, "preferencias_aviso: recorte só aceita tudo, setor, meus ou pedi")
  const setorSemSetor = await erroComoApp(A, `INSERT INTO preferencias_aviso (id, "organizacaoId", "usuarioId", categoria, recorte, "updatedAt")
                                               VALUES ('rls-pref-z', '${A}', 'rls-user-1', 'pedidos', 'setor', now())`)
  conferir(setorSemSetor !== null, "preferencias_aviso: recorte 'setor' exige o setor (nunca corta às cegas)")

  // 21. Rede (Onda 2B, migration 20261128000000): convite é da empresa que
  // convida; contestação não se lê nem se grava direto; o score só devolve número.
  await inserir("convites_rede", { id: "rls-convite-a", organizacaoId: A, videomakerId: "rls-vm-1", updatedAt: new Date() })
  r = await comoApp(B, `SELECT count(*)::int n FROM convites_rede WHERE id = 'rls-convite-a'`)
  conferir(r.rows[0].n === 0, "convites_rede: a empresa B não vê o convite da A")
  const conviteNaOutra = await erroComoApp(B, `INSERT INTO convites_rede (id, "organizacaoId", "videomakerId", "updatedAt")
                                                 VALUES ('rls-convite-x', '${A}', 'rls-vm-1', now())`)
  conferir(conviteNaOutra !== null, "convites_rede: a empresa B não cria convite em nome da A")
  const apagarConvite = await erroComoApp(A, `DELETE FROM convites_rede WHERE id = 'rls-convite-a'`)
  conferir(apagarConvite !== null, "convites_rede: a aplicação não apaga convite (cancela pelo status)")
  const lerContestacao = await erroComoApp(A, `SELECT count(*) FROM contestacoes_avaliacao`)
  conferir(lerContestacao !== null, "contestacoes_avaliacao: a aplicação não lê direto (só pelas funções)")
  await inserir("avaliacoes_videomaker", { id: "rls-aval-a", videomakerId: "rls-vm-1", nota: 2, comentario: "privado da A", organizacaoId: A })
  r = await comoApp(B, `SELECT count(*)::int n FROM avaliacoes_videomaker WHERE id = 'rls-aval-a'`)
  conferir(r.rows[0].n === 0, "avaliacoes_videomaker: a empresa B não lê a avaliação (nem o comentário) da A")
  r = await comoApp(B, `SELECT * FROM public.score_rede('videomaker', ARRAY['rls-vm-1'])`)
  conferir(
    r.rows.length === 1 && r.fields.map((f) => f.name).join(",") === "id,media,avaliacoes" && r.rows[0].avaliacoes === 1,
    "score_rede: a empresa B vê só média e quantidade da rede, sem comentário nem empresa"
  )
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
// limites_publicos: só a função SECURITY DEFINER consumir_limite_publico toca
// nela (migration 20261001005000); a aplicação não lê nem escreve direto.
// contestacoes_avaliacao: o profissional abre e lê pelas funções SECURITY DEFINER
// contestar_avaliacao e avaliacoes_do_profissional, e a Plataforma decide pela
// conexão administrativa (migration 20261128000000).
const previstas = ["chat_ia_mensagens", "contestacoes_avaliacao", "limites_publicos", "produtos_servico_evento", "sessions"]
const inesperadas = semPolitica.map((r) => r.relname).filter((t) => !previstas.includes(t))
conferir(
  inesperadas.length === 0,
  inesperadas.length === 0
    ? `RLS ligada sem política só nas ${previstas.length} previstas (${previstas.join(", ")})`
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

// Fronteira da API do Supabase (20261005140000). Função SECURITY DEFINER roda
// com o poder do dono: quem a chama de fora da aplicação passa por cima do RLS.
// PUBLIC existe em qualquer banco; anon/authenticated/service_role só no
// Supabase, onde o privilégio padrão do projeto os põe em todo objeto novo.
const { rows: definerAbertas } = await c.query(`
  SELECT p.oid::regprocedure::text AS funcao, array_agg(x.nome::text ORDER BY x.nome) AS papeis
    FROM pg_proc p
   CROSS JOIN LATERAL (
     SELECT 'PUBLIC' AS nome
      WHERE EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)
     UNION ALL
     SELECT rolname FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'service_role') AND has_function_privilege(oid, p.oid, 'EXECUTE')
   ) x
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
   GROUP BY 1 ORDER BY 1`)
conferir(
  definerAbertas.length === 0,
  definerAbertas.length === 0
    ? "nenhuma função SECURITY DEFINER de public é chamável por PUBLIC ou pela API do Supabase"
    : `SECURITY DEFINER aberta (falta REVOKE): ${definerAbertas.map((f) => `${f.funcao} → ${f.papeis.join(", ")}`).join("; ")}`
)

const { rows: papeisApi } = await c.query(
  `SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')`
)
if (papeisApi.length > 0) {
  const { rows: abertos } = await c.query(`
    SELECT r.rolname || ' em ' || c.oid::regclass::text AS item
      FROM pg_class c JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role')
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       AND EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee = r.oid)
    UNION ALL
    SELECT r.rolname || ' no privilégio padrão de ' || pg_get_userbyid(d.defaclrole) || ' (' || d.defaclobjtype::text || ')'
      FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a JOIN pg_roles r ON r.oid = a.grantee
     WHERE d.defaclnamespace = 'public'::regnamespace AND r.rolname IN ('anon', 'authenticated', 'service_role')
     ORDER BY 1`)
  conferir(
    abertos.length === 0,
    abertos.length === 0
      ? "public fechado para anon/authenticated/service_role (tabelas e privilégio padrão)"
      : `public aberto para a API do Supabase: ${abertos.slice(0, 10).map((r) => r.item).join("; ")}` +
          (abertos.length > 10 ? ` (+${abertos.length - 10})` : "")
  )
}

await c.end()

if (falhas > 0) {
  console.error(`\n❌ ${falhas} verificação(ões) falharam. NÃO vire a chave.\n`)
  process.exit(1)
}
console.log("\n✅ Isolamento provado. Nada foi alterado no banco.\n")
