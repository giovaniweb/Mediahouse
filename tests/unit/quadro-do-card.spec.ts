import { describe, expect, it } from "vitest"
import { contratoEfetivo, quadroDoCard } from "@/lib/quadro-do-card"

describe("quadroDoCard — Jobs ou Demandas", () => {
  it("videomaker externo escalado é Job, seja qual for o tipo", () => {
    expect(quadroDoCard({ tipoVideo: "reels", departamento: "audiovisual", videomakerId: "v", contratoVideomaker: "externo" })).toBe("jobs")
  })
  it("videomaker interno fica em Demandas, mesmo numa cobertura", () => {
    expect(quadroDoCard({ tipoVideo: "cobertura_evento", departamento: "eventos", videomakerId: "v", contratoVideomaker: "interno" })).toBe("demandas")
  })
  it("sem videomaker, a marca de cobertura decide — qualquer uma das duas", () => {
    expect(quadroDoCard({ tipoVideo: "cobertura_evento", departamento: "audiovisual" })).toBe("jobs")
    expect(quadroDoCard({ tipoVideo: "reels", departamento: "eventos" })).toBe("jobs")
    expect(quadroDoCard({ tipoVideo: "reels", departamento: "audiovisual" })).toBe("demandas")
  })
  it("contrato desconhecido conta como externo, o padrão do cadastro", () => {
    expect(quadroDoCard({ tipoVideo: "reels", departamento: "audiovisual", videomakerId: "v", contratoVideomaker: null })).toBe("jobs")
  })
  it("o contrato da empresa vence o do cadastro global", () => {
    expect(contratoEfetivo("externo", "interno")).toBe("externo")
    expect(contratoEfetivo(null, "interno")).toBe("interno")
    expect(contratoEfetivo(undefined, undefined)).toBeNull()
  })
})
