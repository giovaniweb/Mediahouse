// Entrada: snapshot JSON local. Não conecta a banco/storage nem lê .env.
import { readFile, stat, writeFile } from "node:fs/promises"
import { analisarInventario } from "./lib/inventario-midia.mjs"
const [entrada, saida, ...resto] = process.argv.slice(2)
if (!entrada || !saida || resto.length) {
  console.error("Uso: node scripts/inventario-midia.mjs snapshot.json relatorio.json")
  process.exitCode = 2
} else {
  try {
    if ((await stat(entrada)).size > 32 * 1024 * 1024) throw new Error("snapshot_excede_32_MiB")
    const relatorio = analisarInventario(JSON.parse(await readFile(entrada, "utf8")))
    await writeFile(saida, JSON.stringify(relatorio, null, 2) + "\n", { flag: "wx", mode: 0o600 })
    console.log(JSON.stringify({ modo: relatorio.modo, autorizaExclusao: false, resumo: relatorio.resumo }))
  } catch {
    console.error("Inventário não gerado: confira o contrato, tamanho da entrada e se o destino já existe. Nenhum arquivo existente é sobrescrito.")
    process.exitCode = 1
  }
}
