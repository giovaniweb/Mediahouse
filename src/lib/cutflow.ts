// Cutflow — o plugin do Premiere que edita os cards da fila (30/09/2026).
//
// LOGIN SEM SENHA NO PREMIERE (fluxo de dispositivo)
//
//   1. O plugin sorteia um segredo que nunca sai do computador e manda ao
//      NuFlow só o hash dele (`POST /api/cutflow/conectar`). Recebe de volta um
//      PEDIDO assinado (HMAC) com esse hash, válido por 10 minutos, e abre
//      `/cutflow/conectar?pedido=...` no navegador.
//   2. A pessoa, logada no NuFlow como sempre, confere o código curto que o
//      plugin mostra e clica "Autorizar este computador"
//      (`POST /api/cutflow/autorizar`). Nasce a linha em cutflow_sessoes, com a
//      empresa e a pessoa, ainda sem sessão.
//   3. O plugin, que vinha perguntando com o segredo (`POST /api/cutflow/sessao`),
//      recebe a sessão UMA vez. O banco guarda só o hash dela.
//
// Quem vê o link do navegador não consegue a sessão: falta o segredo, que ficou
// no computador. Quem rouba o banco não consegue a sessão: só há hashes.
//
// CADA CHAMADA DO PLUGIN confere, nesta ordem: sessão válida (não revogada, não
// vencida), módulo `cutflow` ligado na empresa, e a permissão `usarCutflow` da
// pessoa NESTA empresa. Faltou uma, a rota responde 401/403 e não mexe em nada.
//
// Limite honesto: o código do plugin roda no computador de quem usa. Esta trava
// segura o uso normal (o time e pessoas de confiança), não quem estiver decidido
// a burlar o plugin — para isso as partes de valor precisam morar no servidor.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgPorCredencial } from "@/lib/org-por-credencial"
import { declararOrg } from "@/lib/org-contexto"
import { moduloAtivo } from "@/lib/modulos-org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { podePermissao } from "@/lib/permissoes"

export const VALIDADE_PEDIDO_MS = 10 * 60 * 1000
/** Tempo para o plugin buscar a sessão depois da autorização. */
export const VALIDADE_BUSCA_MS = 15 * 60 * 1000
/** A sessão vence depois de 30 dias SEM USO; cada uso empurra o prazo. */
export const VALIDADE_SESSAO_MS = 30 * 24 * 60 * 60 * 1000
/** Renovar o prazo a cada chamada seria uma escrita por requisição. */
const RENOVAR_APOS_MS = 60 * 60 * 1000

const HEX64 = /^[0-9a-f]{64}$/

export function hashCutflow(valor: string): string {
  return createHash("sha256").update(valor).digest("hex")
}

export function ehHashValido(valor: unknown): valor is string {
  return typeof valor === "string" && HEX64.test(valor)
}

export function novaSessao(): string {
  return randomBytes(32).toString("base64url")
}

/**
 * Código curto que o plugin e a página de autorização mostram. Se não baterem,
 * alguém mandou para a pessoa o link de OUTRO computador — o golpe clássico do
 * fluxo de dispositivo. Sai do hash, então os dois lados chegam a ele sozinhos.
 */
export function codigoDeConfirmacao(dispositivoHash: string): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let codigo = ""
  for (let i = 0; i < 6; i++) codigo += letras[parseInt(dispositivoHash.slice(i * 2, i * 2 + 2), 16) % letras.length]
  return codigo.slice(0, 3) + "-" + codigo.slice(3)
}

function segredo(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET ausente — não é possível assinar o pedido do Cutflow")
  return s
}

// Prefixo de domínio: um HMAC de outra parte do NuFlow com o mesmo segredo
// (anexo, e-mail) nunca vale como pedido do Cutflow.
function assinar(corpo: string): string {
  return createHmac("sha256", segredo()).update("cutflow-pedido:" + corpo).digest("base64url")
}

export type PedidoCutflow = { dispositivoHash: string; nomeComputador: string; expiraEm: number }

export function assinarPedido(dispositivoHash: string, nomeComputador: string, agora = Date.now()): string {
  const corpo = JSON.stringify({ h: dispositivoHash, n: nomeComputador, e: agora + VALIDADE_PEDIDO_MS })
  const b64 = Buffer.from(corpo).toString("base64url")
  return `${b64}.${assinar(b64)}`
}

/** O pedido, se é autêntico e não venceu; `null` em qualquer outro caso. */
export function lerPedido(pedido: string | null | undefined, agora = Date.now()): PedidoCutflow | null {
  if (typeof pedido !== "string" || pedido.length > 2000) return null
  const [b64, assinatura] = pedido.split(".")
  if (!b64 || !assinatura) return null
  const esperada = Buffer.from(assinar(b64))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null
  try {
    const { h, n, e } = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"))
    if (!ehHashValido(h) || typeof e !== "number" || e <= agora) return null
    return { dispositivoHash: h, nomeComputador: typeof n === "string" ? n.slice(0, 80) : "", expiraEm: e }
  } catch {
    return null
  }
}

/** Nome que o plugin manda do computador, só com o que cabe mostrar na tela. */
export function limparNomeComputador(nome: unknown): string {
  if (typeof nome !== "string") return "Computador sem nome"
  const limpo = nome.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80)
  return limpo || "Computador sem nome"
}

// ── Autenticação das rotas do plugin ────────────────────────────────────────

export type ContextoCutflow = {
  organizacaoId: string
  usuarioId: string
  sessaoId: string
  nomeComputador: string | null
}

const recusa = (status: 401 | 403, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status })

/**
 * Confere a sessão do plugin e declara a empresa para o resto da requisição.
 * Devolve o contexto ou a resposta de recusa pronta.
 */
export async function autenticarCutflow(req: { headers: Headers }): Promise<ContextoCutflow | NextResponse> {
  const cabecalho = req.headers.get("authorization") ?? ""
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7).trim() : ""
  if (!token || token.length < 32 || token.length > 200) {
    return recusa(401, "Entre no Cutflow com a sua conta do NuFlow.", { entrar: true })
  }
  const tokenHash = hashCutflow(token)

  // Vencida, revogada ou de ninguém respondem igual: não dá para sondar.
  const organizacaoId = await orgPorCredencial("cutflow_sessao", tokenHash)
  if (!organizacaoId) return recusa(401, "Sessão do Cutflow vencida ou desconectada. Entre de novo.", { entrar: true })
  declararOrg(organizacaoId)

  const sessao = await prisma.cutflowSessao.findUnique({
    where: { tokenHash },
    select: { id: true, organizacaoId: true, usuarioId: true, nomeComputador: true, revogadaEm: true, expiraEm: true, ultimoUsoEm: true },
  })
  const agora = new Date()
  if (!sessao || sessao.organizacaoId !== organizacaoId || sessao.revogadaEm || sessao.expiraEm <= agora) {
    return recusa(401, "Sessão do Cutflow vencida ou desconectada. Entre de novo.", { entrar: true })
  }

  if (!(await moduloAtivo(organizacaoId, "cutflow"))) {
    return recusa(403, "O Cutflow não está liberado para esta empresa no NuFlow.", { motivo: "modulo" })
  }
  const vinculo = await permissoesEfetivas(sessao.usuarioId, organizacaoId)
  if (!vinculo || !podePermissao(vinculo.permissoes, "usarCutflow")) {
    return recusa(403, "Sua conta não tem permissão para usar o Cutflow. Peça a um administrador do NuFlow.", { motivo: "permissao" })
  }

  if (!sessao.ultimoUsoEm || agora.getTime() - sessao.ultimoUsoEm.getTime() > RENOVAR_APOS_MS) {
    await prisma.cutflowSessao.update({
      where: { id: sessao.id },
      data: { ultimoUsoEm: agora, expiraEm: new Date(agora.getTime() + VALIDADE_SESSAO_MS) },
    })
  }
  return { organizacaoId, usuarioId: sessao.usuarioId, sessaoId: sessao.id, nomeComputador: sessao.nomeComputador }
}

/** A sessão do plugin no formato que a mudança de status aceita (só id e empresa). */
export function sessaoDoPlugin(ctx: ContextoCutflow) {
  return { user: { id: ctx.usuarioId, organizacaoId: ctx.organizacaoId } }
}

// ── Envio para aprovação ────────────────────────────────────────────────────
// O plugin sobe o vídeo direto para o Drive (sessão resumável); ao concluir,
// apresenta este recibo assinado, que amarra o arquivo ao card, à pasta e ao
// tamanho declarados. Sem ele, qualquer fileId poderia virar "vídeo final".
export const VALIDADE_ENVIO_MS = 24 * 60 * 60 * 1000

function assinarComDominio(dominio: string, corpo: string): string {
  return createHmac("sha256", segredo()).update(dominio + corpo).digest("base64url")
}

export type EnvioCutflow = { demandaId: string; fileId: string; pastaId: string | null; tamanho: number; nome: string; sessaoId: string }

export function assinarEnvio(e: EnvioCutflow, agora = Date.now()): string {
  const b64 = Buffer.from(JSON.stringify({ ...e, exp: agora + VALIDADE_ENVIO_MS })).toString("base64url")
  return `${b64}.${assinarComDominio("cutflow-envio:", b64)}`
}

export function lerEnvio(bruto: unknown, agora = Date.now()): EnvioCutflow | null {
  if (typeof bruto !== "string" || bruto.length > 4000) return null
  const [b64, assinatura] = bruto.split(".")
  if (!b64 || !assinatura) return null
  const esperada = Buffer.from(assinarComDominio("cutflow-envio:", b64))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null
  try {
    const d = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"))
    if (typeof d.exp !== "number" || d.exp <= agora || typeof d.fileId !== "string" || typeof d.demandaId !== "string") return null
    return { demandaId: d.demandaId, fileId: d.fileId, pastaId: d.pastaId ?? null, tamanho: Number(d.tamanho), nome: String(d.nome), sessaoId: String(d.sessaoId) }
  } catch {
    return null
  }
}

// ── Fila ────────────────────────────────────────────────────────────────────

/**
 * O editor "Cutflow" desta empresa. A fila do plugin são os cards atribuídos a
 * ele (ideia do Giovani, 29/09): quem distribui trabalho no NuFlow já sabe
 * atribuir a um editor, e o Cutflow vira mais um da equipe.
 *
 * O admin cadastra um editor chamado "Cutflow" em Equipe. Mais de um com o
 * mesmo nome é ambiguidade: a fila recusa em vez de escolher um.
 */
export async function editorCutflow(organizacaoId: string): Promise<{ id: string } | { erro: string }> {
  const vinculos = await prisma.editorOrganizacao.findMany({
    where: { organizacaoId, editor: { nome: { equals: "Cutflow", mode: "insensitive" } } },
    select: { editorId: true },
  })
  if (vinculos.length === 0) {
    return { erro: 'Cadastre um editor chamado "Cutflow" em Equipe e atribua a ele os cards que o plugin deve editar.' }
  }
  if (vinculos.length > 1) {
    return { erro: 'Há mais de um editor chamado "Cutflow" nesta empresa. Deixe só um para a fila não pegar o card errado.' }
  }
  return { id: vinculos[0].editorId }
}

/** Status em que o card já saiu da edição: não entra mais na fila. */
export const FORA_DA_FILA = [
  "edicao_finalizada", "revisao_pendente", "aprovado", "postagem_pendente", "postado",
  "entregue_cliente", "contagem_15_dias_iniciada", "lembrete_15_dias_enviado", "expirado", "encerrado",
] as const

/** Pasta do Drive a partir do link guardado no card, só em URL oficial do Drive. */
export function pastaDoDrive(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" || u.hostname !== "drive.google.com") return null
    const id = u.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] ?? null
    return id && /^[a-zA-Z0-9_-]{10,}$/.test(id) ? id : null
  } catch {
    return null
  }
}

/** Envio do vídeo final pelo plugin: desligado desde que o NuFlow deixou o
 *  Google Drive (03/10/2026), até ir direto ao armazenamento do NuFlow. */
export const ENVIO_INDISPONIVEL = "O envio pelo Cutflow está em revisão. Envie o vídeo final pela tela da demanda no NuFlow."
