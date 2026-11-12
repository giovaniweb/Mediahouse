// O lugar ÚNICO onde a escolha de avisos de cada pessoa é aplicada.
//
// Os três canais passam por aqui antes de avisar:
// - WhatsApp: criarSaida (lib/whatsapp-outbox.ts) pergunta `podeAvisar` antes
//   de enfileirar; o que a pessoa desligou fica registrado como "cancelado /
//   desligado_pela_pessoa", sem texto, e nunca sai.
// - E-mail: enviarEmail (lib/email.ts) passa a lista por `filtrarEmails`.
// - Sino: o alerta de broadcast é um só para a empresa inteira, então o corte é
//   na leitura (api/notificacoes) com `filtroDoSino`.
//
// Sem linha na tabela, nada muda: as três funções devolvem "pode" sem
// consultar mais nada. A regra pura (decidirAviso) está em avisos-categorias.ts.
import type { Prisma, PrismaClient } from "@prisma/client"
import {
  decidirAviso, precisaDoCard, tiposDeAlertaDa, ehCategoria,
  type Canal, type CategoriaAviso, type Preferencia,
} from "@/lib/avisos-categorias"

type Db = Prisma.TransactionClient | PrismaClient

/** "Estar no card": pediu, gere, é responsável, edita, grava, desenha ou posta. */
export function ondeEstaNoCard(usuarioId: string): Prisma.DemandaWhereInput {
  return {
    OR: [
      { solicitanteId: usuarioId }, { gestorId: usuarioId }, { responsavelId: usuarioId },
      { socialId: usuarioId }, { responsaveis: { some: { usuarioId } } },
      { editor: { is: { usuarioId } } }, { videomaker: { is: { usuarioId } } },
      { designer: { is: { usuarioId } } },
    ],
  }
}

export async function preferenciasDe(db: Db, organizacaoId: string, usuarioId: string): Promise<Map<string, Preferencia>> {
  const linhas = await db.preferenciaAviso.findMany({
    where: { organizacaoId, usuarioId },
    select: { categoria: true, sino: true, email: true, whatsapp: true, recorte: true },
  })
  return new Map(linhas.map((l) => [l.categoria, l]))
}

async function estaNoCard(db: Db, organizacaoId: string, usuarioId: string, demandaId: string): Promise<boolean> {
  const n = await db.demanda.count({ where: { id: demandaId, organizacaoId, ...ondeEstaNoCard(usuarioId) } })
  return n > 0
}

export type Aviso = {
  organizacaoId: string
  categoria: CategoriaAviso | null | undefined
  /** O card do aviso, quando há — é o que o recorte "só os meus" confere. */
  demandaId?: string | null
}

/** Esta pessoa recebe este aviso por este canal? Sem categoria ou sem preferência: sim. */
export async function podeAvisar(db: Db, aviso: Aviso, usuarioId: string, canal: Canal): Promise<boolean> {
  if (!aviso.categoria || !ehCategoria(aviso.categoria)) return true
  const pref = (await preferenciasDe(db, aviso.organizacaoId, usuarioId)).get(aviso.categoria)
  if (!pref) return true
  const card = precisaDoCard(pref, canal) && aviso.demandaId
    ? await estaNoCard(db, aviso.organizacaoId, usuarioId, aviso.demandaId)
    : null
  return decidirAviso(pref, canal, card)
}

/**
 * Tira da lista os e-mails de quem desligou este aviso. E-mail que não é de
 * pessoa da empresa (financeiro, compras, cliente) passa como sempre.
 */
export async function filtrarEmails(db: Db, aviso: Aviso, emails: string[]): Promise<string[]> {
  if (!aviso.categoria || !emails.length) return emails
  const temAlguma = await db.preferenciaAviso.count({ where: { organizacaoId: aviso.organizacaoId, categoria: aviso.categoria } })
  if (!temAlguma) return emails
  const pessoas = await db.usuario.findMany({
    where: { email: { in: emails, mode: "insensitive" }, organizacoes: { some: { organizacaoId: aviso.organizacaoId } } },
    select: { id: true, email: true },
  })
  const fora = new Set<string>()
  for (const p of pessoas) {
    if (p.email && !(await podeAvisar(db, aviso, p.id, "email"))) fora.add(p.email.toLowerCase())
  }
  return emails.filter((e) => !fora.has(e.toLowerCase()))
}

/**
 * O que o sino desta pessoa NÃO mostra, como condição do Prisma para somar ao
 * where de api/notificacoes. Sem preferência, devolve lista vazia (nada muda).
 *
 * Só corta o tipo de alerta conhecido da categoria; tipo novo ou desconhecido
 * continua aparecendo.
 */
export async function filtroDoSino(db: Db, organizacaoId: string, usuarioId: string): Promise<Prisma.AlertaIAWhereInput[]> {
  const prefs = await preferenciasDe(db, organizacaoId, usuarioId)
  const cortes: Prisma.AlertaIAWhereInput[] = []
  for (const [categoria, pref] of prefs) {
    if (!ehCategoria(categoria)) continue
    const tipos = tiposDeAlertaDa(categoria)
    if (!tipos.length) continue
    if (!pref.sino) {
      cortes.push({ tipoAlerta: { notIn: tipos } })
    } else if (pref.recorte === "meus") {
      // Alerta desta categoria de um card em que a pessoa não está: fora.
      // Alerta sem card continua.
      cortes.push({ NOT: { tipoAlerta: { in: tipos }, demanda: { is: { NOT: ondeEstaNoCard(usuarioId) } } } })
    }
  }
  return cortes
}
