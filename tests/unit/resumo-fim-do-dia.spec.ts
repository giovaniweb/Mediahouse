import { describe, expect, it } from "vitest"
import { escopoDoResumo, humorDoFimDoDia, inicioDoDia, mensagemDoFimDoDia, htmlDoFimDoDia, turmaDoFimDoDia } from "@/lib/resumo-fim-do-dia"
import type { Preferencia } from "@/lib/avisos-categorias"

const vazio = { nome: "Thalison Samuel", andou: [], esperando: [], atrasados: [], novos: [], link: "https://nuflow.space/hoje" }
const pref = (p: Partial<Preferencia> & { categoria: string }): Preferencia => ({ sino: true, email: true, whatsapp: true, recorte: "tudo", ...p })

describe("resumo do fim do dia", () => {
  it("dia sem movimento: não manda nada", () => {
    expect(mensagemDoFimDoDia(vazio)).toBeNull()
  })
  it("só os blocos com itens, primeiro nome, link no fim e no máximo 4 por bloco", () => {
    const andou = Array.from({ length: 6 }, (_, i) => ({ codigo: `GR-${i}`, titulo: `Arte ${i}`, detalhe: "aprovado" }))
    const m = mensagemDoFimDoDia({ ...vazio, andou, atrasados: [{ codigo: "GR-9", titulo: "Banner" }] })!
    expect(m.startsWith("🌙 Thalison, o resumo do seu dia no Flow.")).toBe(true)
    expect(m).toContain("*✅ Andou hoje*")
    expect(m).toContain("• GR-3 — Arte 3 (aprovado)")
    expect(m).not.toContain("GR-4 — Arte 4")
    expect(m).toContain("• e mais 2")
    expect(m).toContain("*⏰ Atrasados*\n• GR-9 — Banner")
    expect(m).not.toContain("Esperando você")
    expect(m.endsWith("https://nuflow.space/hoje")).toBe(true)
  })
  it("o e-mail escapa o que veio de formulário", () => {
    const h = htmlDoFimDoDia({ ...vazio, novos: [{ codigo: "AV-1", titulo: "<script>x</script>" }] })
    expect(h).not.toContain("<script>x")
    expect(h).toContain("&lt;script&gt;")
  })
  it("o recorte do resumo segue o perfil", () => {
    // Sem nada: sem corte de perfil (null), e nunca um `{}` dentro de OR, que o
    // Prisma descarta em vez de ler como "tudo" (revisão do #154).
    expect(escopoDoResumo(new Map(), "u1")).toBeNull()
    // Só o que eu pedi.
    const pedi = new Map([["andamento", pref({ categoria: "andamento", recorte: "pedi" })], ["gravacoes", pref({ categoria: "gravacoes", recorte: "pedi" })]])
    expect(JSON.stringify(escopoDoResumo(pedi, "u1"))).toContain('"solicitanteId":"u1"')
    // Débora: andamento só o que pediu, gravações todas.
    const debora = new Map([["andamento", pref({ categoria: "andamento", recorte: "pedi" })], ["gravacoes", pref({ categoria: "gravacoes" })]])
    const e = escopoDoResumo(debora, "u2") as { OR: object[] }
    expect(e.OR).toHaveLength(2)
    expect(JSON.stringify(e)).not.toContain("{}")
    expect(JSON.stringify(e.OR[1])).toContain("tipoGravacao")
    // Só o resumo do dia: o andamento está desligado nos canais, mas o resumo
    // traz tudo o que ela receberia — é para isso que ela desligou o resto.
    const off = { sino: false, email: false, whatsapp: false }
    const soResumo = escopoDoResumo(new Map([["andamento", pref({ categoria: "andamento", ...off })], ["gravacoes", pref({ categoria: "gravacoes", ...off })]]), "u3")
    expect(soResumo).toBeNull()
  })
  it("o dia começa à meia-noite de São Paulo", () => {
    expect(inicioDoDia(new Date("2026-11-12T22:00:00Z")).toISOString()).toBe("2026-11-12T03:00:00.000Z")
    expect(inicioDoDia(new Date("2026-11-13T02:00:00Z")).toISOString()).toBe("2026-11-12T03:00:00.000Z")
  })
  it("arte: turma pelo setor do perfil ou pelo cadastro; humor pelas pendências", () => {
    const growth = new Map([["andamento", pref({ categoria: "andamento", recorte: "setor", setor: "growth" })]])
    expect(turmaDoFimDoDia(growth, { areas: ["audiovisual"] })).toBe("gr")
    expect(turmaDoFimDoDia(new Map(), { areas: ["growth"] })).toBe("gr")
    expect(turmaDoFimDoDia(new Map(), { areas: ["audiovisual", "growth"] })).toBe("av")
    expect(turmaDoFimDoDia(new Map(), { funcaoProfissional: "Social Media" })).toBe("so")
    const i = { codigo: "A", titulo: "a" }
    expect(humorDoFimDoDia({ atrasados: [], esperando: [] })).toBe("ok")
    expect(humorDoFimDoDia({ atrasados: [i, i], esperando: [i] })).toBe("cansado")
    expect(humorDoFimDoDia({ atrasados: [i, i, i], esperando: [i] })).toBe("apuros")
  })
})
