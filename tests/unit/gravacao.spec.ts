import { describe, it, expect } from "vitest"
import {
  cidadeDoEndereco, corpoDoNovoJob, descricaoDaGravacao, levarDoPedido, prioridadeDaGravacao,
  tituloDaGravacao, whatsappLegivel, type NovoJob,
} from "@/lib/gravacao"
import { quadroDoCard } from "@/lib/quadro-do-card"

const base: NovoJob = {
  tipo: "entrega_equipamento",
  cliente: " Clínica Dra. Solange ",
  clienteTelefone: "",
  endereco: "Rua XV de Novembro, 120, Centro, Curitiba - PR",
  data: "2026-10-30",
  hora: "14:00",
  temBrinde: false,
  brinde: "",
  levar: "",
  observacao: "",
  videomaker: "",
  acompanhante: null,
  linkBrutos: "",
  produtoIds: [],
}

describe("pedido de gravação", () => {
  it("título gerado: cliente e dia, sem o ano", () => {
    expect(tituloDaGravacao(" Clínica Dra. Solange ", "2026-10-30")).toBe("Gravação · Clínica Dra. Solange · 30/10")
  })

  it("descrição na ordem da mensagem do WhatsApp: tipo, cliente, onde, quando, brinde, levar", () => {
    expect(descricaoDaGravacao({ ...base, temBrinde: true, brinde: " Caixa mineira ", levar: "banner", observacao: " Depoimento " })).toBe([
      "Entrega de equipamento em Clínica Dra. Solange.",
      "Endereço: Rua XV de Novembro, 120, Centro, Curitiba - PR",
      "Data: 30/10/2026 às 14:00 (horário de Brasília)",
      "Brinde: Caixa mineira",
      "Levar: banner",
      "Observações: Depoimento",
    ].join("\n"))
  })

  it("brinde só na entrega de equipamento; marcado sem dizer qual, vale \"sim\"", () => {
    expect(levarDoPedido({ ...base, tipo: "demonstracao", temBrinde: true, brinde: "Caixa" })).toEqual({ temBrinde: false, brinde: null, levar: null })
    expect(levarDoPedido({ ...base, temBrinde: true, brinde: "  " })).toEqual({ temBrinde: true, brinde: null, levar: null })
    expect(descricaoDaGravacao({ ...base, temBrinde: true })).toContain("Brinde: sim")
    expect(corpoDoNovoJob({ ...base, temBrinde: true, brinde: "Caixa mineira", clienteTelefone: "19 98103-1327" }, "2026-10-20")).toMatchObject({
      tipoGravacao: "entrega_equipamento", temBrinde: true, brinde: "Caixa mineira", levar: null, clienteFinalTelefone: "19 98103-1327",
    })
  })

  it("quem acompanha entra na descrição, com o WhatsApp legível", () => {
    const d = descricaoDaGravacao(base, { id: "u1", nome: "Ana", telefone: "5541998765432" })
    expect(d.split("\n").at(-1)).toBe("Quem acompanha: Ana · WhatsApp (41) 99876-5432")
    expect(descricaoDaGravacao(base, { id: "u1", nome: "Ana" }).split("\n").at(-1)).toBe("Quem acompanha: Ana")
  })

  it("prioridade Alta só para gravação em até 2 dias", () => {
    const hoje = "2026-10-21"
    expect(prioridadeDaGravacao("2026-10-21", hoje)).toBe("alta")
    expect(prioridadeDaGravacao("2026-10-23", hoje)).toBe("alta")
    expect(prioridadeDaGravacao("2026-10-24", hoje)).toBe("normal")
    // Virada de mês sem fuso no caminho.
    expect(prioridadeDaGravacao("2026-11-02", "2026-10-31")).toBe("alta")
  })

  it("cidade sai do fim do endereço; sem vírgula, N/A", () => {
    expect(cidadeDoEndereco("Rua XV de Novembro, 120, Centro, Curitiba - PR")).toBe("Curitiba")
    expect(cidadeDoEndereco("Av. Paulista, 1000, São Paulo/SP, 01310-100")).toBe("São Paulo")
    expect(cidadeDoEndereco("Rua das Flores, 45")).toBe("N/A")
    expect(cidadeDoEndereco("Rua das Flores 45 Centro")).toBe("N/A")
  })

  it("WhatsApp legível", () => {
    expect(whatsappLegivel("41998765432")).toBe("(41) 99876-5432")
    expect(whatsappLegivel("+55 (41) 3333-4444")).toBe("(41) 3333-4444")
    expect(whatsappLegivel("")).toBeNull()
    expect(whatsappLegivel(null)).toBeNull()
  })
})

describe("corpo do + Novo Job", () => {
  it("cobertura do audiovisual, prazo na gravação e aprovação ao criar", () => {
    const corpo = corpoDoNovoJob(base, "2026-10-21")
    expect(corpo).toMatchObject({
      titulo: "Gravação · Clínica Dra. Solange · 30/10",
      area: "audiovisual",
      departamento: "eventos",
      tipoVideo: "cobertura_evento",
      cobertura: true,
      cidade: "Curitiba",
      prioridade: "normal",
      dataLimite: "2026-10-30T00:00:00.000Z",
      // 14:00 em Brasília é 17:00 UTC.
      dataEvento: "2026-10-30T17:00:00.000Z",
      dataCaptacao: "2026-10-30T17:00:00.000Z",
      localEvento: base.endereco,
      localGravacao: base.endereco,
      clienteFinalNome: "Clínica Dra. Solange",
      aprovarAoCriar: true,
    })
    // Nunca o departamento do modal de vídeo.
    expect(corpo.departamento).not.toBe("growth")
    // Sem pedir o que o formulário não pede.
    expect(corpo).not.toHaveProperty("classificacao")
    expect(corpo).not.toHaveProperty("formato")
    expect(corpo).not.toHaveProperty("videomakerId")
    expect(corpo).not.toHaveProperty("responsavelIds")
    expect(corpo.descricao.length).toBeGreaterThanOrEqual(10)
  })

  it("leva quem grava, quem acompanha, links e produtos", () => {
    const corpo = corpoDoNovoJob({
      ...base,
      videomaker: "vm:abc",
      acompanhante: { id: "u1", nome: "Ana", telefone: "41998765432" },
      referencia: "https://instagram.com/p/1",
      linkBrutos: " https://drive.google.com/x ",
      produtoIds: ["p1", "p2"],
    }, "2026-10-29")
    expect(corpo).toMatchObject({
      prioridade: "alta",
      videomakerId: "vm:abc",
      responsavelIds: ["u1"],
      referencia: "https://instagram.com/p/1",
      linkBrutos: "https://drive.google.com/x",
      produtoIds: ["p1", "p2"],
    })
  })

  it("sem videomaker, o job mora em Jobs (a regra única do quadro)", () => {
    const corpo = corpoDoNovoJob(base, "2026-10-21")
    expect(quadroDoCard({ tipoVideo: corpo.tipoVideo, departamento: corpo.departamento, videomakerId: null })).toBe("jobs")
  })
})
