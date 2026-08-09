import { describe, it, expect } from "vitest"
import { PRESETS, PERMISSAO_HREF_MAP, PERMISSAO_LABELS } from "@/lib/permissoes"

// O sistema de permissões é grande (27 chaves, 12 presets) e é fácil adicionar
// uma chave nova e esquecer de refletir em algum lugar. Estes testes travam a
// coerência entre as três estruturas que precisam andar juntas.
describe("catálogo de permissões", () => {
  it("toda permissão usada em algum preset tem rótulo legível", () => {
    const chavesEmPresets = new Set(Object.values(PRESETS).flatMap((p) => Object.keys(p)))
    const semRotulo = [...chavesEmPresets].filter((k) => !(k in PERMISSAO_LABELS))
    expect(semRotulo).toEqual([])
  })

  it("toda rota mapeada aponta para uma permissão que existe", () => {
    const conhecidas = new Set(Object.keys(PERMISSAO_LABELS))
    const orfas = Object.entries(PERMISSAO_HREF_MAP).filter(([, perm]) => !conhecidas.has(perm))
    expect(orfas).toEqual([])
  })

  it("as duas telas de aprovação têm permissões distintas", () => {
    // Separar audiovisual de Growth só vale se as permissões forem separadas —
    // caso contrário quem aprova arte continua enxergando pagamento de videomaker.
    expect(PERMISSAO_HREF_MAP["/aprovacoes"]).toBe("verAprovacoes")
    expect(PERMISSAO_HREF_MAP["/aprovacoes/growth"]).toBe("verAprovacoesGrowth")
  })

  it("o preset de líder audiovisual dá aprovação e edição, mas não gestão de usuários", () => {
    const lider = PRESETS.lider_audiovisual
    expect(lider.verAprovacoes).toBe(true)
    expect(lider.editarDemanda).toBe(true)
    expect(lider.moverKanban).toBe(true)
    expect(lider.verTodasDemandas).toBe(true)
    expect(lider.gerenciarUsuarios).toBe(false)
  })

  it("nenhum preset concede permissão fora do catálogo", () => {
    const conhecidas = new Set(Object.keys(PERMISSAO_LABELS))
    for (const [nome, preset] of Object.entries(PRESETS)) {
      const desconhecidas = Object.keys(preset).filter((k) => !conhecidas.has(k))
      expect({ preset: nome, desconhecidas }).toEqual({ preset: nome, desconhecidas: [] })
    }
  })
})
