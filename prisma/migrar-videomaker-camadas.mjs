// ETAPA 1 da separação do Videomaker em 3 camadas.
//
// Copia para tabelas POR EMPRESA o que hoje é global no cadastro do profissional:
//   • relação comercial  → videomaker_organizacao  (diária, status, lista negra)
//   • dados fiscais      → videomaker_dados_fiscais (CPF/CNPJ, banco, PIX cifrados)
//
// As colunas originais NÃO são tocadas — este script só copia. Trocar as
// leituras/escritas do app e dropar as colunas antigas é a etapa 2, num commit
// separado, para que esta aqui seja reversível sem perder dado nenhum.
//
// A empresa de destino é inferida do histórico: toda organização que já teve
// demanda ou custo com aquele profissional recebe uma cópia. Profissional sem
// histórico nenhum não tem destino e é apenas reportado.
//
// Profissional sem histórico nenhum: veio do cadastro público, que hoje é
// gerido pela Contourline (ver src/app/api/publico/videomaker/route.ts:69-71).
// `--org-padrao=<slug>` define para onde vão os dados fiscais deles; sem a flag,
// ficam de fora e o script apenas os reporta.
//
// Uso:
//   node prisma/migrar-videomaker-camadas.mjs                              # dry-run
//   node prisma/migrar-videomaker-camadas.mjs --org-padrao=contourline      # dry-run completo
//   node prisma/migrar-videomaker-camadas.mjs --org-padrao=contourline --apply
import { randomBytes, createCipheriv, createHash } from "node:crypto"
import pg from "pg"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local", quiet: true })

const apply = process.argv.includes("--apply")
const slugPadrao = process.argv.find((a) => a.startsWith("--org-padrao="))?.split("=")[1] ?? null

// Mesmo formato de src/lib/secret-crypto.ts (aes-256-gcm, base64url separado por ".").
function cifrar(valor) {
  if (!valor) return null
  const fonte = process.env.EMAIL_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET
  if (!fonte) throw new Error("Defina EMAIL_ENCRYPTION_KEY ou NEXTAUTH_SECRET.")
  const key = createHash("sha256").update(fonte).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const dados = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), dados].map((p) => p.toString("base64url")).join(".")
}

const cuid = () => "vm" + randomBytes(12).toString("hex")

const c = new pg.Client({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await c.connect()
try {
  const { rows: videomakers } = await c.query(`
    SELECT id, nome, status::text AS status, "valorDiaria", observacoes,
           "emListaNegra", "listaNegraMotivo", "podeEditar", "tipoContrato",
           "cpfCnpj", "razaoSocial", "nomeFantasia", representante, endereco,
           "dadosBancarios", "chavePix"
      FROM videomakers ORDER BY nome
  `)

  // Organizações com histórico real com cada profissional. Quanto mais sinais,
  // menos gente fica sem destino — e ninguém sem destino pode ter dado fiscal
  // perdido quando as colunas antigas forem removidas na etapa 2.
  const { rows: vinculos } = await c.query(`
    SELECT DISTINCT "videomakerId", "organizacaoId" FROM (
      SELECT "videomakerId", "organizacaoId" FROM demandas
       WHERE "videomakerId" IS NOT NULL AND "organizacaoId" IS NOT NULL
      UNION
      SELECT "videomakerId", "organizacaoId" FROM custos_videomaker
       WHERE "videomakerId" IS NOT NULL AND "organizacaoId" IS NOT NULL
      UNION
      SELECT "videomakerId", "organizacaoId" FROM eventos
       WHERE "videomakerId" IS NOT NULL AND "organizacaoId" IS NOT NULL
      UNION
      -- Escalado em cobertura (a organização vem da cobertura)
      SELECT ce."videomakerId", cob."organizacaoId"
        FROM coberturas_equipe ce JOIN coberturas cob ON cob.id = ce."coberturaId"
       WHERE ce."videomakerId" IS NOT NULL AND cob."organizacaoId" IS NOT NULL
    ) t
  `)

  const porVm = new Map()
  for (const v of vinculos) {
    if (!porVm.has(v.videomakerId)) porVm.set(v.videomakerId, [])
    porVm.get(v.videomakerId).push(v.organizacaoId)
  }

  const { rows: orgs } = await c.query(`SELECT id, slug FROM organizacoes`)
  const slugDe = Object.fromEntries(orgs.map((o) => [o.id, o.slug]))

  const temFiscal = (v) => !!(v.cpfCnpj || v.razaoSocial || v.dadosBancarios || v.chavePix || v.endereco)

  // Empresa padrão para quem não tem histórico (cadastro público).
  let orgPadraoId = null
  if (slugPadrao) {
    orgPadraoId = orgs.find((o) => o.slug === slugPadrao)?.id ?? null
    if (!orgPadraoId) {
      console.error(`Organização "${slugPadrao}" não encontrada.`)
      process.exit(1)
    }
    for (const v of videomakers) {
      if (!porVm.has(v.id)) porVm.set(v.id, [orgPadraoId])
    }
    console.log(`Empresa padrão para profissionais sem histórico: ${slugPadrao}`)
  }

  const semHistorico = videomakers.filter((v) => !porVm.has(v.id))
  const comHistorico = videomakers.filter((v) => porVm.has(v.id))
  const emMaisDeUma = comHistorico.filter((v) => porVm.get(v.id).length > 1)

  console.log(`\n${apply ? "APLICANDO" : "DRY-RUN (nada será escrito)"}\n`)
  console.log(`Profissionais no cadastro          : ${videomakers.length}`)
  console.log(`  com histórico em alguma empresa  : ${comHistorico.length}`)
  console.log(`  sem histórico (ficam só no perfil): ${semHistorico.length}`)
  console.log(`  com histórico em +1 empresa      : ${emMaisDeUma.length}`)
  console.log(`Com dados fiscais/bancários        : ${videomakers.filter(temFiscal).length}`)

  const porOrg = {}
  for (const v of comHistorico) for (const o of porVm.get(v.id)) {
    porOrg[slugDe[o] ?? o] = (porOrg[slugDe[o] ?? o] ?? 0) + 1
  }
  console.log("\nVínculos comerciais a criar, por empresa:")
  for (const [slug, n] of Object.entries(porOrg)) console.log(`  ${slug}: ${n}`)

  if (emMaisDeUma.length > 0) {
    console.log("\n⚠️  Estes têm histórico em mais de uma empresa — cada uma recebe uma CÓPIA")
    console.log("   dos dados fiscais. Confira se é isso mesmo antes da etapa 2:")
    console.table(emMaisDeUma.map((v) => ({ nome: v.nome, empresas: porVm.get(v.id).map((o) => slugDe[o] ?? o).join(", ") })))
  }

  if (semHistorico.length > 0) {
    const comDados = semHistorico.filter(temFiscal)
    console.log(`\nℹ️  ${semHistorico.length} sem histórico ficam apenas no perfil da rede.`)
    if (comDados.length > 0) {
      console.log(`   ${comDados.length} deles têm dados fiscais que NÃO serão migrados (não há empresa de destino):`)
      console.table(comDados.slice(0, 10).map((v) => ({ nome: v.nome, temCpf: !!v.cpfCnpj, temBanco: !!(v.dadosBancarios || v.chavePix) })))
    }
  }

  if (!apply) {
    console.log("\nRode com --apply para copiar. As colunas originais permanecem intactas.\n")
    process.exit(0)
  }

  let comerciais = 0
  let fiscais = 0
  for (const v of comHistorico) {
    for (const orgId of porVm.get(v.id)) {
      await c.query(
        `INSERT INTO videomaker_organizacao
           (id,"organizacaoId","videomakerId",status,"valorDiaria",observacoes,
            "emListaNegra","listaNegraMotivo","podeEditar","tipoContrato","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4::"StatusVideomaker",$5,$6,$7,$8,$9,$10,now(),now())
         ON CONFLICT ("organizacaoId","videomakerId") DO NOTHING`,
        [cuid(), orgId, v.id, v.status, v.valorDiaria, v.observacoes,
         v.emListaNegra, v.listaNegraMotivo, v.podeEditar, v.tipoContrato]
      )
      comerciais++

      if (temFiscal(v)) {
        await c.query(
          `INSERT INTO videomaker_dados_fiscais
             (id,"organizacaoId","videomakerId","cpfCnpj","razaoSocial","nomeFantasia",
              representante,endereco,"dadosBancarios","chavePix","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())
           ON CONFLICT ("organizacaoId","videomakerId") DO NOTHING`,
          [cuid(), orgId, v.id, v.cpfCnpj, v.razaoSocial, v.nomeFantasia,
           v.representante, v.endereco, cifrar(v.dadosBancarios), cifrar(v.chavePix)]
        )
        fiscais++
      }
    }
  }

  const { rows: conf } = await c.query(`
    SELECT (SELECT count(*)::int FROM videomaker_organizacao) AS comerciais,
           (SELECT count(*)::int FROM videomaker_dados_fiscais) AS fiscais,
           (SELECT count(*)::int FROM videomaker_dados_fiscais
             WHERE "dadosBancarios" IS NOT NULL AND "dadosBancarios" NOT LIKE '%.%.%') AS banco_nao_cifrado
  `)
  console.log(`\n✅ ${comerciais} vínculo(s) comercial(is) e ${fiscais} registro(s) fiscal(is) processados.`)
  console.log(`Conferência — na tabela: ${conf[0].comerciais} comerciais, ${conf[0].fiscais} fiscais`)
  console.log(`Dados bancários sem cifra (esperado 0): ${conf[0].banco_nao_cifrado}`)
  console.log(`\nAs colunas originais em "videomakers" continuam intactas — nada foi perdido.\n`)
} finally {
  await c.end()
}
