// Somente leitura explícita; nenhuma conexão é inferida de DATABASE_URL/.env.
import { writeFile } from "node:fs/promises"
import { criarListadorStorage } from "./lib/coleta-midia-storage.mjs"
import { criarColetorPg } from "./lib/coleta-midia-pg.mjs"
import { coletarInventario } from "./lib/coleta-midia.mjs"
const [organizacaoId, carencia, saida, ...resto] = process.argv.slice(2)
try {
  if (!organizacaoId || !saida || resto.length || !Number.isInteger(Number(carencia)) || Number(carencia) < 24) throw new Error("argumentos_invalidos")
  const connectionString = process.env.INVENTARIO_DATABASE_URL, origem = new URL(process.env.INVENTARIO_SUPABASE_URL), key = process.env.INVENTARIO_STORAGE_KEY
  if (!connectionString || !key || origem.protocol !== "https:" || origem.pathname !== "/" || origem.search || origem.hash || origem.username || origem.password) throw new Error("configuracao_explicita_obrigatoria")
  const signal = AbortSignal.timeout(120000)
  const banco = criarColetorPg({connectionString,storageOrigin:origem.origin})
  const listar = criarListadorStorage({origem:origem.origin,key,organizacaoId,signal})
  const resultado = await coletarInventario({banco,listar,organizacaoId,carenciaHoras:Number(carencia),signal})
  await writeFile(saida,JSON.stringify(resultado,null,2)+"\n",{flag:"wx",mode:0o600})
  console.log(JSON.stringify({modo:"somente_leitura",resumo:resultado.relatorio.resumo,coleta:resultado.coleta}))
} catch {
  console.error("Coleta não concluída. Exige empresa/carência/destino novo, configuração INVENTARIO_* explícita, login app_user sem bypass e acesso de leitura ao storage. Nenhum objeto é alterado; detalhes e segredos não são registrados.")
  process.exitCode=1
}
