/**
 * Backfill do vínculo e dos fiscais de Editor e Designer — Fase B.
 *
 * `editores` e `designers` ainda são tabelas DA EMPRESA: têm `organizacaoId` e
 * guardam salário, CPF, PIX e observação interna na mesma linha do perfil. Para
 * virarem perfil de REDE (legível por qualquer empresa sob RLS), o que é de uma
 * empresa precisa sair dali.
 *
 * Este script copia. Não apaga nada: `organizacaoId` e as colunas privadas
 * continuam no lugar e são a origem. O DROP é o último passo da Fase B, com
 * trava própria, depois que o auditor marcar zero.
 *
 * A origem do vínculo é o próprio `organizacaoId` da linha — diferente do
 * videomaker, onde não havia coluna e foi preciso inferir por login e demanda.
 * Aqui a resposta é explícita, então não há caso ambíguo por natureza.
 *
 * Uso (mostra o que faria, sem escrever):
 *   npx dotenv -e .env.local -- ts-node -r tsconfig-paths/register prisma/migrar-editor-designer.ts
 *
 * Para aplicar de verdade:
 *   PERMITIR_BANCO_PRODUCAO=sim npm run migrar:editor-designer -- --aplicar
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { config } from "dotenv"
import { encryptSecret } from "../src/lib/secret-crypto"

config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })

const aplicar = process.argv.includes("--aplicar")

/** Só é "preenchido" o que tem conteúdo. String vazia é ausência. */
function temValor(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === "string") return v.trim() !== ""
  if (typeof v === "boolean") return v === true
  return true
}

/** Cliente mínimo que a migração usa — o PrismaClient e o `tx` das transações
 *  satisfazem os dois, o que deixa o teste rodar ESTE código, não uma imitação. */
type Cliente = Pick<PrismaClient, "organizacao" | "editor" | "designer" | "editorOrganizacao"
  | "editorDadosFiscais" | "designerOrganizacao" | "designerDadosFiscais">

export async function migrar(db: Cliente, aplicar: boolean) {

  const orgs = await db.organizacao.findMany({ select: { id: true, slug: true } })
  const slugDe = new Map(orgs.map((o) => [o.id, o.slug]))
  const semOrg: string[] = []
  let vinculos = 0, fiscais = 0

  // ── Editores ───────────────────────────────────────────────────────────────
  for (const ed of await db.editor.findMany()) {
    if (!ed.organizacaoId) { semOrg.push(`editor ${ed.nome}`); continue }
    const org = ed.organizacaoId
    const slug = slugDe.get(org) ?? org

    const comercial = {
      salario: ed.salario ?? undefined,
      cargaLimite: ed.cargaLimite,
      observacoes: ed.observacoes ?? undefined,
      emListaNegra: ed.emListaNegra,
      listaNegraMotivo: ed.listaNegraMotivo ?? undefined,
      status: ed.status,
      tipoContrato: ed.tipoContrato,
    }
    const campos = Object.entries(comercial).filter(([, v]) => temValor(v)).map(([k]) => k)
    console.log(`  vínculo  ${ed.nome} [${slug}] ← ${campos.join(", ") || "(só o vínculo)"}`)
    if (aplicar) {
      await db.editorOrganizacao.upsert({
        where: { organizacaoId_editorId: { organizacaoId: org, editorId: ed.id } },
        create: { organizacaoId: org, editorId: ed.id, ...comercial },
        update: comercial,
      })
    }
    vinculos++

    const fiscal: Record<string, unknown> = {}
    if (temValor(ed.cpfCnpj)) fiscal.cpfCnpj = ed.cpfCnpj
    if (temValor(ed.razaoSocial)) fiscal.razaoSocial = ed.razaoSocial
    if (temValor(ed.nomeFantasia)) fiscal.nomeFantasia = ed.nomeFantasia
    if (temValor(ed.representante)) fiscal.representante = ed.representante
    if (temValor(ed.endereco)) fiscal.endereco = ed.endereco
    // chavePix e dadosBancarios vão CIFRADOS — mesmo tratamento do videomaker.
    if (temValor(ed.chavePix)) fiscal.chavePix = encryptSecret(String(ed.chavePix))
    if (temValor(ed.dadosBancarios)) fiscal.dadosBancarios = encryptSecret(String(ed.dadosBancarios))

    if (Object.keys(fiscal).length) {
      console.log(`  fiscal   ${ed.nome} [${slug}] ← ${Object.keys(fiscal).join(", ")}`)
      if (aplicar) {
        await db.editorDadosFiscais.upsert({
          where: { organizacaoId_editorId: { organizacaoId: org, editorId: ed.id } },
          create: { organizacaoId: org, editorId: ed.id, ...fiscal },
          update: fiscal,
        })
      }
      fiscais++
    }
  }

  // ── Designers ──────────────────────────────────────────────────────────────
  for (const dz of await db.designer.findMany()) {
    if (!dz.organizacaoId) { semOrg.push(`designer ${dz.nome}`); continue }
    const org = dz.organizacaoId
    const slug = slugDe.get(org) ?? org

    const comercial = {
      salario: dz.salario ?? undefined,
      valorDiaria: dz.valorDiaria ?? undefined,
      observacoes: dz.observacoes ?? undefined,
      emListaNegra: dz.emListaNegra,
      listaNegraMotivo: dz.listaNegraMotivo ?? undefined,
      status: dz.status,
      tipoContrato: dz.tipoContrato,
    }
    console.log(`  vínculo  ${dz.nome} [${slug}] (designer)`)
    if (aplicar) {
      await db.designerOrganizacao.upsert({
        where: { organizacaoId_designerId: { organizacaoId: org, designerId: dz.id } },
        create: { organizacaoId: org, designerId: dz.id, ...comercial },
        update: comercial,
      })
    }
    vinculos++

    const fiscal: Record<string, unknown> = {}
    if (temValor(dz.cpfCnpj)) fiscal.cpfCnpj = dz.cpfCnpj
    if (temValor(dz.razaoSocial)) fiscal.razaoSocial = dz.razaoSocial
    if (temValor(dz.nomeFantasia)) fiscal.nomeFantasia = dz.nomeFantasia
    if (temValor(dz.representante)) fiscal.representante = dz.representante
    if (temValor(dz.endereco)) fiscal.endereco = dz.endereco
    if (temValor(dz.chavePix)) fiscal.chavePix = encryptSecret(String(dz.chavePix))
    if (temValor(dz.dadosBancarios)) fiscal.dadosBancarios = encryptSecret(String(dz.dadosBancarios))
    if (Object.keys(fiscal).length) {
      console.log(`  fiscal   ${dz.nome} [${slug}] ← ${Object.keys(fiscal).join(", ")}`)
      if (aplicar) {
        await db.designerDadosFiscais.upsert({
          where: { organizacaoId_designerId: { organizacaoId: org, designerId: dz.id } },
          create: { organizacaoId: org, designerId: dz.id, ...fiscal },
          update: fiscal,
        })
      }
      fiscais++
    }
  }

  console.log(`\nResumo: ${vinculos} vínculo(s), ${fiscais} registro(s) fiscal(is).`)
  if (semOrg.length) {
    console.log(`\n❌ ${semOrg.length} perfil(is) sem organizacaoId — resolver à mão:`)
    semOrg.forEach((s) => console.log(`   - ${s}`))
  }

  await verificar(db)
}

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  console.log(aplicar ? "\n▶ APLICANDO\n" : "\n▶ Simulação (nada será escrito — use --aplicar)\n")
  await migrar(db, aplicar)
  await db.$disconnect()
}

/** Porta de entrada do DROP: nenhum dado privado sem equivalente por empresa. */
export async function verificar(db: Cliente) {
  console.log("\n── Conferência (é isto que libera o DROP, no último passo) ──")
  const pendentes: string[] = []

  for (const ed of await db.editor.findMany({ include: { vinculos: true, fiscais: true } })) {
    if (ed.vinculos.length === 0) { pendentes.push(`${ed.nome}: SEM VÍNCULO`); continue }
    const v = ed.vinculos[0], f = ed.fiscais[0]
    if (temValor(ed.salario) && !temValor(v.salario)) pendentes.push(`${ed.nome}: salario`)
    if (temValor(ed.observacoes) && !temValor(v.observacoes)) pendentes.push(`${ed.nome}: observacoes`)
    if (ed.cargaLimite !== v.cargaLimite) pendentes.push(`${ed.nome}: cargaLimite (${ed.cargaLimite} ≠ ${v.cargaLimite})`)
    for (const campo of ["cpfCnpj", "razaoSocial", "nomeFantasia", "representante", "endereco", "chavePix", "dadosBancarios"] as const) {
      const origem = (ed as unknown as Record<string, unknown>)[campo]
      if (temValor(origem) && !temValor((f as unknown as Record<string, unknown> | undefined)?.[campo])) {
        pendentes.push(`${ed.nome}: ${campo}`)
      }
    }
  }
  for (const dz of await db.designer.findMany({ include: { vinculos: true } })) {
    if (dz.vinculos.length === 0) pendentes.push(`${dz.nome} (designer): SEM VÍNCULO`)
  }

  if (pendentes.length === 0) console.log("✅ Todo dado privado tem equivalente por empresa.")
  else {
    console.log(`❌ ${pendentes.length} pendência(s):`)
    pendentes.forEach((p) => console.log(`   - ${p}`))
  }
  console.log("")
}

// Só executa quando chamado direto. Sem esta guarda, importar `migrar` daqui
// dispara o script inteiro contra o banco — foi o que aconteceu ao escrever o
// ensaio transacional: o import rodou um main() paralelo, fora da transação.
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
