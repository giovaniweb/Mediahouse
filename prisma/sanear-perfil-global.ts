/**
 * Saneamento do perfil global de Videomaker — Fase A da migração para SaaS.
 *
 * Por que existe: `videomakers` não tem `organizacaoId` — é a tabela global que
 * vai virar o marketplace, legível por qualquer organização sob RLS. Só que ela
 * ainda carrega dado que é de UMA empresa: a diária negociada, a observação
 * interna, a lista negra e os dados fiscais. Abrir a leitura sem esvaziar essas
 * colunas publica o preço que cada cliente negociou e o CPF do profissional
 * para a plataforma inteira.
 *
 * A R4.1 já moveu o grosso (53 das 56 diárias, 23 dos 26 fiscais). Este script
 * fecha o resíduo: os perfis SEM vínculo nenhum (cujo dado privado não tem para
 * onde ir) e as divergências entre o perfil global e o vínculo.
 *
 * O que ele NÃO faz: apagar coluna. O DROP é migration separada, e só roda
 * depois que a conferência daqui passar — ver `verificar()`.
 *
 * Regra da divergência: o VÍNCULO vence. É o que a aplicação lê desde a R4.1,
 * então é o valor que as pessoas veem na tela; o do perfil global é resquício.
 * O valor descartado é impresso antes de sumir.
 *
 * Uso (mostra o que faria, sem escrever):
 *   npx dotenv -e .env.local -- ts-node -r tsconfig-paths/register prisma/sanear-perfil-global.ts
 *
 * Para aplicar de verdade em produção:
 *   PERMITIR_BANCO_PRODUCAO=sim npm run sanear:perfil-global -- --aplicar
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { config } from "dotenv"
import { encryptSecret } from "../src/lib/secret-crypto"

config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })

const aplicar = process.argv.includes("--aplicar")

/**
 * Destino de último recurso para perfil sem nenhuma evidência de origem.
 * Aprovado no plano: os órfãos vão para a Contourline, que é a única organização
 * em operação real (`empresa-teste` é ambiente de teste). Toda atribuição por
 * este caminho é impressa nominalmente — nada entra em silêncio.
 */
const ORG_PADRAO = "contourline"

/** Campos comerciais que pertencem ao vínculo empresa↔profissional. */
const CAMPOS_COMERCIAIS = ["valorDiaria", "observacoes", "emListaNegra", "listaNegraMotivo"] as const
/** Campos fiscais. `chavePix` e `dadosBancarios` vão cifrados — mesmo tratamento da rota de edição. */
const CAMPOS_FISCAIS = ["cpfCnpj", "razaoSocial", "nomeFantasia", "representante", "endereco"] as const
const CAMPOS_FISCAIS_CIFRADOS = ["chavePix", "dadosBancarios"] as const

function prisma() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
}

/** Só considera "preenchido" o que tem conteúdo — string vazia não é dado. */
function temValor(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === "string") return v.trim() !== ""
  if (typeof v === "boolean") return v === true
  return true
}

async function main() {
  const db = prisma()

  console.log(aplicar ? "\n▶ APLICANDO\n" : "\n▶ Simulação (nada será escrito — use --aplicar)\n")

  const orgs = await db.organizacao.findMany({ select: { id: true, slug: true } })
  const porSlug = new Map(orgs.map((o) => [o.slug, o.id]))
  const slugDe = new Map(orgs.map((o) => [o.id, o.slug]))
  const orgPadrao = porSlug.get(ORG_PADRAO) ?? null
  if (!orgPadrao) console.log(`⚠ Organização padrão "${ORG_PADRAO}" não existe — perfis sem evidência ficarão pendentes.\n`)

  const videomakers = await db.videomaker.findMany({
    include: {
      vinculos: true,
      demandas: { select: { organizacaoId: true }, take: 50 },
      usuario: { select: { organizacoes: { select: { organizacaoId: true } } } },
    },
  })

  // Perfil SEM vínculo nenhum é um problema à parte, e mais grave que dado preso:
  // sob a Política B da RLS, `interno` só é visível para quem tem vínculo — um
  // interno sem vínculo some da tela de TODAS as organizações no dia em que a
  // RLS subir. Achado ao rodar o saneamento: "Cristiano Drummond", cadastrado
  // como interno e sem vínculo, sumiria da Contourline sem ninguém entender por quê.
  const orfaos = videomakers.filter((vm) => vm.vinculos.length === 0)
  if (orfaos.length) {
    console.log(`── ${orfaos.length} perfil(is) sem vínculo (sumiriam sob RLS se 'interno') ──`)
    for (const vm of orfaos) {
      const risco = vm.tipoContrato === "interno" ? " ⚠ INTERNO — invisível sob RLS" : ""
      console.log(`   ${vm.nome} [${vm.tipoContrato}]${risco}`)
    }
    console.log("")
  }

  let vinculosCriados = 0
  let comerciaisGravados = 0
  let fiscaisGravados = 0
  let divergencias = 0
  const semDestino: string[] = []

  for (const vm of videomakers) {
    // O que ainda está preso no perfil global?
    const comercial = Object.fromEntries(
      CAMPOS_COMERCIAIS.filter((c) => temValor((vm as Record<string, unknown>)[c])).map((c) => [
        c,
        (vm as Record<string, unknown>)[c],
      ])
    )
    const fiscal = Object.fromEntries(
      [...CAMPOS_FISCAIS, ...CAMPOS_FISCAIS_CIFRADOS]
        .filter((c) => temValor((vm as Record<string, unknown>)[c]))
        .map((c) => [c, (vm as Record<string, unknown>)[c]])
    )
    const temDadoPreso = Object.keys(comercial).length > 0 || Object.keys(fiscal).length > 0
    // Sem dado preso E com vínculo = nada a fazer. Sem vínculo entra mesmo sem
    // dado preso, porque o vínculo em si é o que mantém o perfil visível sob RLS.
    if (!temDadoPreso && vm.vinculos.length > 0) continue

    // Para onde vai? Em ordem de força da evidência:
    //   1. vínculos que já existem
    //   2. a organização do Usuario ligado ao perfil (é o login da pessoa)
    //   3. a organização das demandas que ele executou
    //   4. ORG_PADRAO — só quando não há contradição, e sempre impresso
    let destinos = vm.vinculos.map((v) => v.organizacaoId)
    let origem = "vínculo existente"
    if (destinos.length === 0) {
      const doUsuario = [...new Set((vm.usuario?.organizacoes ?? []).map((o) => o.organizacaoId))]
      const dasDemandas = [...new Set(vm.demandas.map((d) => d.organizacaoId).filter(Boolean))] as string[]
      if (doUsuario.length === 1) {
        destinos = doUsuario
        origem = "organização do login"
      } else if (dasDemandas.length === 1) {
        destinos = dasDemandas
        origem = "organização das demandas"
      } else if (doUsuario.length > 1 || dasDemandas.length > 1) {
        semDestino.push(`${vm.nome} (evidência aponta para mais de uma organização — ambíguo)`)
        continue
      } else if (orgPadrao) {
        destinos = [orgPadrao]
        origem = `padrão (${ORG_PADRAO}) — sem nenhuma evidência própria`
      } else {
        semDestino.push(`${vm.nome} (sem vínculo, sem login e sem demanda)`)
        continue
      }
      console.log(`  ↳ ${vm.nome}: sem vínculo → ${slugDe.get(destinos[0])} · via ${origem}`)
    }

    // Vários vínculos: NUNCA replicar o valor global em todos — seria vazar o
    // preço de uma empresa para a outra. Só preenche o que estiver vazio.
    const replicando = destinos.length > 1

    for (const organizacaoId of destinos) {
      const slug = slugDe.get(organizacaoId) ?? organizacaoId
      const vinculo = vm.vinculos.find((v) => v.organizacaoId === organizacaoId)

      // ── comercial ──
      const aGravar: Record<string, unknown> = {}
      for (const [campo, valor] of Object.entries(comercial)) {
        const atual = vinculo ? (vinculo as unknown as Record<string, unknown>)[campo] : undefined
        if (temValor(atual)) {
          if (atual !== valor) {
            divergencias++
            console.log(
              `  ⚠ ${vm.nome} [${slug}] ${campo}: vínculo="${atual}" vence; descartando do perfil global="${valor}"`
            )
          }
          continue // vínculo já tem: vence
        }
        if (replicando) {
          console.log(`  ⚠ ${vm.nome} [${slug}] ${campo}: vínculo vazio e o profissional atende ${destinos.length} empresas — preenchendo, confira depois`)
        }
        aGravar[campo] = valor
      }

      if (Object.keys(aGravar).length > 0 || !vinculo) {
        console.log(
          `  ${vinculo ? "atualiza" : "CRIA"} vínculo ${vm.nome} [${slug}]` +
            (Object.keys(aGravar).length ? ` ← ${Object.keys(aGravar).join(", ")}` : " (sem dado comercial)")
        )
        if (aplicar) {
          await db.videomakerOrganizacao.upsert({
            where: { organizacaoId_videomakerId: { organizacaoId, videomakerId: vm.id } },
            create: { organizacaoId, videomakerId: vm.id, tipoContrato: vm.tipoContrato, ...aGravar },
            update: aGravar,
          })
        }
        if (!vinculo) vinculosCriados++
        if (Object.keys(aGravar).length) comerciaisGravados++
      }

      // ── fiscal ──
      if (Object.keys(fiscal).length > 0) {
        const jaTem = await db.videomakerDadosFiscais.findUnique({
          where: { organizacaoId_videomakerId: { organizacaoId, videomakerId: vm.id } },
        })
        const fiscalGravar: Record<string, unknown> = {}
        for (const [campo, valor] of Object.entries(fiscal)) {
          if (jaTem && temValor((jaTem as unknown as Record<string, unknown>)[campo])) continue
          fiscalGravar[campo] = (CAMPOS_FISCAIS_CIFRADOS as readonly string[]).includes(campo)
            ? encryptSecret(String(valor))
            : valor
        }
        if (Object.keys(fiscalGravar).length > 0) {
          console.log(`  fiscal  ${vm.nome} [${slug}] ← ${Object.keys(fiscalGravar).join(", ")}`)
          if (aplicar) {
            await db.videomakerDadosFiscais.upsert({
              where: { organizacaoId_videomakerId: { organizacaoId, videomakerId: vm.id } },
              create: { organizacaoId, videomakerId: vm.id, ...fiscalGravar },
              update: fiscalGravar,
            })
          }
          fiscaisGravados++
        }
      }
    }
  }

  console.log(
    `\nResumo: ${vinculosCriados} vínculo(s) criado(s), ${comerciaisGravados} gravação(ões) comercial(is), ` +
      `${fiscaisGravados} fiscal(is), ${divergencias} divergência(s) resolvida(s) a favor do vínculo.`
  )
  if (semDestino.length) {
    console.log(`\n❌ ${semDestino.length} perfil(is) com dado privado e SEM destino — resolver à mão antes do DROP:`)
    for (const s of semDestino) console.log(`   - ${s}`)
  }

  await verificar(db, porSlug)
  await db.$disconnect()
}

/**
 * Porta de entrada do DROP: prova que nenhum dado privado do perfil global ficou
 * sem equivalente por empresa. Enquanto isto não zerar, o DROP não pode rodar.
 */
async function verificar(db: PrismaClient, _porSlug: Map<string, string>) {
  console.log("\n── Conferência (é isto que libera o DROP) ──")
  const videomakers = await db.videomaker.findMany({ include: { vinculos: true } })
  const pendentes: string[] = []

  // Interno sem vínculo é invisível sob a Política B — some da tela de todo mundo.
  for (const vm of videomakers.filter((v) => v.vinculos.length === 0 && v.tipoContrato === "interno")) {
    pendentes.push(`${vm.nome}: INTERNO sem vínculo — ficaria invisível para todas as organizações sob RLS`)
  }

  for (const vm of videomakers) {
    const campos = [...CAMPOS_COMERCIAIS, ...CAMPOS_FISCAIS, ...CAMPOS_FISCAIS_CIFRADOS]
    const presos = campos.filter((c) => temValor((vm as unknown as Record<string, unknown>)[c]))
    if (presos.length === 0) continue

    if (vm.vinculos.length === 0) {
      pendentes.push(`${vm.nome}: ${presos.join(", ")} — SEM VÍNCULO`)
      continue
    }
    for (const v of vm.vinculos) {
      const fiscais = await db.videomakerDadosFiscais.findUnique({
        where: { organizacaoId_videomakerId: { organizacaoId: v.organizacaoId, videomakerId: vm.id } },
      })
      const semDestino = presos.filter((c) => {
        if ((CAMPOS_COMERCIAIS as readonly string[]).includes(c)) {
          return !temValor((v as unknown as Record<string, unknown>)[c])
        }
        return !fiscais || !temValor((fiscais as unknown as Record<string, unknown>)[c])
      })
      if (semDestino.length) pendentes.push(`${vm.nome}: ${semDestino.join(", ")}`)
    }
  }

  if (pendentes.length === 0) {
    console.log("✅ Nenhum dado privado sem destino. O DROP pode rodar.")
  } else {
    console.log(`❌ ${pendentes.length} pendência(s) — NÃO rodar o DROP:`)
    for (const p of pendentes) console.log(`   - ${p}`)
  }
  console.log("")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
