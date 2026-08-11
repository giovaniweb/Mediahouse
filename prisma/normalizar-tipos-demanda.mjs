/**
 * Unifica o vocabulário de "tipo" da demanda.
 *
 * A tela de Parâmetros gerenciava `tipos_video`, mas os formulários liam listas
 * fixas no código — e as duas não batiam. Das 22 variações gravadas, só 5
 * existiam como parâmetro. Este script:
 *
 *   1. semeia tipos_video (audiovisual) e tipos_criativo (Growth) em cada
 *      empresa, cobrindo tudo que já está em uso;
 *   2. funde os valores que são o mesmo tipo escrito de dois jeitos
 *      (institucional → video_institucional, ads → video_meta_ads);
 *   3. cadastra como parâmetro qualquer valor remanescente que esteja em uso,
 *      para que nenhuma demanda existente fique sem rótulo.
 *
 * Uso:
 *   node prisma/normalizar-tipos-demanda.mjs           # dry-run (padrão)
 *   node prisma/normalizar-tipos-demanda.mjs --apply
 */
import pg from "pg"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local", quiet: true })

const aplicar = process.argv.includes("--apply")

const VIDEO = [
  ["video_institucional", "Institucional"], ["reels", "Reels / Stories"],
  ["cobertura_evento", "Cobertura de Evento"], ["youtube", "YouTube"],
  ["apresentacao_equipamento", "Apresentação de Equipamento"], ["treinamento", "Treinamento"],
  ["depoimento", "Depoimento"], ["video_meta_ads", "Anúncio (Ads)"],
  ["vsl", "VSL (Video Sales Letter)"], ["tutorial", "Tutorial"],
  ["social_media", "Social Media"], ["aftermovie", "Aftermovie"],
  ["corte_simples", "Corte Simples"], ["outro", "Outro"],
]
const CRIATIVO = [
  ["post", "Post"], ["carrossel", "Carrossel"], ["story", "Story"],
  ["material_grafico", "Material Gráfico"], ["anuncio", "Anúncio"],
  ["email_marketing", "E-mail Marketing"], ["landing_page", "Landing Page"],
  ["landing_copy", "Copy de Landing"], ["apresentacao", "Apresentação"],
  ["atualizacao_materiais", "Atualização de Materiais"],
  ["administrativo", "Administrativo"], ["design", "Design (geral)"],
]
const DUPLICADOS = { institucional: "video_institucional", ads: "video_meta_ads" }

const client = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()
  const orgs = (await client.query(`SELECT id, slug FROM organizacoes`)).rows

  // 1 + 3 — semeia listas padrão e o que estiver em uso mas fora delas
  for (const org of orgs) {
    const emUso = (await client.query(
      `SELECT DISTINCT area, "tipoVideo" v FROM demandas WHERE "organizacaoId"=$1 AND "tipoVideo" IS NOT NULL`,
      [org.id]
    )).rows

    const sementes = [
      ...VIDEO.map(([valor, label], i) => ["tipos_video", valor, label, i]),
      ...CRIATIVO.map(([valor, label], i) => ["tipos_criativo", valor, label, i]),
    ]

    for (const [, v] of Object.entries(DUPLICADOS)) void v
    for (const linha of emUso) {
      const destino = DUPLICADOS[linha.v] ?? linha.v
      const grupo = linha.area === "design" ? "tipos_criativo" : "tipos_video"
      if (!sementes.some((s) => s[0] === grupo && s[1] === destino)) {
        sementes.push([grupo, destino, destino, 90])
      }
    }

    if (aplicar) {
      for (const [grupo, valor, label, ordem] of sementes) {
        await client.query(
          `INSERT INTO config_parametros (id,"organizacaoId",grupo,valor,label,ordem,ativo,"createdAt","updatedAt")
           VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,true,now(),now())
           ON CONFLICT ("organizacaoId",grupo,valor) DO NOTHING`,
          [org.id, grupo, valor, label, ordem]
        )
      }
    }
    console.log(`${org.slug}: ${sementes.length} parâmetro(s) garantido(s)`)
  }

  // 2 — funde os duplicados
  for (const [de, para] of Object.entries(DUPLICADOS)) {
    const alvo = await client.query(`SELECT count(*)::int n FROM demandas WHERE "tipoVideo"=$1`, [de])
    if (alvo.rows[0].n === 0) continue
    console.log(`fundir "${de}" → "${para}": ${alvo.rows[0].n} demanda(s)`)
    if (aplicar) {
      await client.query(`UPDATE demandas SET "tipoVideo"=$1 WHERE "tipoVideo"=$2`, [para, de])
      await client.query(
        `DELETE FROM config_parametros WHERE grupo IN ('tipos_video','tipos_criativo') AND valor=$1`, [de]
      )
    }
  }

  if (!aplicar) console.log("\nDry-run — nada foi gravado. Rode com --apply.")
  else {
    const orfaos = await client.query(`
      SELECT count(*)::int n FROM demandas d
       WHERE d."tipoVideo" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM config_parametros p
            WHERE p."organizacaoId"=d."organizacaoId"
              AND p.grupo IN ('tipos_video','tipos_criativo')
              AND p.valor=d."tipoVideo")`)
    console.log(`\n✅ Demandas com tipo sem parâmetro correspondente: ${orfaos.rows[0].n}`)
  }
}

main()
  .catch((e) => { console.error("Falhou:", e.message); process.exitCode = 1 })
  .finally(() => client.end())
