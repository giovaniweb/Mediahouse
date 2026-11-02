import { describe, it, expect } from "vitest"
import { PRESETS } from "@/lib/permissoes"
import { ETAPAS, statusAoSoltar } from "@/lib/etapas-da-gravacao"
import { movimentoDoJob, type AtorDoQuadro, type JobArrastado } from "@/lib/jobs-quadro"

const job: JobArrastado = { statusInterno: "captacao_agendada", statusVisivel: "producao", videomakerId: "vm-1", linkBrutos: "https://drive/brutos" }

const gestor: AtorDoQuadro = { id: "u-g", papel: "gestor", permissoes: PRESETS.gestor, videomakerId: null }
const videomakerDoJob: AtorDoQuadro = { id: "u-vm", papel: "videomaker", permissoes: PRESETS.videomaker, videomakerId: "vm-1" }
const editorSemMover: AtorDoQuadro = { id: "u-e", papel: "editor", permissoes: { ...PRESETS.gestor, moverKanban: false }, videomakerId: null }

describe("arrastar em Gravações Externas obedece à guarda do servidor", () => {
  it("gestão move para qualquer etapa do quadro", () => {
    for (const { id } of ETAPAS) {
      if (id === "agendado") continue
      const m = movimentoDoJob(job, id, gestor)
      expect(m.ok, id).toBe(true)
      if (m.ok) expect(m.statusInterno).toBe(statusAoSoltar(id, "agendado"))
    }
  })

  it("material chegando sem o link do drive: a frase diz o que falta", () => {
    const m = movimentoDoJob({ ...job, linkBrutos: null }, "em_edicao", gestor)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.motivo).toMatch(/Link dos brutos/)
  })

  it("agendar sem videomaker escalado é recusado", () => {
    const m = movimentoDoJob({ ...job, statusInterno: "planejamento", videomakerId: null }, "agendado", gestor)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.motivo).toMatch(/Escale o videomaker/)
  })

  it("videomaker não muda etapa fora das ações dele, e a frase diz o que ele pode fazer", () => {
    const m = movimentoDoJob(job, "concluido", videomakerDoJob)
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.motivo).toMatch(/aceitar, recusar, agendar/)
  })

  it("quem não tem permissão de mover recebe a explicação", () => {
    const m = movimentoDoJob(job, "em_edicao", editorSemMover)
    expect(m).toEqual({ ok: false, motivo: "Você não tem permissão para mover demandas." })
  })

  it("quem executa por espelhamento não aprova nem entrega o card da outra empresa", () => {
    const espelho = { ...job, espelho: { papel: "destino" } }
    expect(movimentoDoJob(espelho, "em_edicao", gestor).ok).toBe(true)
    for (const etapa of ["para_enviar", "concluido"]) {
      const m = movimentoDoJob(espelho, etapa, gestor)
      expect(m.ok, etapa).toBe(false)
      if (!m.ok) expect(m.motivo).toMatch(/espelhamento/)
    }
  })

  it("permissão que não dá para determinar nega, como no servidor", () => {
    expect(movimentoDoJob(job, "em_edicao", { ...gestor, permissoes: null }).ok).toBe(false)
  })

  it("soltar na própria etapa não muda nada", () => {
    const m = movimentoDoJob(job, "agendado", videomakerDoJob)
    expect(m).toEqual({ ok: true, statusInterno: "captacao_agendada", mudou: false })
  })

  it("perfil ainda carregando: quem decide é o servidor", () => {
    expect(movimentoDoJob(job, "em_edicao", null)).toMatchObject({ ok: true, mudou: true })
  })

  it("coluna desconhecida é recusada — inclusive as do quadro antigo", () => {
    expect(movimentoDoJob(job, "impedimento", gestor).ok).toBe(false)
    expect(movimentoDoJob(job, "producao", gestor).ok).toBe(false)
    expect(movimentoDoJob(job, "gravado", gestor).ok).toBe(false)
  })
})
