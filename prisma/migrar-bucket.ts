/**
 * Fase 4 (parte 1): move o acervo do bucket público para o privado.
 *
 * O bucket `uploads` é público — em 24/08/2026 um HEAD anônimo num PDF de
 * briefing devolveu 200. A Fase 1 parou o sangramento (upload novo já nasce
 * privado); esta parte leva o que já existe.
 *
 * O que ela NÃO faz: apagar do bucket antigo nem torná-lo privado. Os links que
 * já circulam por WhatsApp e e-mail continuam funcionando durante os 30 dias de
 * convivência combinados. O fechamento é um segundo passo, depois.
 *
 * A migração é dirigida pelo BANCO, não pela listagem do storage. Cada linha
 * sabe de quem é o arquivo — o caminho novo precisa da organização, e o antigo
 * não a carrega. Objeto no storage sem linha que o referencie é órfão: o script
 * conta e reporta, sem tocar.
 *
 * A cópia é server-side (Supabase → Supabase). Nenhum byte passa por aqui, o que
 * importa porque há 104 pastas de vídeo.
 *
 * Uso (mostra o que faria, sem escrever):
 *   npx dotenv -e .env.local -- ts-node -r tsconfig-paths/register prisma/migrar-bucket.ts
 *
 * Para aplicar:
 *   PERMITIR_BANCO_PRODUCAO=sim npm run migrar:bucket -- --aplicar
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"

config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })

const aplicar = process.argv.includes("--aplicar")
const BUCKET_ANTIGO = "uploads"
const BUCKET_NOVO = "midia"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Extrai o caminho de uma URL pública do bucket antigo. */
function caminhoAntigo(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/\/object\/public\/uploads\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Caminho novo, com a organização na frente. Preserva o nome original do
 * arquivo: renomear aqui só criaria uma segunda forma de referenciar o mesmo
 * objeto, e a diferença não serve para nada.
 */
function caminhoNovo(organizacaoId: string, antigo: string): string {
  return `org/${organizacaoId}/legado/${antigo}`
}

type Alvo = {
  rotulo: string
  id: string
  coluna: string
  url: string
  organizacaoId: string | null
  gravar: (novaUrl: string) => Promise<unknown>
}

/** Reúne, do banco, tudo que aponta para o bucket público — com o dono de cada um. */
async function levantarAlvos(): Promise<Alvo[]> {
  const alvos: Alvo[] = []
  const ehPublica = { contains: "/object/public/uploads/" }

  for (const a of await db.arquivo.findMany({
    where: { OR: [{ url: ehPublica }, { thumbnailUrl: ehPublica }] },
    select: { id: true, url: true, thumbnailUrl: true, demanda: { select: { organizacaoId: true } } },
  })) {
    const org = a.demanda?.organizacaoId ?? null
    if (caminhoAntigo(a.url))
      alvos.push({ rotulo: "arquivo.url", id: a.id, coluna: "url", url: a.url, organizacaoId: org,
        gravar: (u) => db.arquivo.update({ where: { id: a.id }, data: { url: u } }) })
    if (caminhoAntigo(a.thumbnailUrl))
      alvos.push({ rotulo: "arquivo.thumbnailUrl", id: a.id, coluna: "thumbnailUrl", url: a.thumbnailUrl!, organizacaoId: org,
        gravar: (u) => db.arquivo.update({ where: { id: a.id }, data: { thumbnailUrl: u } }) })
  }

  for (const d of await db.demanda.findMany({
    where: { thumbnailUrl: ehPublica },
    select: { id: true, thumbnailUrl: true, organizacaoId: true },
  })) {
    alvos.push({ rotulo: "demanda.thumbnailUrl", id: d.id, coluna: "thumbnailUrl", url: d.thumbnailUrl!, organizacaoId: d.organizacaoId,
      gravar: (u) => db.demanda.update({ where: { id: d.id }, data: { thumbnailUrl: u } }) })
  }

  for (const ap of await db.aprovacaoVideo.findMany({
    where: { urlVideo: ehPublica },
    select: { id: true, urlVideo: true, demanda: { select: { organizacaoId: true } } },
  })) {
    alvos.push({ rotulo: "aprovacaoVideo.urlVideo", id: ap.id, coluna: "urlVideo", url: ap.urlVideo, organizacaoId: ap.demanda?.organizacaoId ?? null,
      gravar: (u) => db.aprovacaoVideo.update({ where: { id: ap.id }, data: { urlVideo: u } }) })
  }

  for (const up of await db.eventoCoberturaUpload.findMany({
    where: { OR: [{ url: ehPublica }, { thumbnailUrl: ehPublica }] },
    select: { id: true, url: true, thumbnailUrl: true, cobertura: { select: { organizacaoId: true } } },
  })) {
    const org = up.cobertura?.organizacaoId ?? null
    if (caminhoAntigo(up.url))
      alvos.push({ rotulo: "coberturaUpload.url", id: up.id, coluna: "url", url: up.url, organizacaoId: org,
        gravar: (u) => db.eventoCoberturaUpload.update({ where: { id: up.id }, data: { url: u } }) })
    if (caminhoAntigo(up.thumbnailUrl))
      alvos.push({ rotulo: "coberturaUpload.thumbnailUrl", id: up.id, coluna: "thumbnailUrl", url: up.thumbnailUrl!, organizacaoId: org,
        gravar: (u) => db.eventoCoberturaUpload.update({ where: { id: up.id }, data: { thumbnailUrl: u } }) })
  }

  // Depoimento não tem organização nenhuma no schema — nem coluna, nem relação.
  // É vitrine pública global. Fica de fora e é reportado: inventar um dono aqui
  // seria decidir por conta própria de quem é o arquivo.
  return alvos
}

async function main() {
  console.log(aplicar ? "\n▶ APLICANDO\n" : "\n▶ Simulação (nada será escrito — use --aplicar)\n")

  const alvos = await levantarAlvos()
  const semDono = alvos.filter((a) => !a.organizacaoId)
  const migrar = alvos.filter((a) => a.organizacaoId)

  const porRotulo: Record<string, number> = {}
  for (const a of migrar) porRotulo[a.rotulo] = (porRotulo[a.rotulo] ?? 0) + 1
  console.log("Referências a migrar, por origem:")
  for (const [k, v] of Object.entries(porRotulo).sort()) console.log(`  ${k.padEnd(30)} ${v}`)
  console.log(`  ${"TOTAL".padEnd(30)} ${migrar.length}`)
  if (semDono.length) console.log(`\n⚠ ${semDono.length} sem organização — ficam no bucket antigo:`)
  for (const a of semDono.slice(0, 10)) console.log(`   ${a.rotulo} ${a.id}`)

  const dep = await db.depoimento.count({ where: { videoUrl: { contains: "/object/public/uploads/" } } })
  if (dep) console.log(`\n⚠ ${dep} depoimento(s): a tabela não tem organização no schema. Ficam públicos — decidir depois de quem são.`)

  if (!aplicar) {
    console.log("\n(simulação — nada foi copiado nem gravado)\n")
    await db.$disconnect(); return
  }

  let copiados = 0, jaEstavam = 0, falhas = 0
  const erros: string[] = []

  for (const [i, a] of migrar.entries()) {
    const antigo = caminhoAntigo(a.url)!
    const novo = caminhoNovo(a.organizacaoId!, antigo)

    // Cópia server-side. `already exists` significa que uma execução anterior já
    // fez esta — o script é retomável de propósito, são 249 operações de rede.
    const { error } = await sb.storage.from(BUCKET_ANTIGO).copy(antigo, novo, { destinationBucket: BUCKET_NOVO })
    if (error) {
      if (error.message.toLowerCase().includes("exists")) jaEstavam++
      else {
        falhas++
        erros.push(`${a.rotulo} ${a.id}: ${error.message}`)
        continue // não reescreve o banco se o arquivo não chegou lá
      }
    } else copiados++

    await a.gravar(`/api/midia/${novo}`)
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${migrar.length}...`)
  }

  console.log(`\nCopiados: ${copiados} · já existiam: ${jaEstavam} · falhas: ${falhas}`)
  if (erros.length) {
    console.log("\n❌ falhas (o banco NÃO foi alterado nesses):")
    erros.slice(0, 20).forEach((e) => console.log(`   ${e}`))
  }

  const restantes = await contarPublicas()
  console.log(`\nReferências públicas restantes no banco: ${restantes}`)
  console.log("O bucket antigo segue PÚBLICO e intacto — 30 dias de convivência.\n")
  await db.$disconnect()
}

async function contarPublicas(): Promise<number> {
  const p = { contains: "/object/public/uploads/" }
  const [a1, a2, d, ap, u1] = await Promise.all([
    db.arquivo.count({ where: { url: p } }),
    db.arquivo.count({ where: { thumbnailUrl: p } }),
    db.demanda.count({ where: { thumbnailUrl: p } }),
    db.aprovacaoVideo.count({ where: { urlVideo: p } }),
    db.eventoCoberturaUpload.count({ where: { url: p } }),
  ])
  return a1 + a2 + d + ap + u1
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
