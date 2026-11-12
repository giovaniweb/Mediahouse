import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// O vídeo final da gravação externa subido no card (Giovani, 04/11/2026: "AQUI
// TEM QUE TER UM LUGAR DE FAZER UPLOAD"). O card usa o envio de Demandas: a
// URL assinada (`upload-url`) e o registro (`upload-video`, tipo final). Aqui,
// rotas reais e banco real: o registro libera o passo sem link, a página do
// cliente mostra e baixa o vídeo sem login, e o WhatsApp do cliente leva um
// link que abre. Só a sessão, os avisos em segundo plano e o armazenamento são
// simulados (não há Storage no teste; os bytes não importam aqui).
const { estado, tarefas } = vi.hoisted(() => ({
  estado: { sessao: null as null | { user: { id: string; organizacaoId: string; tipo: string; papel: string; name: string } } },
  tarefas: [] as { rotulo: string; tarefa: () => Promise<unknown> }[],
}))
vi.mock("@/lib/auth", () => ({ auth: async () => estado.sessao }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/notificar", () => ({ emSegundoPlano: (tarefa: () => Promise<unknown>, rotulo: string) => { tarefas.push({ rotulo, tarefa }) } }))
// A conferência de tamanho e tipo no Storage tem teste próprio (tests/unit/onda1-portas).
vi.mock("@/lib/midia-limite", () => ({ conferirUpload: async () => null, recusarUploads: async () => null }))
vi.mock("@/lib/transcode", () => ({ precisaTranscodeConferindo: async () => false, enqueueTranscode: async () => false }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { PRESETS } from "@/lib/permissoes"
import { PATCH as registrarVideo } from "@/app/api/demandas/[id]/upload-video/route"
import { PATCH as mover } from "@/app/api/demandas/[id]/status/route"
import { GET as abrirCard, PUT as editarCard } from "@/app/api/demandas/[id]/route"
import { patchDosBrutos, statusAoGravarMaterial } from "@/lib/etapas-da-gravacao"
import { GET as acompanhar } from "@/app/api/publico/demanda/[token]/route"
import { GET as eu } from "@/app/api/me/route"
import { podeLerMidia } from "@/lib/midia-acesso"
import { decryptSecret } from "@/lib/secret-crypto"
import { artesLigadas, familiaDaSaida } from "@/lib/avisos-arte"

const p = `video-final-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const admin = `${p}-admin`, vm = `${p}-vm`, vmLogin = `${p}-vm-login`
const telCliente = `5541${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function como(id: string, papel: string) {
  estado.sessao = { user: { id, organizacaoId: org, tipo: papel, papel, name: id } }
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const subido = (id: string, nome = "1730000000000.mp4") => `/api/midia/org/${org}/videos/${id}/${nome}`
const caminho = (url: string) => url.replace(/^\/api\/midia\//, "")

/** Uma gravação na edição, nossa, com o link público que ela já nasce tendo. */
async function naEdicao(publicTokenAtivo = true) {
  const id = `${p}-${randomUUID().slice(0, 6)}`
  const token = `tok-${randomUUID()}`
  await db.demanda.create({ data: {
    id, organizacaoId: org, codigo: id, titulo: "Gravação na clínica", descricao: "Entrega de equipamento.",
    area: "audiovisual", departamento: "eventos", tipoVideo: "cobertura_evento", cidade: "Curitiba",
    solicitanteId: admin, videomakerId: vm, edicaoPor: "equipe", statusInterno: "editando", statusVisivel: "edicao",
    clienteFinalNome: "Dr. Carlos", clienteFinalTelefone: telCliente, linkBrutos: "https://drive.example/brutos",
    publicToken: token, publicTokenAtivo,
  } })
  return { id, token }
}

const registrar = (id: string, corpo: object) => registrarVideo(
  new NextRequest(`http://localhost/api/demandas/${id}/upload-video`, { method: "PATCH", body: JSON.stringify(corpo) }), params(id))
const moverPara = (id: string, statusInterno: string) => mover(
  new NextRequest(`http://localhost/api/demandas/${id}/status`, { method: "PATCH", body: JSON.stringify({ statusInterno, origem: "manual" }) }), params(id))
async function pagina(token: string) {
  const res = await acompanhar(new NextRequest(`http://localhost/api/publico/demanda/${token}`), { params: Promise.resolve({ token }) })
  expect(res.status).toBe(200)
  return (await res.json()).demanda as { linkFinal: string; arquivos: { url: string; urlDownload: string; nomeArquivo: string }[]; gravacao: { situacao: string; videoPronto: boolean } }
}
async function rodarSegundoPlano() {
  for (const t of tarefas.splice(0)) await t.tarefa()
}
const doCliente = async (id: string) => (await db.saidaWhatsapp.findMany({ where: { organizacaoId: org, referencia: id, destinatarioTipo: "cliente" }, select: { conteudoCifrado: true } }))
  .map((s) => decryptSecret(s.conteudoCifrado!))

beforeAll(async () => {
  // A fila do WhatsApp cifra o texto; e o link vai com o endereço do app.
  vi.stubEnv("NEXTAUTH_SECRET", "segredo-so-do-teste")
  vi.stubEnv("NEXTAUTH_URL", "https://nuflow.test/")
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  await db.usuario.create({ data: { id: admin, nome: "Débora", email: `${admin}@exemplo.test`, tipo: "admin", senhaHash: "sem-login" } })
  await db.usuarioOrganizacao.create({ data: { usuarioId: admin, organizacaoId: org, areas: ["audiovisual"], papel: "admin" } })
  await db.videomaker.create({ data: { id: vm, nome: "Alan" } })
  await db.videomakerOrganizacao.create({ data: { organizacaoId: org, videomakerId: vm, tipoContrato: "externo" } })
  // O videomaker externo com login, como o #118 deixou: preset do papel.
  await db.usuario.create({ data: { id: vmLogin, nome: "Gabriel", email: `${vmLogin}@exemplo.test`, tipo: "videomaker", senhaHash: "sem-login" } })
  await db.usuarioOrganizacao.create({ data: { usuarioId: vmLogin, organizacaoId: org, areas: ["audiovisual"], papel: "videomaker" } })
  await db.permissaoUsuario.create({ data: { usuarioId: vmLogin, organizacaoId: org, ...PRESETS.videomaker } })
})

beforeEach(() => { tarefas.length = 0; estado.sessao = null })

afterAll(async () => {
  const ids = (await db.demanda.findMany({ where: { organizacaoId: org }, select: { id: true } })).map((d) => d.id)
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: org } })
  await db.agenteExecucao.deleteMany({ where: { organizacaoId: org } })
  await db.notaFiscalUpload.deleteMany({ where: { demandaId: { in: ids } } })
  await db.custoVideomaker.deleteMany({ where: { organizacaoId: org } })
  await db.arquivo.deleteMany({ where: { demandaId: { in: ids } } })
  await db.historicoStatus.deleteMany({ where: { demandaId: { in: ids } } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.videomakerOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.videomaker.deleteMany({ where: { id: vm } })
  await db.permissaoUsuario.deleteMany({ where: { organizacaoId: org } })
  await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } })
  await db.usuario.deleteMany({ where: { id: { in: [admin, vmLogin] } } })
  vi.unstubAllEnvs()
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()])
})

describe("vídeo final subido no card da gravação", () => {
  it("o arquivo vira o vídeo final, com o nome de quem subiu, e o passo anda sem link", async () => {
    const { id } = await naEdicao()
    const url = subido(id)
    como(admin, "admin")
    const res = await registrar(id, { url, tipo: "final", nomeArquivo: "Dr Carlos final.mp4" })
    expect(res.status).toBe(200)
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).linkFinal).toBe(url)
    expect(await db.arquivo.findMany({ where: { demandaId: id }, select: { tipoArquivo: true, url: true, nomeArquivo: true } }))
      .toEqual([{ tipoArquivo: "final", url, nomeArquivo: "Dr Carlos final.mp4" }])

    // "Pronto para enviar ao cliente" sem link no corpo: o vídeo já está no card.
    expect((await moverPara(id, "aprovado")).status).toBe(200)
    expect((await db.demanda.findUniqueOrThrow({ where: { id } })).statusInterno).toBe("aprovado")
  })

  it("no \"Enviar ao cliente\", a página do link público mostra e baixa o vídeo, sem login", async () => {
    const { id, token } = await naEdicao()
    const url = subido(id)
    como(admin, "admin")
    expect((await registrar(id, { url, tipo: "final", nomeArquivo: "Dr Carlos final.mp4" })).status).toBe(200)
    expect((await moverPara(id, "aprovado")).status).toBe(200)

    estado.sessao = null
    const d = await pagina(token)
    expect(d.gravacao).toMatchObject({ situacao: "Vídeo pronto, falta enviar ao cliente", videoPronto: true })
    expect(d.arquivos).toEqual([expect.objectContaining({
      nomeArquivo: "Dr Carlos final.mp4", url: `${url}?token=${token}`, urlDownload: `${url}?token=${token}&download=1`,
    })])
    // O endereço com o token abre para quem não tem conta; sem ele, ou com outro, não.
    expect(await podeLerMidia(caminho(url), token)).toBe(true)
    expect(await podeLerMidia(caminho(url), null)).toBe(false)
    expect(await podeLerMidia(caminho(url), `tok-${randomUUID()}`)).toBe(false)
  })

  it("marcado como enviado, o WhatsApp do cliente leva o link que abre sem login", async () => {
    const { id, token } = await naEdicao()
    const url = subido(id)
    como(admin, "admin")
    expect((await registrar(id, { url, tipo: "final", nomeArquivo: "final.mp4" })).status).toBe(200)
    expect((await moverPara(id, "aprovado")).status).toBe(200)
    expect((await moverPara(id, "entregue_cliente")).status).toBe(200)
    await rodarSegundoPlano()

    const [texto, ...outros] = await doCliente(id)
    expect(outros).toEqual([])
    const link = `https://nuflow.test${url}?token=${encodeURIComponent(token)}`
    expect(texto).toContain(link)
    estado.sessao = null
    expect(await podeLerMidia(caminho(new URL(link).pathname), new URL(link).searchParams.get("token"))).toBe(true)
  })

  it("sem link público ativo, o cliente não recebe um endereço que pede login", async () => {
    const { id } = await naEdicao(false)
    como(admin, "admin")
    expect((await registrar(id, { url: subido(id), tipo: "final" })).status).toBe(200)
    expect((await moverPara(id, "aprovado")).status).toBe(200)
    expect((await moverPara(id, "entregue_cliente")).status).toBe(200)
    await rodarSegundoPlano()
    expect(await doCliente(id)).toEqual([])
  })

  it("link colado continua valendo: vai ao cliente como antes", async () => {
    const { id } = await naEdicao()
    como(admin, "admin")
    await db.demanda.update({ where: { id }, data: { linkFinal: "https://drive.example/final", statusInterno: "aprovado", statusVisivel: "para_postar" } })
    expect((await moverPara(id, "entregue_cliente")).status).toBe(200)
    await rodarSegundoPlano()
    expect(await doCliente(id)).toEqual([expect.stringContaining("https://drive.example/final")])
  })

  // Card com dois ou mais vídeos finais (as miniaturas do #135): o aviso de
  // vídeo enviado levava o link de um vídeo só. Leva a página de acompanhamento,
  // onde a página mostra todos. Nunca com arte, nem com as artes ligadas (#138).
  it("dois vídeos finais: o cliente recebe a página com os dois, sem arte", async () => {
    vi.stubEnv("WHATSAPP_ARTES", "ligado")
    const { id, token } = await naEdicao()
    como(admin, "admin")
    expect((await registrar(id, { url: subido(id, "1730000000001.mp4"), tipo: "final", nomeArquivo: "parte 1.mp4" })).status).toBe(200)
    expect((await registrar(id, { url: subido(id, "1730000000002.mp4"), tipo: "final", nomeArquivo: "parte 2.mp4" })).status).toBe(200)
    // A página que vai ao cliente mostra os dois.
    expect((await pagina(token)).arquivos.map((a) => a.nomeArquivo)).toEqual(["parte 1.mp4", "parte 2.mp4"])
    expect((await moverPara(id, "aprovado")).status).toBe(200)
    expect((await moverPara(id, "entregue_cliente")).status).toBe(200)
    await rodarSegundoPlano()

    const [texto, ...outros] = await doCliente(id)
    expect(outros).toEqual([])
    expect(texto).toBe(`Olá! Os 2 vídeos da sua gravação estão prontos:\nhttps://nuflow.test/d/${token}`)
    expect(texto).not.toContain("/api/midia/")
    const saidas = await db.saidaWhatsapp.findMany({ where: { organizacaoId: org, referencia: id, destinatarioTipo: "cliente" }, select: { chave: true, destinatarioTipo: true, origem: true, regraContexto: true } })
    expect(saidas).toHaveLength(1)
    // O cliente tem chave própria: a arte da equipe ligada não liga a dele.
    expect(artesLigadas(telCliente, "cliente")).toBe(false)
    // A arte dele, quando ligada, é a séria do vídeo pronto.
    expect(familiaDaSaida(saidas[0])).toMatch(/^(medico|medica|clinica)_video$/)
    vi.unstubAllEnvs()
    vi.stubEnv("NEXTAUTH_SECRET", "segredo-so-do-teste")
    vi.stubEnv("NEXTAUTH_URL", "https://nuflow.test/")
  })

  it("trocado um dos dois, sobra um: volta o link do vídeo, como antes", async () => {
    const { id, token } = await naEdicao()
    como(admin, "admin")
    expect((await registrar(id, { url: subido(id, "1730000000001.mp4"), tipo: "final" })).status).toBe(200)
    expect((await registrar(id, { url: subido(id, "1730000000002.mp4"), tipo: "final" })).status).toBe(200)
    await db.arquivo.deleteMany({ where: { demandaId: id, url: subido(id, "1730000000001.mp4") } })
    expect((await moverPara(id, "aprovado")).status).toBe(200)
    expect((await moverPara(id, "entregue_cliente")).status).toBe(200)
    await rodarSegundoPlano()
    const [texto] = await doCliente(id)
    expect(texto).toContain(`https://nuflow.test${subido(id, "1730000000002.mp4")}?token=${encodeURIComponent(token)}`)
    expect(texto).not.toContain("/d/")
  })

  it("o videomaker externo não ganha o envio: o card só oferece a quem edita a demanda", async () => {
    // O card mostra "Enviar arquivo" só com podeEditar (gestão ou editarDemanda,
    // lido de /api/me). O preset do videomaker não edita demanda.
    como(vmLogin, "videomaker")
    const res = await eu()
    expect(res.status).toBe(200)
    expect((await res.json()).permissoes).toMatchObject({ editarDemanda: false })
  })
})

// Giovani, 04/11/2026: "2 lugar para anexar a midia, temos que simplificar".
// A mídia entra só pelo "Agora", que grava pelas mesmas rotas do card: o PUT
// do link e, se completou o material, o PATCH do status (avancarGravacao).
describe("um lugar só para a mídia: o \"Agora\"", () => {
  const editar = (id: string, corpo: object) => editarCard(
    new NextRequest(`http://localhost/api/demandas/${id}`, { method: "PUT", body: JSON.stringify(corpo) }), params(id))

  /** Gravou; falta o que o videomaker entrega. */
  async function noMaterial(edicaoPor: "equipe" | "sem_edicao" | "videomaker", extra: { linkBrutos?: string } = {}) {
    const id = `${p}-${randomUUID().slice(0, 6)}`
    await db.demanda.create({ data: {
      id, organizacaoId: org, codigo: id, titulo: "Gravação na clínica", descricao: "Entrega de equipamento.",
      area: "audiovisual", departamento: "eventos", tipoVideo: "cobertura_evento", cidade: "Curitiba",
      solicitanteId: admin, videomakerId: vm, edicaoPor, statusInterno: "captacao_realizada", statusVisivel: "producao",
      ...extra,
    } })
    return id
  }

  /** O que o "Agora" faz ao salvar um link (PassoDaGravacao: gravar). */
  async function gravarNoAgora(id: string, patch: { linkBrutos?: string; linkFinal?: string }) {
    const job = await db.demanda.findUniqueOrThrow({ where: { id } })
    const status = statusAoGravarMaterial(job, patch)
    expect((await editar(id, patch)).status).toBe(200)
    if (status) expect((await moverPara(id, status)).status).toBe(200)
    return db.demanda.findUniqueOrThrow({ where: { id } })
  }

  it("os brutos colados no \"Agora\" ficam no card e a gravação vai para a edição", async () => {
    const id = await noMaterial("equipe")
    como(admin, "admin")
    const d = await gravarNoAgora(id, patchDosBrutos({ edicaoPor: "equipe" }, "https://drive.example/brutos"))
    expect(d).toMatchObject({ linkBrutos: "https://drive.example/brutos", linkFinal: null, statusInterno: "brutos_enviados" })
  })

  it("sem edição, os brutos viram o vídeo final e a gravação vai direto para o envio", async () => {
    const id = await noMaterial("sem_edicao")
    como(admin, "admin")
    const d = await gravarNoAgora(id, patchDosBrutos({ edicaoPor: "sem_edicao" }, "https://drive.example/brutos"))
    expect(d).toMatchObject({ linkBrutos: "https://drive.example/brutos", linkFinal: "https://drive.example/brutos", statusInterno: "aprovado" })
  })

  it("edição do videomaker: o vídeo pronto subido no material completa a entrega", async () => {
    const id = await noMaterial("videomaker", { linkBrutos: "https://drive.example/brutos" })
    const url = subido(id)
    como(admin, "admin")
    expect((await registrar(id, { url, tipo: "final", nomeArquivo: "pronto.mp4" })).status).toBe(200)
    const job = await db.demanda.findUniqueOrThrow({ where: { id } })
    // O "Agora" decide pelo card de antes do envio (sem o vídeo) e o endereço devolvido.
    expect(statusAoGravarMaterial({ ...job, linkFinal: null }, { linkFinal: url })).toBe("aprovado")
    expect((await moverPara(id, "aprovado")).status).toBe(200)
    expect(await db.demanda.findUniqueOrThrow({ where: { id } })).toMatchObject({ linkFinal: url, statusInterno: "aprovado" })
  })

  it("\"Trocar\" fora do material só troca o link: o passo fica onde está", async () => {
    const { id } = await naEdicao()
    como(admin, "admin")
    const d = await gravarNoAgora(id, patchDosBrutos({ edicaoPor: "equipe" }, "https://drive.example/brutos-certos"))
    expect(d).toMatchObject({ linkBrutos: "https://drive.example/brutos-certos", statusInterno: "editando" })
  })

  it("\"Editar\" e salvar o card da gravação não mexe nos links (eles não têm campo ali)", async () => {
    const { id } = await naEdicao()
    const url = subido(id)
    como(admin, "admin")
    expect((await registrar(id, { url, tipo: "final" })).status).toBe(200)
    // O corpo do salvar() do card na gravação externa: sem linkBrutos e linkFinal.
    expect((await editar(id, { cidade: "Londrina", dataLimite: null, videomakerId: vm, editorId: null, localGravacao: null, classificacao: null, produtoId: null })).status).toBe(200)
    expect(await db.demanda.findUniqueOrThrow({ where: { id } })).toMatchObject({ cidade: "Londrina", linkBrutos: "https://drive.example/brutos", linkFinal: url })
  })
})

// Giovani, 05/11/2026: "crie uma thumbnail ... se tiver mais de um vídeo, coloca
// mais de uma thumbnail ... abrir ali ampliado no sistema". O card e a página de
// quem pediu mostram uma miniatura por vídeo; a capa vem do envio e abre, na
// página, com o mesmo token do link público.
describe("as miniaturas: mais de um vídeo no card", () => {
  const capa = (id: string, nome: string) => `/api/midia/org/${org}/thumbnails/${id}/${nome}`
  const abrir = async (id: string) => {
    const res = await abrirCard(new NextRequest(`http://localhost/api/demandas/${id}`), params(id))
    expect(res.status).toBe(200)
    return (await res.json()).demanda as { linkFinal: string | null; arquivos: { id: string; tipoArquivo: string; url: string; nomeArquivo: string; thumbnailUrl: string | null }[] }
  }

  it("dois vídeos: o card traz a capa de cada um e a página de quem pediu mostra os dois, com a capa que abre com o token", async () => {
    const { id, token } = await naEdicao()
    como(admin, "admin")
    expect((await registrar(id, { url: subido(id, "corte-1.mp4"), tipo: "final", nomeArquivo: "corte 1.mp4", thumbnailUrl: capa(id, "c1.jpg") })).status).toBe(200)
    expect((await registrar(id, { url: subido(id, "corte-2.mp4"), tipo: "final", nomeArquivo: "corte 2.mp4", thumbnailUrl: capa(id, "c2.jpg") })).status).toBe(200)
    const card = await abrir(id)
    expect(card.arquivos.filter((a) => a.tipoArquivo === "final").map((a) => [a.nomeArquivo, a.thumbnailUrl]))
      .toEqual([["corte 1.mp4", capa(id, "c1.jpg")], ["corte 2.mp4", capa(id, "c2.jpg")]])
    expect((await moverPara(id, "aprovado")).status).toBe(200)

    estado.sessao = null
    const d = await pagina(token)
    expect(d.arquivos.map((a) => a.nomeArquivo)).toEqual(["corte 1.mp4", "corte 2.mp4"])
    const comCapa = d.arquivos as unknown as { thumbnailUrl: string }[]
    expect(comCapa.map((a) => a.thumbnailUrl)).toEqual([`${capa(id, "c1.jpg")}?token=${token}`, `${capa(id, "c2.jpg")}?token=${token}`])
    expect(await podeLerMidia(caminho(capa(id, "c2.jpg")), token)).toBe(true)
    expect(await podeLerMidia(caminho(capa(id, "c2.jpg")), null)).toBe(false)
  })

  it("trocar ou tirar um vídeo apaga o registro dele: o card e a página param de mostrar, e o linkFinal vai para o que ficou", async () => {
    const { id, token } = await naEdicao()
    como(admin, "admin")
    await registrar(id, { url: subido(id, "velho.mp4"), tipo: "final", nomeArquivo: "velho.mp4" })
    await registrar(id, { url: subido(id, "novo.mp4"), tipo: "final", nomeArquivo: "novo.mp4" })
    const velho = (await abrir(id)).arquivos.find((a) => a.nomeArquivo === "velho.mp4")!
    // O que o card faz no "Trocar" (depois de subir o novo) e no "Tirar".
    expect((await registrar(id, { url: null, tipo: "final", arquivoId: velho.id })).status).toBe(200)
    const card = await abrir(id)
    expect(card.arquivos.filter((a) => a.tipoArquivo === "final").map((a) => a.nomeArquivo)).toEqual(["novo.mp4"])
    expect(card.linkFinal).toBe(subido(id, "novo.mp4"))
    expect((await moverPara(id, "aprovado")).status).toBe(200)
    estado.sessao = null
    expect((await pagina(token)).arquivos.map((a) => a.nomeArquivo)).toEqual(["novo.mp4"])
  })

  it("link do Drive colado vira vídeo do card, com o nome do Drive (não \"view\") e o link que abre", async () => {
    const { id, token } = await naEdicao()
    const linkDrive = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing"
    como(admin, "admin")
    // O que o card manda ao colar o link (DemandaDetalhe: registrarVideoDaGravacao).
    expect((await registrar(id, { url: linkDrive, tipo: "final", nomeArquivo: "Vídeo no Drive" })).status).toBe(200)
    const card = await abrir(id)
    expect(card.linkFinal).toBe(linkDrive)
    expect(card.arquivos.filter((a) => a.tipoArquivo === "final").map((a) => [a.url, a.nomeArquivo])).toEqual([[linkDrive, "Vídeo no Drive"]])
    expect((await moverPara(id, "aprovado")).status).toBe(200)
    estado.sessao = null
    expect((await pagina(token)).arquivos.map((a) => a.url)).toEqual([linkDrive])
  })
})
