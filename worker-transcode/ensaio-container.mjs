// Exclusivo do container de ensaio. Exige cgroup v2 com limite real.
import { readFile, readdir } from "node:fs/promises"
import { spawn } from "node:child_process"
const ler = nome => readFile(`/sys/fs/cgroup/${nome}`, "utf8").then(s => s.trim())
const eventos = s => Object.fromEntries(s.split("\n").map(l => { const [k, v] = l.split(/\s+/); return [k, Number(v)] }))
try {
  const limite = Number(await ler("memory.max"))
  if (!Number.isSafeInteger(limite) || limite <= 0 || limite > 768 * 1024 * 1024) throw new Error("limite_memoria_ausente_ou_excessivo")
  const antes = eventos(await ler("memory.events"))
  const testes = (await readdir("tests")).filter(n => n.endsWith(".test.mjs")).sort().map(n => `tests/${n}`)
  if (!testes.length) throw new Error("testes_ausentes")
  const child = spawn(process.execPath, ["--test", "--test-concurrency=1", ...testes], { stdio: "inherit" })
  const codigo = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", code => resolve(code)) })
  const depois = eventos(await ler("memory.events"))
  const relatorio = {
    ambiente: "container-cgroup-v2", limiteBytes: limite,
    picoCgroupBytes: Number(await ler("memory.peak")),
    eventosOOM: (depois.oom ?? 0) - (antes.oom ?? 0),
    processosMortosOOM: (depois.oom_kill ?? 0) - (antes.oom_kill ?? 0),
    codigoTestes: codigo,
  }
  console.log("CGROUP_SINTETICO", JSON.stringify(relatorio))
  if (codigo !== 0 || relatorio.eventosOOM || relatorio.processosMortosOOM) process.exitCode = 1
} catch (e) {
  console.error("ENSAIO_CONTAINER_NAO_VALIDADO", e.message)
  process.exitCode = 1
}
