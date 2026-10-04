import { describe, it, expect } from "vitest"
import { csvDeInteressados, linkWhatsapp } from "@/lib/interessados"

describe("lista de interessados", () => {
  it("WhatsApp só vira link quando o número é inequívoco", () => {
    expect(linkWhatsapp("(31) 98888-7777")).toBe("https://wa.me/5531988887777")
    expect(linkWhatsapp("31 3333-4444")).toBe("https://wa.me/553133334444")
    expect(linkWhatsapp("+55 31 98888-7777")).toBe("https://wa.me/5531988887777")
    expect(linkWhatsapp("98888-7777")).toBeNull()
    expect(linkWhatsapp("não tenho")).toBeNull()
  })

  it("CSV neutraliza fórmula vinda do formulário público e preserva aspas e acentos", () => {
    const csv = csvDeInteressados([{ createdAt: "2026-10-02T22:00:00.000Z", nome: '=HYPERLINK("http://x","clique")', email: "a@b.test", telefone: "+5531988887777", empresa: 'Estúdio "Luz"', mensagem: "linha 1\nlinha 2", origem: null, campanha: "@promo" }])
    expect(csv.startsWith("﻿")).toBe(true)
    const [, linha] = csv.slice(1).split("\r\n")
    expect(linha).toContain(`"'=HYPERLINK(""http://x"",""clique"")"`)
    expect(linha).toContain(`"'+5531988887777"`)
    expect(linha).toContain(`"'@promo"`)
    expect(linha).toContain(`"Estúdio ""Luz"""`)
    expect(linha).toContain('"linha 1\nlinha 2"')
  })
})
