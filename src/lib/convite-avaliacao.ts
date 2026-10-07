// Convite para o cliente avaliar o profissional por um serviço.
//
// Até 07/10/2026 o QR de avaliação era só o endereço do profissional
// (/avaliar/<id>): qualquer pessoa com o id dava quantas notas quisesse, e a
// média que a rede inteira vê mudava junto. Agora o link carrega um convite
// assinado pelo servidor que diz QUEM pode ser avaliado, POR QUAL serviço (a
// demanda) e ATÉ QUANDO. Vale uma avaliação por serviço.
//
// O convite não mora no banco: é assinado (HMAC) com o segredo do servidor, e a
// rota confere a assinatura e a validade. O "um uso" é conferido na própria
// avaliação, que guarda a demanda — uma avaliação pública por profissional e
// serviço. Trocar o segredo do servidor invalida os convites em aberto; quem
// precisar gera outro na página do profissional.
import { createHmac, timingSafeEqual } from "node:crypto"

export const VALIDADE_CONVITE_DIAS = 30

export type TipoProfissional = "videomaker" | "editor"
export type ConviteAvaliacao = {
  tipo: TipoProfissional
  profissionalId: string
  demandaId: string
  organizacaoId: string
  expiraEm: Date
}

type Carga = { t: "vm" | "ed"; p: string; d: string; o: string; e: number }

function segredo(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("Sem segredo do servidor para assinar convite de avaliação")
  return s
}

function assinatura(carga: string): string {
  return createHmac("sha256", `nuflow:convite-avaliacao:${segredo()}`).update(carga).digest("base64url")
}

export function criarConvite(c: Omit<ConviteAvaliacao, "expiraEm">, agora = Date.now()): { token: string; expiraEm: Date } {
  const e = Math.floor(agora / 1000) + VALIDADE_CONVITE_DIAS * 86400
  const carga: Carga = { t: c.tipo === "editor" ? "ed" : "vm", p: c.profissionalId, d: c.demandaId, o: c.organizacaoId, e }
  const corpo = Buffer.from(JSON.stringify(carga)).toString("base64url")
  return { token: `v1.${corpo}.${assinatura(corpo)}`, expiraEm: new Date(e * 1000) }
}

export type LeituraConvite =
  | { ok: true; convite: ConviteAvaliacao }
  | { ok: false; motivo: "ausente" | "invalido" | "vencido" }

/** Confere assinatura, formato e validade. Não consulta o banco. */
export function lerConvite(token: string | null | undefined, tipo: TipoProfissional, agora = Date.now()): LeituraConvite {
  if (!token || typeof token !== "string") return { ok: false, motivo: "ausente" }
  if (token.length > 600) return { ok: false, motivo: "invalido" }
  const [versao, corpo, sig] = token.split(".")
  if (versao !== "v1" || !corpo || !sig) return { ok: false, motivo: "invalido" }
  const esperado = Buffer.from(assinatura(corpo))
  const recebido = Buffer.from(sig)
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return { ok: false, motivo: "invalido" }
  let carga: Carga
  try { carga = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) } catch { return { ok: false, motivo: "invalido" } }
  const tipoCarga = carga?.t === "ed" ? "editor" : carga?.t === "vm" ? "videomaker" : null
  if (tipoCarga !== tipo || !carga.p || !carga.d || !carga.o || !Number.isFinite(carga.e)) return { ok: false, motivo: "invalido" }
  if (carga.e * 1000 <= agora) return { ok: false, motivo: "vencido" }
  return { ok: true, convite: { tipo, profissionalId: carga.p, demandaId: carga.d, organizacaoId: carga.o, expiraEm: new Date(carga.e * 1000) } }
}

export const MSG_CONVITE = {
  ausente: "Este link de avaliação não vale mais. Peça um novo a quem atendeu você.",
  invalido: "Este link de avaliação não vale mais. Peça um novo a quem atendeu você.",
  vencido: "Este link de avaliação venceu. Peça um novo a quem atendeu você.",
  usado: "Este serviço já foi avaliado. Obrigado!",
} as const
