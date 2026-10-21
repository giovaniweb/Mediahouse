import { describe, it, expect } from "vitest"
import { PRESETS } from "@/lib/permissoes"
import { AUDIOVISUAL_COLUNA_PARA_STATUS } from "@/lib/kanban-movimento"
import { movimentoDoJob, type AtorDoQuadro, type JobArrastado } from "@/lib/jobs-quadro"

const job: JobArrastado = { statusInterno: "captacao_agendada", statusVisivel: "producao", videomakerId: "vm-1" }

const gestor: AtorDoQuadro = { id: "u-g", papel: "gestor", permissoes: PRESETS.gestor, videomakerId: null }
const videomakerDoJob: AtorDoQuadro = { id: "u-vm", papel: "videomaker", permissoes: PRESETS.videomaker, videomakerId: "vm-1" }
const editorSemMover: AtorDoQuadro = { id: "u-e", papel: "editor", permissoes: { ...PRESETS.gestor, moverKanban: false }, videomakerId: null }

describe("arrastar no quadro de Jobs obedece à guarda do servidor", () => {
  it("gestão move para qualquer etapa do quadro", () => {
    for (const coluna of Object.keys(AUDIOVISUAL_COLUNA_PARA_STATUS)) {
      if (coluna === "producao") continue
      const m = movimentoDoJob(job, coluna, gestor)
      expect(m.ok, coluna).toBe(true)
      if (m.ok) expect(m.statusInterno).toBe(AUDIOVISUAL_COLUNA_PARA_STATUS[coluna])
    }
  })

  it("videomaker não muda etapa pelo quadro, nem no job dele, e a frase diz o que ele pode fazer", () => {
    const m = movimentoDoJob(job, "edicao", videomakerDoJob)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.motivo).toMatch(/aceitar, recusar, agendar/)
  })

  it("quem não tem permissão de mover recebe a explicação", () => {
    const m = movimentoDoJob(job, "edicao", editorSemMover)
    expect(m).toEqual({ ok: false, motivo: "Você não tem permissão para mover demandas." })
  })

  it("quem executa por espelhamento não aprova nem encerra o card da outra empresa", () => {
    const espelho = { ...job, espelho: { papel: "destino" } }
    expect(movimentoDoJob(espelho, "edicao", gestor).ok).toBe(true)
    const m = movimentoDoJob(espelho, "finalizado", gestor)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.motivo).toMatch(/espelhamento/)
  })

  it("permissão que não dá para determinar nega, como no servidor", () => {
    expect(movimentoDoJob(job, "edicao", { ...gestor, permissoes: null }).ok).toBe(false)
  })

  it("soltar na própria coluna não muda nada", () => {
    const m = movimentoDoJob(job, "producao", videomakerDoJob)
    expect(m).toMatchObject({ ok: true, mudou: false })
  })

  it("perfil ainda carregando: quem decide é o servidor", () => {
    expect(movimentoDoJob(job, "edicao", null)).toMatchObject({ ok: true, mudou: true })
  })

  it("coluna desconhecida é recusada", () => {
    expect(movimentoDoJob(job, "impedimento", gestor).ok).toBe(false)
  })
})
