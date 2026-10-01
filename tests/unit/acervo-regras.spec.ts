import { expect, it } from "vitest"
import { estadoHistorico, exigeArquivo, POLITICA_RETENCAO } from "@/lib/acervo-regras"
const agora = new Date("2026-10-01T12:00:00Z")
it.each([[29,"concluido_recente"],[30,"historico"],[31,"historico"]])("conclusão de %s dias", (dias,estado) => {
  expect(estadoHistorico("finalizado",new Date(agora.getTime()-Number(dias)*86400000),agora)).toBe(estado)
})
it("legado não recebe data inventada e reabertura volta ao trabalho", () => {
  expect(estadoHistorico("finalizado",null,agora)).toBe("legado_sem_data")
  expect(estadoHistorico("edicao",new Date(0),agora)).toBe("em_trabalho")
})
it("Growth administrativo não exige vídeo; tipo desconhecido pede revisão", () => {
  expect(exigeArquivo("design","administrativo")).toBe(false); expect(exigeArquivo("design","post")).toBe(true)
  expect(exigeArquivo("audiovisual","reels")).toBe(true); expect(exigeArquivo("audiovisual","novo")).toBeNull()
})
it("retenção preserva original, prévia e final sem prometer bytes", () => {
  expect(POLITICA_RETENCAO).toMatchObject({ original:"preservar",previa:"preservar",final:"preservar",excluirAutomaticamente:false,economiaBytes:null })
})
