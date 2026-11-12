// Resumo do fim do dia (Giovani, 12/11/2026): "algumas pessoas recebem apenas o
// relatório no final do dia". Uma mensagem por pessoa, às 18h de São Paulo, de
// segunda a sexta (vercel.json, agente fim-do-dia), no recorte do perfil dela:
// o que andou hoje, o que espera por ela, o que está atrasado e o que entrou.
// Dia sem movimento no recorte dela: não manda nada.
//
// Quem recebe: só quem tem os avisos configurados (ao menos uma linha em
// preferencias_aviso) e não desligou "Resumos". Quem não tem configuração
// segue como hoje — sem resumo novo. Aplicar um perfil é o que liga.
//
// Os dois canais passam pela regra central: o WhatsApp entra na fila com a
// categoria "resumos" (criarSaida corta se ela desligou) e o e-mail leva o
// mesmo aviso (enviarEmail tira quem desligou).
//
// Arte: a família de relatório da turma (cenas 17–25) está na branch
// avisos/artes-areas-relatorio, ainda fora da main. Quando entrar, é passar a
// família na chave (chaveComArte) aqui em `enfileirar`.
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { criarSaida } from "@/lib/whatsapp-outbox"
import { telefoneCompleto } from "@/lib/whatsapp-identidade"
import { dataEmSaoPaulo } from "@/lib/datas"
import { COLUNAS_LABEL, STATUS_PARA_COLUNA } from "@/lib/status"
import { ehSetor, type Preferencia, type Setor } from "@/lib/avisos-categorias"
import { ondeEDoSetor, ondeEstaNoCard } from "@/lib/preferencias-aviso"
import { escaparHtml, sendEmailNotificacao } from "@/lib/email"
import type { StatusInterno } from "@prisma/client"

type Tx = Prisma.TransactionClient

export type ItemDoResumo = { codigo: string; titulo: string; detalhe?: string }
export type DadosDoResumo = {
  nome: string
  andou: ItemDoResumo[]
  esperando: ItemDoResumo[]
  atrasados: ItemDoResumo[]
  novos: ItemDoResumo[]
  link: string
}

/** Quantos itens por bloco aparecem; o resto vira "e mais N". */
const POR_BLOCO = 4

/** O texto do WhatsApp, ou null quando não houve nada (aí não se manda). Função pura. */
export function mensagemDoFimDoDia(d: DadosDoResumo): string | null {
  const blocos: [string, ItemDoResumo[]][] = [
    ["✅ Andou hoje", d.andou], ["👀 Esperando você", d.esperando], ["⏰ Atrasados", d.atrasados], ["📥 Entraram hoje", d.novos],
  ]
  const comItens = blocos.filter(([, itens]) => itens.length)
  if (!comItens.length) return null
  const primeiro = d.nome.trim().split(/\s+/)[0] || d.nome
  const partes = comItens.map(([titulo, itens]) => {
    const linhas = itens.slice(0, POR_BLOCO).map((i) => `• ${i.codigo} — ${i.titulo}${i.detalhe ? ` (${i.detalhe})` : ""}`)
    if (itens.length > POR_BLOCO) linhas.push(`• e mais ${itens.length - POR_BLOCO}`)
    return `*${titulo}*\n${linhas.join("\n")}`
  })
  return `🌙 ${primeiro}, o resumo do seu dia no Flow.\n\n${partes.join("\n\n")}\n\n${d.link}`
}

/** O mesmo resumo em e-mail (tudo escapado). */
export function htmlDoFimDoDia(d: DadosDoResumo): string {
  const bloco = (titulo: string, itens: ItemDoResumo[]) => !itens.length ? "" :
    `<h3 style="margin:20px 0 6px;font-size:15px;color:#18181b">${escaparHtml(titulo)}</h3><ul style="margin:0;padding-left:18px;color:#3f3f46;font-size:14px">` +
    itens.map((i) => `<li>${escaparHtml(i.codigo)} — ${escaparHtml(i.titulo)}${i.detalhe ? ` (${escaparHtml(i.detalhe)})` : ""}</li>`).join("") + "</ul>"
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;background:#f4f4f5;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<h2 style="margin:0 0 4px;color:#18181b">O resumo do seu dia</h2>
${bloco("Andou hoje", d.andou)}${bloco("Esperando você", d.esperando)}${bloco("Atrasados", d.atrasados)}${bloco("Entraram hoje", d.novos)}
<p style="margin-top:24px"><a href="${escaparHtml(d.link)}" style="color:#2563eb">Abrir o Flow →</a></p></div></body></html>`
}

// ─── Recorte da pessoa ─────────────────────────────────────────────────────────

const GRAVACAO_EXTERNA: Prisma.DemandaWhereInput = {
  OR: [{ tipoGravacao: { not: null } }, { tipoVideo: "cobertura_evento" }, { departamento: "eventos" }],
}
function ondeDoRecorte(p: Preferencia | undefined, usuarioId: string): Prisma.DemandaWhereInput {
  const recorte = p?.recorte ?? "tudo"
  if (recorte === "meus") return ondeEstaNoCard(usuarioId)
  if (recorte === "pedi") return { solicitanteId: usuarioId }
  if (recorte === "setor" && ehSetor(p?.setor)) return { OR: [ondeEstaNoCard(usuarioId), ondeEDoSetor(p!.setor as Setor)] }
  return {}
}

/**
 * Os cards do resumo, pelo recorte do perfil: o do andamento, mais as gravações
 * externas no recorte de gravações (é como a Débora fica com todas as
 * gravações sem receber todas as demandas).
 *
 * Vale o RECORTE, não os canais: quem está em "Só o resumo do dia" desligou o
 * andamento justamente para recebê-lo só aqui, de uma vez.
 */
export function escopoDoResumo(prefs: Map<string, Preferencia>, usuarioId: string): Prisma.DemandaWhereInput {
  return { OR: [
    ondeDoRecorte(prefs.get("andamento"), usuarioId),
    { AND: [GRAVACAO_EXTERNA, ondeDoRecorte(prefs.get("gravacoes"), usuarioId)] },
  ] }
}

// ─── A rotina ──────────────────────────────────────────────────────────────────

const FORA_DO_QUADRO: StatusInterno[] = ["encerrado", "expirado", "videomaker_recusou", "postado", "entregue_cliente"]
const ANDOU: Partial<Record<StatusInterno, string>> = {
  aprovado: "aprovado", ajuste_solicitado: "ajuste pedido", entregue_cliente: "entregue", postado: "publicado",
  revisao_pendente: "foi para aprovação", edicao_finalizada: "edição pronta", brutos_enviados: "material chegou",
  videomaker_aceitou: "videomaker confirmou", videomaker_recusou: "videomaker recusou", impedimento: "impedimento",
}
const coluna = (s: string) => COLUNAS_LABEL[STATUS_PARA_COLUNA[s as StatusInterno]] ?? s

async function dadosDaPessoa(tx: Tx, org: string, p: { id: string; nome: string; papel: string }, escopo: Prisma.DemandaWhereInput,
  inicio: Date, link: string): Promise<DadosDoResumo> {
  const base: Prisma.DemandaWhereInput = { organizacaoId: org, AND: [escopo] }
  const sel = { id: true, codigo: true, titulo: true } as const
  const movidos = await tx.historicoStatus.findMany({
    where: { createdAt: { gte: inicio }, statusNovo: { in: Object.keys(ANDOU) }, demanda: base },
    orderBy: { createdAt: "desc" }, select: { statusNovo: true, demanda: { select: sel } }, take: 200,
  })
  const vistos = new Set<string>()
  const andou = movidos.flatMap((h) => {
    if (vistos.has(h.demanda.id)) return [] // o último movimento do card conta
    vistos.add(h.demanda.id)
    return [{ codigo: h.demanda.codigo, titulo: h.demanda.titulo, detalhe: ANDOU[h.statusNovo as StatusInterno] ?? coluna(h.statusNovo) }]
  })
  const gestao = p.papel === "admin" || p.papel === "gestor"
  const esperando = await tx.demanda.findMany({
    where: { ...base, OR: [
      { solicitanteId: p.id, statusInterno: "revisao_pendente" },
      ...(gestao ? [{ statusInterno: { in: ["aguardando_aprovacao_interna", "urgencia_pendente_aprovacao"] as StatusInterno[] } }] : []),
    ] },
    select: { ...sel, statusInterno: true }, orderBy: { updatedAt: "asc" }, take: 50,
  })
  const atrasados = await tx.demanda.findMany({
    where: { ...base, dataLimite: { lt: inicio }, statusVisivel: { not: "finalizado" }, statusInterno: { notIn: FORA_DO_QUADRO } },
    select: sel, orderBy: { dataLimite: "asc" }, take: 50,
  })
  const novos = await tx.demanda.findMany({ where: { ...base, createdAt: { gte: inicio } }, select: sel, orderBy: { createdAt: "desc" }, take: 50 })
  const item = (d: { codigo: string; titulo: string }, detalhe?: string) => ({ codigo: d.codigo, titulo: d.titulo, ...(detalhe ? { detalhe } : {}) })
  return {
    nome: p.nome, link,
    andou,
    esperando: esperando.map((d) => item(d, d.statusInterno === "revisao_pendente" ? "sua aprovação" : "aprovação de entrada")),
    atrasados: atrasados.map((d) => item(d)),
    novos: novos.map((d) => item(d)),
  }
}

/** Início do dia de hoje em São Paulo (UTC-3, sem horário de verão desde 2019). */
export const inicioDoDia = (agora = new Date()) => new Date(`${dataEmSaoPaulo(agora)}T00:00:00-03:00`)

export type ResultadoFimDoDia = { pessoas: number; whatsapp: number; emails: number; semMovimento: number }

/** Monta e enfileira o resumo de cada pessoa configurada. Chamar dentro do comOrg da empresa. */
export async function resumoDoFimDoDia(org: string, agora = new Date()): Promise<ResultadoFimDoDia> {
  const r: ResultadoFimDoDia = { pessoas: 0, whatsapp: 0, emails: 0, semMovimento: 0 }
  const inicio = inicioDoDia(agora), dia = dataEmSaoPaulo(agora)
  const link = `${(process.env.NEXTAUTH_URL ?? "https://nuflow.space").trim().replace(/\/$/, "")}/hoje`
  const linhas = await prisma.preferenciaAviso.findMany({
    where: { organizacaoId: org, usuario: { status: "ativo", organizacoes: { some: { organizacaoId: org } } } },
    select: { usuarioId: true, categoria: true, sino: true, email: true, whatsapp: true, recorte: true, setor: true },
  })
  const porPessoa = new Map<string, Map<string, Preferencia>>()
  for (const l of linhas) {
    if (!porPessoa.has(l.usuarioId)) porPessoa.set(l.usuarioId, new Map())
    porPessoa.get(l.usuarioId)!.set(l.categoria, l)
  }
  const emails: { para: string; dados: DadosDoResumo; usuarioId: string }[] = []
  for (const [usuarioId, prefs] of porPessoa) {
    const resumos = prefs.get("resumos")
    if (resumos && !resumos.whatsapp && !resumos.email) continue
    const escopo = escopoDoResumo(prefs, usuarioId)
    const feito = await prisma.$transaction(async (tx) => {
      const p = await tx.usuario.findFirst({
        where: { id: usuarioId, status: "ativo" },
        select: { id: true, nome: true, telefone: true, email: true, organizacoes: { where: { organizacaoId: org }, select: { papel: true } } },
      })
      if (!p?.organizacoes[0]) return null
      const dados = await dadosDaPessoa(tx, org, { id: p.id, nome: p.nome, papel: p.organizacoes[0].papel }, escopo, inicio, link)
      const texto = mensagemDoFimDoDia(dados)
      if (!texto) return { semMovimento: true }
      const telefone = telefoneCompleto(p.telefone)
      let whatsapp = false
      if (telefone && (!resumos || resumos.whatsapp)) {
        const s = await criarSaida(tx, {
          organizacaoId: org, origem: "manual", chave: `fimdodia:v1:${p.id}:${dia}`, referencia: p.id, telefone, texto,
          expiraEm: new Date(agora.getTime() + 4 * 3600_000), categoria: "resumos",
        }).catch(() => null)
        whatsapp = !!s && s.estado === "aguardando"
      }
      return { semMovimento: false, whatsapp, email: p.email && (!resumos || resumos.email) ? { para: p.email, dados } : null }
    })
    if (!feito) continue
    r.pessoas++
    if (feito.semMovimento) { r.semMovimento++; continue }
    if (feito.whatsapp) r.whatsapp++
    if (feito.email) emails.push({ ...feito.email, usuarioId })
  }
  // E-mail fora da transação (rede). Um por pessoa e por dia: a rotina roda uma vez.
  for (const e of emails) {
    const env = await sendEmailNotificacao({
      destinatario: e.para, assunto: "[NuFlow] O resumo do seu dia", html: htmlDoFimDoDia(e.dados), evento: "resumo-fim-do-dia",
      aviso: { organizacaoId: org, categoria: "resumos" },
    })
    if (env.ok && env.emailId) r.emails++
  }
  return r
}

/** Para a rota de cron: roda dentro do comOrg da empresa. */
export const rodarFimDoDia = (org: string) => comOrg(org, () => resumoDoFimDoDia(org))
