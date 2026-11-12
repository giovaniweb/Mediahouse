import { describe, expect, it } from "vitest"
import {
  CATEGORIAS_AVISO, LISTA_CATEGORIAS, categoriaDaSaida, categoriaDoAlerta, categoriaDoKanban, decidirAviso,
  demandaDaSaida, precisaDoCard, tiposDeAlertaDa, type Preferencia,
} from "@/lib/avisos-categorias"
import { STATUS_COM_AVISO_KANBAN } from "@/lib/kanban-avisos"

const pref = (p: Partial<Preferencia>): Preferencia => ({ categoria: "andamento", sino: true, email: true, whatsapp: true, recorte: "tudo", ...p })

describe("decidirAviso: a regra que não pode errar", () => {
  it("sem preferência, recebe em todo canal, com ou sem card — nada muda", () => {
    for (const canal of ["sino", "email", "whatsapp"] as const) {
      for (const card of [true, false, null]) expect(decidirAviso(undefined, canal, card)).toBe(true)
    }
  })
  it("canal desligado não recebe; os outros continuam", () => {
    const p = pref({ whatsapp: false })
    expect(decidirAviso(p, "whatsapp", true)).toBe(false)
    expect(decidirAviso(p, "sino", false)).toBe(true)
  })
  it("recorte 'meus' corta só card de outros; aviso sem card passa", () => {
    const p = pref({ recorte: "meus" })
    expect(decidirAviso(p, "whatsapp", true)).toBe(true)
    expect(decidirAviso(p, "whatsapp", false)).toBe(false)
    expect(decidirAviso(p, "whatsapp", null)).toBe(true)
    expect(precisaDoCard(p, "whatsapp")).toBe(true)
    expect(precisaDoCard(pref({}), "whatsapp")).toBe(false)
    expect(precisaDoCard(undefined, "whatsapp")).toBe(false)
  })
  it("a configuração nunca dá aviso: com tudo ligado, o resultado é o mesmo de sem configuração", () => {
    for (const card of [true, false, null]) expect(decidirAviso(pref({}), "email", card)).toBe(decidirAviso(undefined, "email", card))
  })
})

describe("qual categoria é cada aviso", () => {
  it("gravação externa: a operação e a gestão acompanham; videomaker e cliente não se cortam", () => {
    expect(categoriaDaSaida({ origem: "manual", chave: "grav:d1:material:2026-11-12:operacao:abc" })).toBe("gravacoes")
    expect(categoriaDaSaida({ origem: "manual", chave: "grav:d1:nota_lote:3:2026-11-12:gestao:abc" })).toBe("gravacoes")
    expect(categoriaDaSaida({ origem: "manual", chave: "grav:d1:kit:2026-11-12:videomaker:abc" })).toBeNull()
    expect(categoriaDaSaida({ origem: "manual", chave: "grav:d1:confirmada:2026-11-12:cliente:abc" })).toBeNull()
  })
  it("convite, envio à mão e resposta automática ficam sem categoria (sempre saem)", () => {
    expect(categoriaDaSaida({ origem: "manual", chave: "convite:c1" })).toBeNull()
    expect(categoriaDaSaida({ origem: "manual", chave: "envio-manual:x" })).toBeNull()
    expect(categoriaDaSaida({ origem: "inbox", chave: "inbox:1:resposta", explicita: "pedidos" })).toBeNull()
    expect(categoriaDaSaida({ origem: "legado", chave: "abc123" })).toBeNull()
  })
  it("a rotina sai pelo nome da regra", () => {
    const regra = (r: string) => categoriaDaSaida({ origem: "regra", chave: "regra:v1:x", regraContexto: { tipo: "demanda", id: "d1", regra: r } })
    expect(regra("prazo_vencido")).toBe("prazos")
    expect(regra("briefing")).toBe("resumos")
    expect(regra("semanal:v1:audiovisual:2026-11-02:2026-11-08")).toBe("resumos")
    expect(regra("sem_material")).toBe("gravacoes")
    expect(regra("lembrete")).toBe("eventos")
    expect(regra("regra_que_nao_existe")).toBeNull()
  })
  it("kanban: gestão e quem pediu acompanham; quem produz recebe trabalho", () => {
    expect(categoriaDoKanban("gestor")).toBe("andamento")
    expect(categoriaDoKanban("solicitante")).toBe("andamento")
    expect(categoriaDoKanban("social")).toBe("social")
    for (const p of ["videomaker", "editor", "executor"]) expect(categoriaDoKanban(p)).toBeNull()
    expect(STATUS_COM_AVISO_KANBAN.length).toBeGreaterThan(0)
  })
  it("sino: cada tipo de alerta em uso tem categoria, e o desconhecido fica sem", () => {
    const emUso = ["whatsapp_reconectou", "regra_sem_final", "regra_prazo_vencido", "regra_sem_movimento", "regra_prazo_proximo",
      "nova_demanda_audiovisual", "novo_videomaker_pendente", "aprovacao_pendente", "regra_aprovacao_pendente", "video_aprovado",
      "demanda_externa", "material_recebido", "nf_recebida", "urgencia_pendente", "mencao_comentario", "ajuste_solicitado", "whatsapp_desconectado"]
    for (const t of emUso) expect(categoriaDoAlerta(t), t).not.toBeNull()
    expect(categoriaDoAlerta("algo_da_ia")).toBeNull()
    expect(tiposDeAlertaDa("prazos")).toContain("regra_prazo_vencido")
  })
  it("o card do aviso", () => {
    expect(demandaDaSaida({ origem: "legado", chave: "h", referencia: "d1" })).toBe("d1")
    expect(demandaDaSaida({ origem: "legado", chave: "h", referencia: "aviso" })).toBeNull()
    expect(demandaDaSaida({ origem: "legado", chave: "h", referencia: "aviso", demandaId: "d2" })).toBe("d2")
    expect(demandaDaSaida({ origem: "manual", chave: "grav:d3:material:x", referencia: "d3" })).toBe("d3")
    expect(demandaDaSaida({ origem: "regra", chave: "r", referencia: "g", regraContexto: { tipo: "gestor", id: "g" } })).toBeNull()
  })
  it("toda categoria tem título, descrição e exemplo", () => {
    for (const c of LISTA_CATEGORIAS) {
      const i = CATEGORIAS_AVISO[c]
      expect(i.titulo && i.descricao && i.exemplo).toBeTruthy()
    }
  })
})
