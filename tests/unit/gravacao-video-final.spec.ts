import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// O vídeo final da gravação externa subido no card (Giovani, 04/11/2026: "AQUI
// TEM QUE TER UM LUGAR DE FAZER UPLOAD"). Três coisas puras: o envio (o mesmo
// de Demandas), o link que abre para o cliente sem login e o que a página de
// acompanhamento e o aviso de WhatsApp fazem com ele.
const compat = vi.hoisted(() => ({ resultado: { compativel: true } as { compativel: boolean; motivo?: string; comoResolver?: string } }))
vi.mock("@/lib/video-compat", () => ({ analisarVideoDoUpload: async () => compat.resultado }))

import { enviarVideo, LIMITE_VIDEO_NA_TELA_MB } from "@/lib/upload-video"
import { linkDoVideoParaOCliente, videoNoNuflow } from "@/lib/etapas-da-gravacao"
import { acompanhamentoDaGravacao, type GravacaoParaAcompanhar } from "@/lib/acompanhamento-gravacao"
import { mensagensDoEvento, type DadosDoAviso } from "@/lib/avisos-gravacao-textos"

const subido = "/api/midia/org/org-1/videos/dem-1/1730000000000.mp4"

describe("o link do vídeo que vai para o cliente", () => {
  it("o arquivo subido ganha o endereço completo e o token do link público", () => {
    expect(videoNoNuflow(subido)).toBe(true)
    expect(linkDoVideoParaOCliente(subido, "tok_abc-123", "https://nuflow.space/"))
      .toBe(`https://nuflow.space${subido}?token=tok_abc-123`)
  })
  it("link de fora (Drive) segue como está, com ou sem token", () => {
    expect(videoNoNuflow("https://drive.google.com/file/d/x/view")).toBe(false)
    expect(linkDoVideoParaOCliente(" https://drive.google.com/file/d/x/view ", null, "https://nuflow.space")).toBe("https://drive.google.com/file/d/x/view")
  })
  it("arquivo subido sem link público ativo não vira link que pede login", () => {
    expect(linkDoVideoParaOCliente(subido, null, "https://nuflow.space")).toBeNull()
    expect(linkDoVideoParaOCliente(null, "tok", "https://nuflow.space")).toBeNull()
  })
})

describe("a página de quem pediu mostra o vídeo do \"Enviar ao cliente\" em diante", () => {
  const hoje = "2026-11-04"
  const g = (o: Partial<GravacaoParaAcompanhar>): GravacaoParaAcompanhar => ({
    statusInterno: "editando", statusVisivel: "edicao", titulo: "Gravação", clienteFinalNome: "Dr. Carlos", edicaoPor: "equipe",
    videomakerId: "vm", videomaker: { nome: "Alan" }, dataCaptacao: "2026-09-28T16:00:00Z", ...o,
  })
  it("na edição, ainda não", () => {
    expect(acompanhamentoDaGravacao(g({}), hoje).videoPronto).toBe(false)
  })
  it("pronto para enviar e enviado, sim", () => {
    expect(acompanhamentoDaGravacao(g({ statusInterno: "aprovado", statusVisivel: "para_postar", linkFinal: subido }), hoje))
      .toMatchObject({ situacao: "Vídeo pronto, falta enviar ao cliente", videoPronto: true })
    expect(acompanhamentoDaGravacao(g({ statusInterno: "entregue_cliente", statusVisivel: "finalizado", linkFinal: subido }), hoje).videoPronto).toBe(true)
  })
  it("cancelada, recusada ou em análise, não", () => {
    expect(acompanhamentoDaGravacao(g({ statusInterno: "encerrado", statusVisivel: "finalizado" }), hoje).videoPronto).toBe(false)
    expect(acompanhamentoDaGravacao(g({ statusInterno: "encerrado", statusVisivel: "entrada" }), hoje).videoPronto).toBe(false)
    expect(acompanhamentoDaGravacao(g({ statusInterno: "aguardando_aprovacao_interna", statusVisivel: "entrada" }), hoje).videoPronto).toBe(false)
  })
})

describe("o WhatsApp do cliente quando o vídeo é enviado", () => {
  const d: DadosDoAviso = { codigo: "VOP-26-7169", titulo: "Gravação", statusInterno: "entregue_cliente", clienteFinalNome: "Dr. Carlos" }
  it("com o arquivo subido, vai o link com token", () => {
    const link = `https://nuflow.space${subido}?token=tok`
    expect(mensagensDoEvento("concluida", { ...d, linkFinal: subido, linkVideoCliente: link }).cliente).toContain(link)
  })
  it("sem o link pronto, o endereço de dentro (que pede login) não vai", () => {
    expect(mensagensDoEvento("concluida", { ...d, linkFinal: subido }).cliente).toBeUndefined()
    expect(mensagensDoEvento("concluida", { ...d, linkFinal: subido, linkVideoCliente: null }).cliente).toBeUndefined()
  })
  it("link colado (Drive) segue indo como antes", () => {
    expect(mensagensDoEvento("concluida", { ...d, linkFinal: "https://drive/final" }).cliente).toContain("https://drive/final")
  })
})

// ── O envio: o mesmo de Demandas, agora com o progresso ─────────────────────
type Chamada = { metodo: string; url: string; corpo?: unknown }
const MB = 1024 * 1024

class XhrFalso {
  static respostas: { status: number; texto?: string }[] = []
  static enviados: { url: string; tipo: string | null; corpo: unknown }[] = []
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  status = 0
  responseText = ""
  private url = ""
  private tipo: string | null = null
  open(_metodo: string, url: string) { this.url = url }
  setRequestHeader(nome: string, valor: string) { if (nome === "Content-Type") this.tipo = valor }
  send(corpo: unknown) {
    XhrFalso.enviados.push({ url: this.url, tipo: this.tipo, corpo })
    const r = XhrFalso.respostas.shift() ?? { status: 200 }
    this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 })
    this.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 4 })
    this.status = r.status
    this.responseText = r.texto ?? ""
    queueMicrotask(() => this.onload?.())
  }
}

describe("enviarVideo", () => {
  let chamadas: Chamada[]
  let registro: { status: number; corpo: unknown }

  beforeEach(() => {
    chamadas = []
    registro = { status: 200, corpo: { ok: true } }
    compat.resultado = { compativel: true }
    XhrFalso.respostas = []
    XhrFalso.enviados = []
    vi.stubGlobal("XMLHttpRequest", XhrFalso)
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ metodo: init?.method ?? "GET", url, corpo: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.includes("/upload-url")) return Response.json({ uploadUrl: "https://storage.test/assinada", publicUrl: subido })
      return Response.json(registro.corpo, { status: registro.status })
    }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  const video = (nome = "Dr Carlos final.mp4") => new File([new Uint8Array(4)], nome, { type: "video/mp4" })

  it("pede a URL, sobe direto contando o progresso e registra com o nome do arquivo", async () => {
    const progresso: number[] = []
    await expect(enviarVideo("dem-1", video(), "final", { nomeArquivo: "Dr Carlos final.mp4", onProgress: (p) => progresso.push(p) })).resolves.toBe(subido)
    expect(chamadas.map((c) => `${c.metodo} ${c.url}`)).toEqual([
      "GET /api/demandas/dem-1/upload-url?tipo=final&contentType=video%2Fmp4",
      "PATCH /api/demandas/dem-1/upload-video",
    ])
    expect(XhrFalso.enviados).toEqual([expect.objectContaining({ url: "https://storage.test/assinada", tipo: "video/mp4" })])
    expect(progresso).toEqual([25, 100])
    expect(chamadas[1].corpo).toEqual({ url: subido, tipo: "final", nomeArquivo: "Dr Carlos final.mp4" })
  })

  it("Demandas segue sem mandar o nome (o envio é o mesmo, sem mudar o que já grava)", async () => {
    await enviarVideo("dem-1", video(), "brutos")
    expect(chamadas[1].corpo).toEqual({ url: subido, tipo: "brutos" })
  })

  it(`acima de ${LIMITE_VIDEO_NA_TELA_MB} MB a tela recusa antes de subir`, async () => {
    const grande = { name: "grande.mp4", type: "video/mp4", size: (LIMITE_VIDEO_NA_TELA_MB + 1) * MB } as File
    await expect(enviarVideo("dem-1", grande, "final")).rejects.toThrow(`Limite máximo: ${LIMITE_VIDEO_NA_TELA_MB} MB`)
    expect(chamadas).toEqual([])
  })

  it("vídeo que pode não abrir no navegador do cliente: pergunta, e o não cancela", async () => {
    compat.resultado = { compativel: false, motivo: "HEVC", comoResolver: "Exporte em H.264" }
    const confirmar = vi.fn(() => false)
    await expect(enviarVideo("dem-1", video("x.mov"), "final", { confirmar })).rejects.toThrow("Envio cancelado")
    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining("Exporte em H.264"))
    expect(chamadas).toEqual([])
  })

  it("o armazenamento recusou: a frase dele aparece", async () => {
    XhrFalso.respostas = [{ status: 413, texto: JSON.stringify({ message: "Payload too large" }) }]
    await expect(enviarVideo("dem-1", video(), "final")).rejects.toThrow("Falha no upload: Payload too large")
    expect(chamadas.map((c) => c.metodo)).toEqual(["GET"])
  })

  it("o servidor recusou o que chegou (tamanho, tipo): a frase do servidor aparece", async () => {
    registro = { status: 422, corpo: { error: "Arquivo grande demais (6 GB). O limite é 5 GB." } }
    await expect(enviarVideo("dem-1", video(), "final")).rejects.toThrow("O limite é 5 GB")
  })
})
