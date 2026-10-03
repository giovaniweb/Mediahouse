// Sem credenciais, volumes do host ou rede no container de execução.
// A construção requer download da imagem e pacotes públicos.
import { spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { resolve } from "node:path"
const disponibilidade = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8", timeout: 15000 })
if (disponibilidade.error || disponibilidade.status !== 0) {
  console.error("Ensaio não executado: Docker com daemon acessível é necessário. Nenhuma medição de container foi realizada.")
  process.exit(2)
}
const sufixo = randomBytes(6).toString("hex")
const base = `nuflow-transcode:base-${sufixo}`, imagem = `nuflow-transcode:teste-${sufixo}`, nome = `nuflow-midia-${sufixo}`
const contexto = resolve(import.meta.dirname, "../../worker-transcode")
async function docker(args) {
  const child = spawn("docker", args, { stdio: "inherit" })
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve) })
  if (code !== 0) throw new Error(`Docker encerrou com código ${code}`)
}
try {
  await docker(["build", "-t", base, contexto])
  await docker(["build", "-f", `${contexto}/Dockerfile.ensaio`, "--build-arg", `WORKER_IMAGE=${base}`, "-t", imagem, contexto])
  await docker(["run", "--name", nome, "--init", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--memory=768m", "--memory-swap=768m", "--cpus=2", "--pids-limit=256", "--tmpfs", "/tmp:rw,noexec,nosuid,size=192m,mode=1777", imagem])
} catch (e) { console.error("ENSAIO_CONTAINER_FALHOU", e.message); process.exitCode = 1 }
finally {
  // Inspeciona apenas o container criado nesta execução; nunca usa prune.
  const estado = spawnSync("docker", ["inspect", "--format", "{{json .State}}", nome], { encoding: "utf8", timeout: 15000 })
  if (estado.status === 0) console.log("ESTADO_CONTAINER", estado.stdout.trim())
  spawnSync("docker", ["rm", "-f", nome], { stdio: "ignore", timeout: 15000 })
  spawnSync("docker", ["image", "rm", imagem, base], { stdio: "ignore", timeout: 15000 })
}
