import { test } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, mkdir, writeFile, symlink, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { limparTemporariosAbandonados } from "../temporarios.mjs"
test("limpeza remove só temporário seguro de processo encerrado", async () => {
  const root = await mkdtemp(join(tmpdir(), "nuflow-cleanup-"))
  try {
    const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" })
    await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve) })
    async function pasta(nome, conteudo) {
      const dir = join(root, nome); await mkdir(dir)
      if (conteudo !== undefined) await writeFile(join(dir, ".nuflow-owner.json"), typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo))
    }
    const seguro = { tipo: "nuflow-preview-v2", pid: child.pid, fase: "seguro" }
    await pasta("nuflow-preview-morto", seguro)
    await pasta("nuflow-preview-vivo", { ...seguro, pid: process.pid })
    await pasta("nuflow-preview-subprocesso", { ...seguro, fase: "subprocesso" })
    await pasta("nuflow-preview-invalido", "{")
    await pasta("nuflow-preview-sem-marker")
    await pasta("alheio", seguro)
    await pasta("nuflow-preview-marker-link")
    await symlink(join(root, "alheio", ".nuflow-owner.json"), join(root, "nuflow-preview-marker-link", ".nuflow-owner.json"))
    await symlink(join(root, "alheio"), join(root, "nuflow-preview-link"))
    assert.deepEqual(await limparTemporariosAbandonados(root), { removidos: 1, preservados: 5 })
    assert.deepEqual((await readdir(root)).sort(), ["alheio", "nuflow-preview-invalido", "nuflow-preview-link", "nuflow-preview-marker-link", "nuflow-preview-sem-marker", "nuflow-preview-subprocesso", "nuflow-preview-vivo"])
    assert.deepEqual(await limparTemporariosAbandonados(root), { removidos: 0, preservados: 5 })
  } finally { await rm(root, { recursive: true, force: true }) }
})
