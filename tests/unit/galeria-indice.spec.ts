import { describe, it, expect } from "vitest"
import { paginarGaleria } from "@/lib/galeria-indice"
const item = (id: string, final: string | null, anexo: string | null, updated = "2026-05-01") => ({ id, demandaId: "d", url: `https://example.invalid/${id}`, finalizadaEm: final ? new Date(final) : null, anexadoEm: anexo ? new Date(anexo) : null, updatedAt: new Date(updated), legado: !anexo })
describe("índice paginado de entregáveis", () => {
  it("ordena por conclusão/anexo/estimativa antes de paginar, com desempate", () => {
    const items = [item("junho","2026-06-01","2026-05-01"),item("b","2026-09-20","2026-09-01"),item("a","2026-09-20","2026-09-01"),item("anexo",null,"2026-09-15"),item("legado",null,null)]
    expect(paginarGaleria(items,1,2).itens.map(i => i.id)).toEqual(["a","b"])
    expect(paginarGaleria(items,2,2).itens.map(i => i.id)).toEqual(["anexo","junho"])
    expect(paginarGaleria(items,3,2).itens[0]).toMatchObject({ id: "legado", origemData: "atualizacao", dataEstimada: true })
    expect(paginarGaleria(items,9,2)).toMatchObject({ total: 5, totalPages: 3, itens: [] })
  })
  it("deduplica URLs canônicas na demanda sem fundir entregas de empresas/jobs diferentes", () => {
    const a = { ...item("a",null,"2026-09-01"), url: "https://drive.google.com/open?id=abc" }
    const b = { ...a, id: "b", url: "https://drive.google.com/file/d/abc/view" }
    expect(paginarGaleria([b,a,{...a,id:"c",demandaId:"outro"}],1,10).total).toBe(2)
  })
})
