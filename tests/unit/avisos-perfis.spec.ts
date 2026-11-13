import { describe, expect, it } from "vitest"
import { LISTA_CATEGORIAS, decidirAviso, type FatosDoCard } from "@/lib/avisos-categorias"
import { PERFIS_AVISO, estadoDoPerfil, perfilDoEstado } from "@/lib/avisos-perfis"
import { categoriaDaSaida, categoriaDoKanban } from "@/lib/avisos-categorias"
import { arteDoKanban, familiaDaSaida } from "@/lib/avisos-arte"
// O script que aplica os perfis na Contourline carrega a própria cópia (é .mjs,
// roda sem o TypeScript). Este teste garante que as duas não se separam.
import { estadoDoPerfil as doScript } from "../../scripts/perfis-avisos-contourline.mjs"

const card = (f: Partial<FatosDoCard>): FatosDoCard => ({ esta: false, pediu: false, setores: [], ...f })
const de = (perfil: Parameters<typeof estadoDoPerfil>[0], setor?: "audiovisual" | "growth") =>
  new Map(estadoDoPerfil(perfil, setor).map((e) => [e.categoria, e]))

describe("perfis prontos", () => {
  it("cobrem todas as categorias e têm texto", () => {
    for (const p of Object.keys(PERFIS_AVISO) as (keyof typeof PERFIS_AVISO)[]) {
      if (p === "setor") continue
      expect(estadoDoPerfil(p).map((e) => e.categoria)).toEqual(LISTA_CATEGORIAS)
      expect(PERFIS_AVISO[p].titulo && PERFIS_AVISO[p].resumo).toBeTruthy()
    }
    expect(() => estadoDoPerfil("setor")).toThrow()
  })
  it("só o resumo do dia: resumos chegam, o resto não", () => {
    const p = de("so_resumo")
    expect(decidirAviso(p.get("resumos"), "whatsapp", null)).toBe(true)
    for (const c of LISTA_CATEGORIAS.filter((c) => c !== "resumos")) expect(decidirAviso(p.get(c), "whatsapp", card({ pediu: true, esta: true }))).toBe(false)
  })
  it("tudo do meu setor (Thalisson no Growth): card do Growth sim, do Audiovisual só se estiver nele", () => {
    const p = de("setor", "growth")
    expect(decidirAviso(p.get("andamento"), "whatsapp", card({ setores: ["growth"] }))).toBe(true)
    expect(decidirAviso(p.get("pedidos"), "whatsapp", card({ setores: ["growth"] }))).toBe(true)
    expect(decidirAviso(p.get("andamento"), "whatsapp", card({ setores: ["audiovisual"] }))).toBe(false)
    expect(decidirAviso(p.get("andamento"), "whatsapp", card({ setores: ["audiovisual"], esta: true }))).toBe(true)
    expect(decidirAviso(p.get("resumos"), "whatsapp", null)).toBe(true)
    expect(decidirAviso(p.get("eventos"), "whatsapp", null)).toBe(false)
  })
  it("só o que eu pedi (Carol pediu um vídeo): só aquele vídeo", () => {
    const p = de("pedi")
    expect(decidirAviso(p.get("andamento"), "whatsapp", card({ pediu: true, esta: true }))).toBe(true)
    expect(decidirAviso(p.get("andamento"), "whatsapp", card({ esta: true, setores: ["audiovisual"] }))).toBe(false)
    expect(decidirAviso(p.get("gravacoes"), "email", card({}))).toBe(false)
    expect(decidirAviso(p.get("resumos"), "whatsapp", null)).toBe(true)
    expect(decidirAviso(p.get("sistema"), "sino", null)).toBe(false)
  })
  it("parabéns fica ligado em todo perfil, menos no 'só o resumo do dia'", () => {
    expect(de("setor", "growth").get("parabens")).toMatchObject({ whatsapp: true, recorte: "tudo" })
    expect(de("pedi").get("parabens")).toMatchObject({ whatsapp: true, recorte: "tudo" })
    expect(de("so_resumo").get("parabens")).toMatchObject({ whatsapp: false })
  })
  it("videomaker e 'como antes' não cortam nada", () => {
    for (const perfil of ["videomaker", "padrao"] as const) {
      for (const e of estadoDoPerfil(perfil)) expect(decidirAviso(e, "whatsapp", card({}))).toBe(true)
    }
  })
  it("a página reconhece o perfil aplicado", () => {
    expect(perfilDoEstado(estadoDoPerfil("pedi"))).toBe("pedi")
    expect(perfilDoEstado(estadoDoPerfil("setor", "growth"))).toBe("setor")
    expect(perfilDoEstado(estadoDoPerfil("so_resumo"))).toBe("so_resumo")
  })
  it("o script da Contourline aplica exatamente os mesmos perfis", () => {
    for (const [p, s] of [["so_resumo"], ["pedi"], ["padrao"], ["setor", "audiovisual"], ["setor", "growth"]] as const) {
      expect(doScript(p, s ?? null)).toEqual(estadoDoPerfil(p, s ?? null))
    }
  })
  it("videomaker contratado: o que é dele não se corta e vai com arte", () => {
    const saidas = [
      { origem: "manual", chave: "convite:c1", destinatarioTipo: "videomaker" },
      { origem: "manual", chave: "grav:d1:kit:2026-11-12:videomaker:abc", destinatarioTipo: "videomaker" },
      { origem: "manual", chave: "grav:d1:nota_paga:2026-11-12:videomaker:abc", destinatarioTipo: "videomaker" },
      { origem: "manual", chave: "grav:d1:cancelada:2026-11-12:videomaker:abc", destinatarioTipo: "usuario" },
    ]
    for (const s of saidas) {
      expect(categoriaDaSaida(s), s.chave).toBeNull()
      expect(familiaDaSaida(s), s.chave).not.toBeNull()
    }
    // Kanban: "você foi escalado" e "aprovado" para o videomaker.
    expect(categoriaDoKanban("videomaker")).toBeNull()
    for (const st of ["videomaker_notificado", "captacao_agendada", "aprovado", "postado"]) expect(arteDoKanban(st, "videomaker")).not.toBeNull()
  })
})
