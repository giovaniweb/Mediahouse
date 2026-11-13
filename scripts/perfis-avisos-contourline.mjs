#!/usr/bin/env node
// Aplica os perfis de aviso combinados com o Giovani (12/11/2026) às pessoas
// da Contourline. ESCREVE EM PRODUÇÃO quando roda com --aplicar: só com o sim
// dele, pela coordenação. Precisa da migration 20261127000000 aplicada antes.
//
//   node scripts/perfis-avisos-contourline.mjs --banco "<url>"            # só mostra o plano
//   node scripts/perfis-avisos-contourline.mjs --banco "<url>" --aplicar  # grava, numa transação
//   ... --incluir-demais   # também aplica a proposta para as outras pessoas
//
// A URL vem só pelo argumento: o script não lê .env (o .env.local aponta para
// produção, e um script que escreve não pode cair lá por acaso).
//
// Desfazer: apagar as linhas das pessoas (todas voltam a receber como antes):
//   DELETE FROM preferencias_aviso WHERE "organizacaoId" = '<id da Contourline>';
//
// Os perfis abaixo são cópia de src/lib/avisos-perfis.ts (este arquivo roda
// sem TypeScript). tests/unit/avisos-perfis.spec.ts garante que são iguais.
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"

const CATEGORIAS = ["pedidos", "andamento", "comentarios", "gravacoes", "social", "parabens", "eventos", "prazos", "resumos", "sistema"]
const ligado = (recorte, setor = null) => ({ sino: true, email: true, whatsapp: true, recorte, setor })
const desligado = () => ({ sino: false, email: false, whatsapp: false, recorte: "tudo", setor: null })

export function estadoDoPerfil(perfil, setor) {
  return CATEGORIAS.map((categoria) => ({ categoria, ...porCategoria(perfil, categoria, setor ?? null) }))
}
function porCategoria(perfil, c, setor) {
  switch (perfil) {
    case "so_resumo": return c === "resumos" ? ligado("tudo") : desligado()
    case "setor":
      if (!setor) throw new Error("O perfil \"Tudo do meu setor\" precisa do setor")
      if (c === "eventos") return desligado()
      if (c === "resumos" || c === "sistema" || c === "parabens") return ligado("tudo")
      return ligado("setor", setor)
    case "pedi":
      if (c === "resumos" || c === "parabens") return ligado("tudo")
      if (c === "eventos" || c === "sistema") return desligado()
      return ligado("pedi")
    case "videomaker":
    case "padrao": return ligado("tudo")
    default: throw new Error(`Perfil desconhecido: ${perfil}`)
  }
}

// Combinado com o Giovani. O nome é comparado sem acento e sem caixa, e precisa
// achar UMA pessoa só; achar zero ou duas para tudo antes de gravar.
export const COMBINADO = [
  { nome: "giovani", perfil: "setor", setor: "audiovisual" },
  { nome: "thalison samuel", perfil: "setor", setor: "growth" },
  { nome: "helaine", perfil: "pedi" },
  { nome: "fernanda normando", perfil: "pedi" },
  { nome: "caroline tinos", perfil: "pedi" },
  // Débora opera as Gravações Externas (Giovani, 12/11): tudo de gravações,
  // videomaker e notas, inclusive gravação nova; o resto, só o que ela pediu.
  { nome: "debora", perfil: "pedi", manter: ["gravacoes"] },
  { nome: "luisa ayusso", perfil: "pedi" },
]

// Proposta para os demais (só com --incluir-demais, depois do sim do Giovani).
// `manter`: categorias que ficam como hoje dentro do perfil.
export const PROPOSTA_DEMAIS = [
  ...["agneta sa", "alice coelho", "brandina vidal", "caroline lorrany pereira", "cecilia alves", "daniele elenice ferreira rodrigues",
    "fabiano rosestolato", "fabricia carvalho", "francielle kenia marcelino dos santo", "franciely ferreira", "greice motter",
    "lucas pereira de souza", "paulo cesare borges", "raisa michetti", "renata taylor de brito barros", "thais leite",
    "thaynara santos", "vanessa melo"].map((nome) => ({ nome, perfil: "pedi" })),
  { nome: "paulo cesare", exato: true, perfil: "pedi" },
  { nome: "fabricia", exato: true, perfil: "pedi" },
  { nome: "ramon silva", perfil: "pedi" },
  { nome: "arthur cotta", perfil: "pedi" },
  { nome: "luana.almeida@contourline.com.br", perfil: "pedi" },
  { nome: "mariana normando", perfil: "pedi", manter: ["eventos"] },
  { nome: "thaynara cristina figueredo dos santos", perfil: "pedi", manter: ["eventos"] },
]

const normal = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()

function linhas(item) {
  const manter = new Set(item.manter ?? [])
  return estadoDoPerfil(item.perfil, item.setor).map((e) => (manter.has(e.categoria) ? { categoria: e.categoria, ...ligado("tudo") } : e))
}

async function principal() {
  const args = process.argv.slice(2)
  const url = args[args.indexOf("--banco") + 1]
  if (!args.includes("--banco") || !url || url.startsWith("--")) throw new Error("Passe a URL do banco com --banco \"<url>\".")
  const aplicar = args.includes("--aplicar"), demais = args.includes("--incluir-demais")
  const empresa = args.includes("--empresa") ? args[args.indexOf("--empresa") + 1] : "contourline"
  const { default: pg } = await import("pg")
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    const { rows: [org] } = await c.query(`SELECT id, nome FROM organizacoes WHERE slug = $1`, [empresa])
    if (!org) throw new Error(`Empresa "${empresa}" não encontrada.`)
    const { rows: gente } = await c.query(
      `SELECT u.id, u.nome FROM usuario_organizacao uo JOIN usuarios u ON u.id = uo."usuarioId"
        WHERE uo."organizacaoId" = $1 AND u.status = 'ativo'`, [org.id])
    const lista = [...COMBINADO, ...(demais ? PROPOSTA_DEMAIS : [])]
    const plano = []
    const problemas = []
    for (const item of lista) {
      const achadas = gente.filter((p) => item.exato ? normal(p.nome) === item.nome : normal(p.nome).startsWith(item.nome))
      // "giovani" acha só o Giovani; "paulo cesare" exato não pega o "Paulo Cesare Borges".
      if (achadas.length !== 1) { problemas.push(`${item.nome}: ${achadas.length} pessoa(s) — ${achadas.map((p) => p.nome).join(", ") || "nenhuma"}`); continue }
      plano.push({ pessoa: achadas[0], item })
    }
    console.log(`Empresa: ${org.nome}`)
    for (const { pessoa, item } of plano) {
      console.log(`  ${pessoa.nome.trim().padEnd(40)} ${item.perfil}${item.setor ? ` (${item.setor})` : ""}${item.manter ? ` · mantém ${item.manter.join(", ")}` : ""}`)
    }
    if (problemas.length) {
      console.error(`\n❌ Nome que não achou exatamente uma pessoa — nada foi gravado:\n  ${problemas.join("\n  ")}`)
      process.exitCode = 1
      return
    }
    if (!aplicar) { console.log("\nSó o plano. Para gravar: --aplicar"); return }
    await c.query("BEGIN")
    for (const { pessoa, item } of plano) {
      for (const e of linhas(item)) {
        const padrao = e.sino && e.email && e.whatsapp && e.recorte === "tudo"
        if (padrao) {
          await c.query(`DELETE FROM preferencias_aviso WHERE "organizacaoId"=$1 AND "usuarioId"=$2 AND categoria=$3 AND NOT travada`, [org.id, pessoa.id, e.categoria])
          continue
        }
        await c.query(
          `INSERT INTO preferencias_aviso (id, "organizacaoId", "usuarioId", categoria, sino, email, whatsapp, recorte, setor, "atualizadoPorId", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,now())
           ON CONFLICT ("organizacaoId", "usuarioId", categoria) DO UPDATE
             SET sino=EXCLUDED.sino, email=EXCLUDED.email, whatsapp=EXCLUDED.whatsapp, recorte=EXCLUDED.recorte, setor=EXCLUDED.setor,
                 "atualizadoPorId"=NULL, "updatedAt"=now()`,
          [randomUUID(), org.id, pessoa.id, e.categoria, e.sino, e.email, e.whatsapp, e.recorte, e.setor])
      }
    }
    await c.query("COMMIT")
    console.log(`\n✅ Gravado para ${plano.length} pessoa(s).`)
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined)
    throw e
  } finally {
    await c.end()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  principal().catch((e) => { console.error(`❌ ${e.message}`); process.exit(1) })
}
