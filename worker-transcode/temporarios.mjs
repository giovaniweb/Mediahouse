import { readdir, readFile, lstat, rm } from "node:fs/promises"
import { join } from "node:path"

/** Só diretórios marcados pelo motor, sem subprocesso possivelmente ativo e com PID morto.
 * PID reutilizado, marker inválido, symlink e fase de subprocesso ficam para inspeção. */
export async function limparTemporariosAbandonados(root) {
  let removidos = 0, preservados = 0
  for (const entrada of await readdir(root, { withFileTypes: true })) {
    if (!entrada.name.startsWith("nuflow-preview-") || !entrada.isDirectory() || entrada.isSymbolicLink()) continue
    const dir = join(root, entrada.name), marker = join(dir, ".nuflow-owner.json")
    try {
      const info = await lstat(marker)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1024) { preservados++; continue }
      const dono = JSON.parse(await readFile(marker, "utf8"))
      if (dono.tipo !== "nuflow-preview-v2" || dono.fase !== "seguro" || !Number.isSafeInteger(dono.pid) || dono.pid <= 0) { preservados++; continue }
      try { process.kill(dono.pid, 0); preservados++; continue }
      catch (e) { if (e.code !== "ESRCH") { preservados++; continue } }
      await rm(dir, { recursive: true, force: true }); removidos++
    } catch { preservados++ }
  }
  return { removidos, preservados }
}
