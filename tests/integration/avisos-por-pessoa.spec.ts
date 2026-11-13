import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"

// Avisos por pessoa (12/11/2026), com banco real: a gestão escolhe o que cada
// pessoa recebe, e os três canais obedecem. A prova principal é a primeira:
// sem configuração, NADA muda.
const { sessao } = vi.hoisted(() => ({ sessao: { user: null as null | { id: string; organizacaoId: string; tipo: string; papel: string } } }))
vi.mock("@/lib/auth", () => ({ auth: async () => (sessao.user ? { user: sessao.user } : null) }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))

import { prismaBase as db } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { comOrg } from "@/lib/org-contexto"
import { criarSaida, processarSaidas, MOTIVO_DESLIGADO } from "@/lib/whatsapp-outbox"
import { encryptSecret } from "@/lib/secret-crypto"
import { filtrarEmails, podeAvisar } from "@/lib/preferencias-aviso"
import type { CategoriaAviso } from "@/lib/avisos-categorias"
import { estadoDoPerfil } from "@/lib/avisos-perfis"
import { spawnSync } from "node:child_process"
import { resumoDoFimDoDia } from "@/lib/resumo-fim-do-dia"
import { decryptSecret } from "@/lib/secret-crypto"
import { GET as lerAvisos, PUT as salvarAvisos } from "@/app/api/avisos-por-pessoa/route"
import { GET as sino } from "@/app/api/notificacoes/route"

const p = `avpessoa-${randomUUID().slice(0, 8)}`, org = `${p}-org`
const tel = () => `5541${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const gente = {
  giovani: { id: `${p}-giovani`, papel: "admin", email: `giovani@${p}.test`, telefone: tel() },
  thalisson: { id: `${p}-thalisson`, papel: "gestor", email: `thalisson@${p}.test`, telefone: tel() },
  debora: { id: `${p}-debora`, papel: "gestor", email: `debora@${p}.test`, telefone: tel() },
  luisa: { id: `${p}-luisa`, papel: "solicitante", email: `luisa@${p}.test`, telefone: tel() },
}
const cardDoThalisson = `${p}-d1`, cardDosOutros = `${p}-d2`, cardGrowthDaLuisa = `${p}-d3`
const http = vi.mocked(fetch)

const entrar = (quem: keyof typeof gente) => {
  const g = gente[quem]
  sessao.user = { id: g.id, organizacaoId: org, tipo: g.papel, papel: g.papel }
}
const saida = (quem: keyof typeof gente, e: { categoria?: CategoriaAviso; chave?: string; referencia?: string }) =>
  comOrg(org, () => db.$transaction((tx) => criarSaida(tx, {
    organizacaoId: org, origem: e.chave?.startsWith("grav:") ? "manual" : "legado", chave: e.chave ?? randomUUID(),
    referencia: e.referencia ?? "aviso", telefone: gente[quem].telefone, texto: "AVISO-SINTETICO",
    expiraEm: new Date(Date.now() + 86400_000), categoria: e.categoria,
  })))
const salvar = async (alvo: keyof typeof gente, categorias: object[]) => salvarAvisos(new NextRequest("http://localhost/api/avisos-por-pessoa", {
  method: "PUT", body: JSON.stringify({ usuarioId: gente[alvo].id, categorias }),
}))
const so = (ligadas: Partial<Record<CategoriaAviso, "tudo" | "meus" | "pedi">>) =>
  (["pedidos", "andamento", "comentarios", "gravacoes", "social", "eventos", "prazos", "resumos", "sistema"] as CategoriaAviso[]).map((categoria) => {
    const r = ligadas[categoria]
    return { categoria, sino: !!r, email: !!r, whatsapp: !!r, recorte: r ?? "tudo", travada: false }
  })
const alertasDoSino = async () => ((await (await sino()).json()) as { alertas: { tipoAlerta?: string; mensagem: string }[] }).alertas.map((a) => a.mensagem).sort()

beforeAll(async () => {
  vi.stubEnv("EMAIL_ENCRYPTION_KEY", "chave-sintetica-avisos-pessoa")
  vi.stubEnv("WHATSAPP_EVOLUTION_CONTRATO", "2.3.7")
  await db.organizacao.create({ data: { id: org, nome: p, slug: p } })
  for (const g of Object.values(gente)) {
    await db.usuario.create({ data: { id: g.id, nome: g.id, email: g.email, tipo: g.papel as "admin", telefone: g.telefone, senhaHash: "sem-login" } })
    await db.usuarioOrganizacao.create({ data: { usuarioId: g.id, organizacaoId: org, papel: g.papel as "admin",
      // A Luisa pede arte do Growth: sem a área, o sino por escopo (#150) já esconde o card dela.
      areas: g === gente.luisa ? ["audiovisual", "growth"] : ["audiovisual"] } })
  }
  await db.configWhatsapp.create({ data: { organizacaoId: org, instanceId: `${p}-inst`, instanceUrl: "https://example.invalid", apiKey: "api-nao-expor", ativo: true, webhookSecret: encryptSecret("segredo") } })
  for (const [id, gestorId] of [[cardDoThalisson, gente.thalisson.id], [cardDosOutros, gente.giovani.id]]) {
    await db.demanda.create({ data: {
      id, organizacaoId: org, codigo: `AV-${id.slice(-2)}`, titulo: `Card ${id.slice(-2)}`, descricao: "Teste.",
      area: "audiovisual", departamento: "audiovisual", tipoVideo: "institucional", cidade: "Curitiba",
      solicitanteId: gente.giovani.id, gestorId, statusInterno: "editando", statusVisivel: "producao",
    } })
  }
  // Arte do Growth (area design) que a Luisa pediu.
  await db.demanda.create({ data: {
    id: cardGrowthDaLuisa, organizacaoId: org, codigo: "GR-03", titulo: "Arte da campanha", descricao: "Teste.",
    area: "design", departamento: "growth", tipoVideo: "institucional", cidade: "Curitiba",
    solicitanteId: gente.luisa.id, statusInterno: "editando", statusVisivel: "producao",
  } })
})

beforeEach(async () => {
  http.mockReset(); http.mockResolvedValue(Response.json({ key: { id: randomUUID() } }))
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: org } })
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.preferenciaAviso.deleteMany({ where: { organizacaoId: org } })
})

afterAll(async () => {
  await db.jobAutomacao.deleteMany({ where: { organizacaoId: org } })
  await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.alertaIA.deleteMany({ where: { organizacaoId: org } })
  await db.eventoAuditoria.deleteMany({ where: { organizacaoId: org } }).catch(() => undefined)
  await db.preferenciaAviso.deleteMany({ where: { organizacaoId: org } })
  await db.demanda.deleteMany({ where: { organizacaoId: org } })
  await db.configWhatsapp.deleteMany({ where: { organizacaoId: org } })
  await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: org } })
  await db.organizacao.delete({ where: { id: org } }).catch(() => undefined)
  await db.usuario.deleteMany({ where: { id: { in: Object.values(gente).map((g) => g.id) } } })
  await Promise.all([db.$disconnect(), prismaAuth.$disconnect()]); vi.unstubAllEnvs()
})

describe("sem configuração, nada muda", () => {
  it("WhatsApp, e-mail e sino seguem iguais para todas as categorias", async () => {
    for (const categoria of ["pedidos", "andamento", "gravacoes", "prazos", "sistema"] as CategoriaAviso[]) {
      const s = await saida("thalisson", { categoria, referencia: cardDosOutros })
      expect(s.estado).toBe("aguardando")
      expect(s.conteudoCifrado).not.toBeNull()
    }
    expect(await db.jobAutomacao.count({ where: { organizacaoId: org } })).toBe(5)
    const emails = Object.values(gente).map((g) => g.email)
    expect(await comOrg(org, () => filtrarEmails(db, { organizacaoId: org, categoria: "andamento", demandaId: cardDosOutros }, emails))).toEqual(emails)
    await db.alertaIA.createMany({ data: [
      { organizacaoId: org, tipoAlerta: "nova_demanda_audiovisual", mensagem: "pedido" },
      { organizacaoId: org, tipoAlerta: "material_recebido", mensagem: "material" },
      { organizacaoId: org, tipoAlerta: "regra_prazo_vencido", mensagem: "prazo", demandaId: cardDosOutros },
      // Fora do sino para todos (pedido do Giovani): é ruído, continua em Alertas.
      { organizacaoId: org, tipoAlerta: "whatsapp_reconectou", mensagem: "reconectou" },
    ] })
    entrar("thalisson")
    expect(await alertasDoSino()).toEqual(["material", "pedido", "prazo"])
  })
})

describe("Thalisson: só as demandas, nos cards em que está", () => {
  it("andamento e prazos só dos cards dele; gravações não chegam; pedidos novos sim", async () => {
    entrar("giovani")
    const r = await salvar("thalisson", so({ pedidos: "tudo", andamento: "meus", comentarios: "meus", prazos: "meus", resumos: "tudo" }))
    expect(r.status).toBe(200)

    expect((await saida("thalisson", { categoria: "andamento", referencia: cardDoThalisson })).estado).toBe("aguardando")
    const fora = await saida("thalisson", { categoria: "andamento", referencia: cardDosOutros })
    expect(fora).toMatchObject({ estado: "cancelado", motivo: MOTIVO_DESLIGADO, conteudoCifrado: null, telefoneCifrado: null })
    expect((await saida("thalisson", { categoria: "pedidos" })).estado).toBe("aguardando")
    expect((await saida("thalisson", { chave: `grav:${cardDosOutros}:material:2026-11-12:operacao:abc`, referencia: cardDosOutros })).estado).toBe("cancelado")

    // A prova de que o desligado não sai: só os dois que passaram vão para a rede.
    await processarSaidas(org)
    expect(http).toHaveBeenCalledTimes(2)
    expect(http.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).text)).toEqual(["AVISO-SINTETICO", "AVISO-SINTETICO"])

    await db.alertaIA.createMany({ data: [
      { organizacaoId: org, tipoAlerta: "regra_prazo_vencido", mensagem: "prazo do card dele", demandaId: cardDoThalisson },
      { organizacaoId: org, tipoAlerta: "regra_prazo_vencido", mensagem: "prazo de outro card", demandaId: cardDosOutros },
      { organizacaoId: org, tipoAlerta: "material_recebido", mensagem: "material" },
      { organizacaoId: org, tipoAlerta: "nova_demanda_audiovisual", mensagem: "pedido" },
      { organizacaoId: org, tipoAlerta: "tipo_que_ainda_nao_existe", mensagem: "desconhecido passa" },
    ] })
    entrar("thalisson")
    expect(await alertasDoSino()).toEqual(["desconhecido passa", "pedido", "prazo do card dele"])
    // O Giovani, sem configuração, continua vendo tudo.
    entrar("giovani")
    expect(await alertasDoSino()).toHaveLength(5)
  })
})

describe("Débora: só os avisos dos videomakers", () => {
  it("gravações chegam nos três canais; o resto não", async () => {
    entrar("giovani")
    expect((await salvar("debora", so({ gravacoes: "tudo" }))).status).toBe(200)
    expect((await saida("debora", { chave: `grav:${cardDosOutros}:confirmada:2026-11-12:operacao:abc`, referencia: cardDosOutros })).estado).toBe("aguardando")
    expect((await saida("debora", { categoria: "andamento", referencia: cardDosOutros })).estado).toBe("cancelado")
    expect((await saida("debora", { categoria: "pedidos" })).estado).toBe("cancelado")
    // Sem categoria (senha, convite, envio à mão): sempre sai.
    expect((await saida("debora", {})).estado).toBe("aguardando")
    const emails = Object.values(gente).map((g) => g.email)
    expect(await comOrg(org, () => filtrarEmails(db, { organizacaoId: org, categoria: "gravacoes" }, emails))).toEqual(emails)
    expect(await comOrg(org, () => filtrarEmails(db, { organizacaoId: org, categoria: "andamento" }, emails))).toEqual(emails.filter((e) => e !== gente.debora.email))
    // E-mail que não é de pessoa da empresa (financeiro, compras) passa sempre.
    expect(await comOrg(org, () => filtrarEmails(db, { organizacaoId: org, categoria: "andamento" }, ["compras@fora.test"]))).toEqual(["compras@fora.test"])
  })
})

describe("perfis do Giovani: setor e só o que pedi", () => {
  it("Thalisson com 'Tudo do meu setor' no Growth: card do Growth sim, do Audiovisual só o dele", async () => {
    entrar("giovani")
    const perfil = estadoDoPerfil("setor", "growth").map((e) => ({ ...e, travada: false }))
    expect((await salvar("thalisson", perfil)).status).toBe(200)
    expect((await saida("thalisson", { categoria: "andamento", referencia: cardGrowthDaLuisa })).estado).toBe("aguardando")
    expect((await saida("thalisson", { categoria: "andamento", referencia: cardDosOutros })).estado).toBe("cancelado")
    expect((await saida("thalisson", { categoria: "andamento", referencia: cardDoThalisson })).estado).toBe("aguardando")
    await db.alertaIA.createMany({ data: [
      { organizacaoId: org, tipoAlerta: "regra_prazo_vencido", mensagem: "prazo growth", demandaId: cardGrowthDaLuisa },
      { organizacaoId: org, tipoAlerta: "regra_prazo_vencido", mensagem: "prazo audiovisual de outro", demandaId: cardDosOutros },
      { organizacaoId: org, tipoAlerta: "whatsapp_desconectado", mensagem: "sistema" },
    ] })
    entrar("thalisson")
    expect(await alertasDoSino()).toEqual(["prazo growth", "sistema"])
  })
  it("Luisa com 'Só o que eu pedi': só o card dela, nos três canais", async () => {
    entrar("giovani")
    expect((await salvar("luisa", estadoDoPerfil("pedi").map((e) => ({ ...e, travada: false })))).status).toBe(200)
    expect((await saida("luisa", { categoria: "andamento", referencia: cardGrowthDaLuisa })).estado).toBe("aguardando")
    expect((await saida("luisa", { categoria: "andamento", referencia: cardDosOutros })).estado).toBe("cancelado")
    expect((await saida("luisa", { chave: `grav:${cardDosOutros}:material:2026-11-12:solicitante:abc`, referencia: cardDosOutros })).estado).toBe("cancelado")
    expect((await saida("luisa", { categoria: "sistema" })).estado).toBe("cancelado")
    expect(await comOrg(org, () => podeAvisar(db, { organizacaoId: org, categoria: "andamento", demandaId: cardGrowthDaLuisa }, gente.luisa.id, "email"))).toBe(true)
    expect(await comOrg(org, () => podeAvisar(db, { organizacaoId: org, categoria: "andamento", demandaId: cardDosOutros }, gente.luisa.id, "email"))).toBe(false)
    await db.alertaIA.createMany({ data: [
      { organizacaoId: org, tipoAlerta: "video_aprovado", mensagem: "aprovado o da Luisa", demandaId: cardGrowthDaLuisa },
      { organizacaoId: org, tipoAlerta: "video_aprovado", mensagem: "aprovado de outro", demandaId: cardDosOutros },
    ] })
    entrar("luisa")
    expect(await alertasDoSino()).toEqual(["aprovado o da Luisa"])
  })
})

describe("script dos perfis da Contourline", () => {
  it("mostra o plano sem gravar e, com --aplicar, grava o combinado numa transação", async () => {
    const slug = `${p}-contourline`, orgS = `${p}-orgs`
    const nomes = ["Giovani", "Thalison Samuel", "Helaine", "FERNANDA NORMANDO", "Caroline Tinos", "Debora", "Luisa ayusso"]
    await db.organizacao.create({ data: { id: orgS, nome: "Contourline (teste)", slug } })
    const ids = nomes.map((_, i) => `${p}-s${i}`)
    for (const [i, nome] of nomes.entries()) {
      await db.usuario.create({ data: { id: ids[i], nome, tipo: "gestor", senhaHash: "sem-login" } })
      await db.usuarioOrganizacao.create({ data: { usuarioId: ids[i], organizacaoId: orgS, papel: "gestor", areas: [] } })
    }
    try {
      const url = process.env.DATABASE_URL_TEST!
      const rodar = (...extra: string[]) => spawnSync(process.execPath, ["scripts/perfis-avisos-contourline.mjs", "--banco", url, "--empresa", slug, ...extra], { encoding: "utf8" })
      const plano = rodar()
      expect(plano.status).toBe(0)
      expect(plano.stdout).toContain("Thalison Samuel")
      expect(await db.preferenciaAviso.count({ where: { organizacaoId: orgS } })).toBe(0)
      const aplicado = rodar("--aplicar")
      expect(aplicado.status, aplicado.stderr).toBe(0)
      const thal = await db.preferenciaAviso.findMany({ where: { organizacaoId: orgS, usuarioId: ids[1] } })
      expect(thal.find((l) => l.categoria === "andamento")).toMatchObject({ recorte: "setor", setor: "growth" })
      expect(thal.find((l) => l.categoria === "resumos")).toBeUndefined() // resumos ligado = padrão, sem linha
      const luisa = await db.preferenciaAviso.findMany({ where: { organizacaoId: orgS, usuarioId: ids[6] } })
      expect(luisa.find((l) => l.categoria === "andamento")).toMatchObject({ recorte: "pedi" })
      expect(luisa.find((l) => l.categoria === "sistema")).toMatchObject({ sino: false, whatsapp: false })
      // Rodar de novo não duplica.
      expect(rodar("--aplicar").status).toBe(0)
      // Débora mantém Gravações como hoje (sem linha): uma a menos que os outros do "pedi".
      const debora = await db.preferenciaAviso.findMany({ where: { organizacaoId: orgS, usuarioId: ids[5] } })
      expect(debora.find((l) => l.categoria === "gravacoes")).toBeUndefined()
      expect(debora.find((l) => l.categoria === "andamento")).toMatchObject({ recorte: "pedi" })
      expect(await db.preferenciaAviso.count({ where: { organizacaoId: orgS } })).toBe(luisa.length * 5 - 1 + thal.length * 2)
    } finally {
      await db.preferenciaAviso.deleteMany({ where: { organizacaoId: orgS } })
      await db.usuarioOrganizacao.deleteMany({ where: { organizacaoId: orgS } })
      await db.organizacao.delete({ where: { id: orgS } })
      await db.usuario.deleteMany({ where: { id: { in: ids } } })
    }
  })
})

describe("resumo do fim do dia", () => {
  it("cada pessoa configurada recebe o do recorte dela; sem configuração ou sem movimento, nada", async () => {
    entrar("giovani")
    await salvar("thalisson", estadoDoPerfil("setor", "growth").map((e) => ({ ...e, travada: false })))
    await salvar("luisa", estadoDoPerfil("so_resumo").map((e) => ({ ...e, travada: false })).map((e) =>
      e.categoria === "andamento" || e.categoria === "gravacoes" ? { ...e, recorte: "pedi" } : e))
    await salvar("debora", estadoDoPerfil("pedi").map((e) => ({ ...e, travada: false })))
    await db.historicoStatus.createMany({ data: [
      { demandaId: cardGrowthDaLuisa, statusNovo: "aprovado" },
      { demandaId: cardDosOutros, statusNovo: "ajuste_solicitado" },
    ] })
    try {
      const r = await comOrg(org, () => resumoDoFimDoDia(org))
      const saidas = await db.saidaWhatsapp.findMany({ where: { organizacaoId: org, chave: { contains: "fimdodia:" } } })
      const de = (q: keyof typeof gente) => saidas.find((s) => s.destinatarioId === gente[q].id)
      // Giovani não tem configuração: segue como hoje, sem resumo novo.
      expect(de("giovani")).toBeUndefined()
      // Débora só com o que pediu, e não pediu nada: dia sem movimento.
      expect(de("debora")).toBeUndefined()
      expect(r).toMatchObject({ pessoas: 3, whatsapp: 2, semMovimento: 1 })
      const textoThal = decryptSecret(de("thalisson")!.conteudoCifrado!)
      expect(textoThal).toContain("GR-03 — Arte da campanha (aprovado)")
      expect(textoThal).toContain("AV-d1") // card dele, de outro setor, entrou hoje
      expect(textoThal).not.toContain("AV-d2")
      // Vai com a arte da turma do Growth (o setor do perfil dele).
      expect(de("thalisson")!.chave).toMatch(/^arte:rel_gr_(ok|cansado|apuros):fimdodia:v1:/)
      // Luisa está em "Só o resumo do dia": o WhatsApp do andamento está desligado, mas o resumo chega.
      const textoLuisa = decryptSecret(de("luisa")!.conteudoCifrado!)
      expect(textoLuisa).toContain("GR-03")
      expect(textoLuisa).not.toContain("AV-d")
      // Rodar de novo no mesmo dia não manda outro.
      await comOrg(org, () => resumoDoFimDoDia(org))
      expect(await db.saidaWhatsapp.count({ where: { organizacaoId: org, chave: { contains: "fimdodia:" } } })).toBe(2)
      // Quem desliga "Resumos" no WhatsApp não recebe.
      await db.saidaWhatsapp.deleteMany({ where: { organizacaoId: org } })
      await db.preferenciaAviso.create({ data: { organizacaoId: org, usuarioId: gente.thalisson.id, categoria: "resumos", whatsapp: false, email: false } })
      await comOrg(org, () => resumoDoFimDoDia(org))
      expect(await db.saidaWhatsapp.count({ where: { organizacaoId: org, destinatarioId: gente.thalisson.id } })).toBe(0)
    } finally {
      await db.historicoStatus.deleteMany({ where: { demandaId: { in: [cardGrowthDaLuisa, cardDosOutros] } } })
    }
  })
})

describe("quem pode mudar", () => {
  it("a pessoa muda as dela, não a dos outros, e não destrava o que a gestão travou", async () => {
    const auditoriaAntes = await db.eventoAuditoria.count({ where: { organizacaoId: org, acao: "avisos.preferencias", recursoId: gente.luisa.id } })
    entrar("giovani")
    await salvar("luisa", so({ gravacoes: "tudo" }).map((c) => (c.categoria === "pedidos" ? { ...c, travada: true } : c)))
    entrar("luisa")
    expect((await salvar("thalisson", so({}))).status).toBe(403)
    expect((await lerAvisos(new NextRequest(`http://localhost/api/avisos-por-pessoa?usuarioId=${gente.thalisson.id}`))).status).toBe(403)
    const minhas = await (await lerAvisos(new NextRequest("http://localhost/api/avisos-por-pessoa"))).json()
    expect(minhas).toMatchObject({ pessoa: { id: gente.luisa.id }, comoGestao: false, pessoas: [] })
    const r = await salvar("luisa", so({ pedidos: "tudo", andamento: "tudo", gravacoes: "tudo" }).map((c) => ({ ...c, travada: false })))
    expect(r.status).toBe(200)
    const linhas = await db.preferenciaAviso.findMany({ where: { organizacaoId: org, usuarioId: gente.luisa.id } })
    // A travada ficou como a gestão deixou; a pessoa não destrava.
    expect(linhas.find((l) => l.categoria === "pedidos")).toMatchObject({ sino: false, whatsapp: false, travada: true })
    // Voltar ao padrão apaga a linha: sem linha é "recebe como sempre".
    expect(linhas.find((l) => l.categoria === "andamento")).toBeUndefined()
    expect(await comOrg(org, () => podeAvisar(db, { organizacaoId: org, categoria: "andamento" }, gente.luisa.id, "whatsapp"))).toBe(true)
    expect(await comOrg(org, () => podeAvisar(db, { organizacaoId: org, categoria: "pedidos" }, gente.luisa.id, "whatsapp"))).toBe(false)
    // Fica na Auditoria quem mudou de quem.
    expect(await db.eventoAuditoria.count({ where: { organizacaoId: org, acao: "avisos.preferencias", recursoId: gente.luisa.id } })).toBe(auditoriaAntes + 2)
  })
})
