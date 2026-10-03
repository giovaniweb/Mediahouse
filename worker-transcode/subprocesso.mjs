// Supervisor separado: o fechamento do IPC revela a morte abrupta do worker.
// Só encerra o subprocesso que ele próprio criou; nunca busca PIDs externos.
import { spawn } from "node:child_process"
import { writeFile } from "node:fs/promises"
const [bin, serializado, prazo, marker, dono] = process.argv.slice(2)
if (!["ffmpeg", "ffprobe"].includes(bin) || !process.send) process.exit(1)
let desligado = false, encerrado = false, cancelado = false
const child = spawn(bin, JSON.parse(serializado), { stdio: ["ignore", "pipe", "ignore"] })
const cancelar = () => { cancelado = true; child.kill("SIGKILL") }
process.on("disconnect", () => { desligado = true; if (!encerrado) cancelar() })
process.on("message", msg => { if (msg === "cancelar") cancelar() })
process.on("SIGTERM", cancelar)
process.on("SIGINT", cancelar)
if (!process.connected) { desligado = true; cancelar() }
const timer = setTimeout(cancelar, Number(prazo))
child.on("error", () => {})
// O pai limita stdout a 1 MiB; pipe interrompido também cancela o subprocesso.
process.stdout.on("error", cancelar)
child.stdout.pipe(process.stdout)
child.on("close", async code => {
  encerrado = true; clearTimeout(timer)
  if (desligado) {
    // Só depois de close é seguro liberar o diretório do worker morto.
    try { await writeFile(marker, JSON.stringify({ tipo: "nuflow-preview-v2", pid: Number(dono), fase: "seguro" }), { mode: 0o600 }) } catch {}
  }
  process.exitCode = cancelado || code !== 0 ? 1 : 0
  if (process.connected) process.disconnect()
})
