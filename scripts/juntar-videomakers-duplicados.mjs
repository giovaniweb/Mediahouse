#!/usr/bin/env node
// Junta videomakers duplicados: o mesmo telefone em mais de um cadastro da
// mesma empresa (16/11/2026). A regra está em scripts/lib/juntar-videomakers.mjs.
//
// Por padrão SÓ LÊ: lista os grupos por telefone em cada empresa, com o
// histórico de cada cadastro e uma sugestão de qual manter (o que tem mais
// histórico; empate, o mais antigo). A conexão é aberta em modo só leitura.
//
// Com --aplicar, junta UM grupo numa transação:
//   node scripts/guarda-banco.mjs && node scripts/juntar-videomakers-duplicados.mjs \
//     --aplicar --manter <id> --juntar <id>,<id> [--org <organizacaoId>] [--forcar]
//
//   - move demandas, convites, avaliações, custos, notas fiscais, eventos,
//     coberturas, espelhos, convites da rede e aceites dos termos;
//   - junta vínculos e dados fiscais por empresa (fica o do mantido, com o que
//     faltar nele);
//   - junta as cidades na lista de atendidas (a base do mantido fica);
//   - fica a conta (login) do mantido; as outras saem desta empresa como no
//     "Desativar cadastro" (inativa e sem telefone, ou só sem o vínculo daqui);
//   - apaga os cadastros juntados e grava `videomaker.juntar` na auditoria.
//
// Antes de gravar, salva uma cópia de tudo que muda em
// ~/nuflow-virada/juntar-videomakers/ (ou --copia <pasta>): é por ela que se
// desfaz à mão, se for preciso. Contém telefone, e-mail e dados fiscais
// cifrados: não sai da máquina.
//
// Escrita em produção: só com o sim do Giovani.
import { config } from "dotenv"
import pg from "pg"
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { listarGrupos, juntarVideomakers } from "./lib/juntar-videomakers.mjs"

config({ path: ".env.local" })
config({ path: ".env" })
const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) {
  console.error("Sem DIRECT_URL/DATABASE_URL.")
  process.exit(1)
}

const args = process.argv.slice(2)
const valor = nome => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined }
const aplicar = args.includes("--aplicar")
const json = args.includes("--json")

const c = new pg.Client({
  connectionString: url,
  // Sem --aplicar, o próprio banco recusa qualquer escrita.
  ...(aplicar ? {} : { options: "-c default_transaction_read_only=on" }),
})
await c.connect()

const data = d => d.toISOString().slice(0, 10)
try {
  if (!aplicar) {
    const grupos = await listarGrupos(c)
    if (json) {
      console.log(JSON.stringify(grupos, null, 2))
    } else {
      console.log(`\nVideomakers com o mesmo telefone na mesma empresa — só leitura\n`)
      if (!grupos.length) console.log("Nenhum grupo. Nada a juntar.")
      for (const g of grupos) {
        console.log(`${g.empresa} · telefone final ${g.telefone.slice(-4)} · ${g.cadastros.length} cadastros`)
        for (const v of g.cadastros) {
          const marca = v.id === g.sugestao ? "→ manter" : "  juntar"
          const cidades = [v.cidade, ...(v.cidadesAtendidas ?? [])].filter(Boolean).join(" + ") || "sem cidade"
          console.log(`  ${marca}  ${v.id}  ${v.nome.trim()}  (${cidades}${v.estado ? `/${v.estado}` : ""})  criado ${data(v.createdAt)}`)
          console.log(`           vínculo ${v.statusVinculo}; conta ${v.emailConta ?? "nenhuma"}${v.statusConta && v.statusConta !== "ativo" ? ` (${v.statusConta})` : ""}; ` +
            `histórico ${v.historico} (demandas ${v.demandas}, convites ${v.convites}, custos ${v.custos}, avaliações ${v.avaliacoes}, NF ${v.notasFiscais}, eventos ${v.eventos}, coberturas ${v.coberturas})` +
            (v.convitesRedePendentes ? `; convites da rede pendentes ${v.convitesRedePendentes}` : ""))
        }
        const juntar = g.cadastros.filter(v => v.id !== g.sugestao).map(v => v.id).join(",")
        console.log(`  Para aplicar a sugestão: --aplicar --manter ${g.sugestao} --juntar ${juntar}\n`)
      }
    }
  } else {
    const manterId = valor("--manter")
    const juntarIds = (valor("--juntar") ?? "").split(",").map(s => s.trim()).filter(Boolean)
    const pasta = valor("--copia") ?? join(homedir(), "nuflow-virada", "juntar-videomakers")
    const arquivo = join(pasta, `juntar-${manterId}-${Date.now()}.json`)
    const r = await juntarVideomakers(c, {
      manterId, juntarIds, organizacaoId: valor("--org"), forcar: args.includes("--forcar"),
      antesDeConfirmar: copia => {
        if (!existsSync(pasta)) mkdirSync(pasta, { recursive: true, mode: 0o700 })
        writeFileSync(arquivo, JSON.stringify(copia, null, 2), { mode: 0o600 })
      },
    })
    console.log(`\nJuntado em ${manterId}: ${r.juntados.join(", ")}`)
    console.log(`Cidades atendidas: ${r.cidadesAtendidas.join(", ") || "—"}`)
    console.log(`Conta que fica: ${r.contaQueFica ?? "nenhuma"}`)
    for (const [k, n] of Object.entries(r.contagem)) if (n) console.log(`  ${k}: ${n}`)
    console.log(`Auditoria: videomaker.juntar (${r.correlationId})`)
    console.log(`Cópia do que mudou: ${arquivo}`)
  }
} catch (e) {
  console.error(`\nNada foi alterado: ${e.message}`)
  process.exitCode = 1
} finally {
  await c.end()
}
