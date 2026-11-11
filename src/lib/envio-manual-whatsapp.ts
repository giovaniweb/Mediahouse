// "Enviar para um WhatsApp" (Giovani, 11/11/2026): muitos cards não têm o
// telefone de quem pediu. Na etapa "Enviar ao cliente" da gravação externa (o
// link /d/<token>, onde o cliente vê e baixa o vídeo) e na aprovação das
// Demandas (o link /aprovar/<token>), digita-se o número — do cliente ou de
// qualquer pessoa — e o sistema manda pela fila do WhatsApp da empresa.
//
// A porta para o número externo é só esta: o LogAutomacao gravado aqui, na
// mesma transação da saída, é a autorização que a fila confere
// (whatsapp-outbox.ts → destinoEnvioManual). Quem pode mandar é decidido antes,
// na rota (guardaDoEnvio, a régua de quem gera o link de aprovação).
import type { Prisma } from "@prisma/client"
import { linkPublicoDaDemanda, novoTokenPublico } from "@/lib/acompanhamento-gravacao"
import { EVENTO_WHATSAPP_MANUAL } from "@/lib/status"
import { validarWhatsappBR } from "@/lib/telefone-br"
import { AUTOMACAO_ENVIO_MANUAL, VALIDADE_ENVIO_MANUAL_MS, criarSaida, hashTelefone } from "@/lib/whatsapp-outbox"

type Tx = Prisma.TransactionClient
export type LinkDoEnvio = "entrega" | "aprovacao"
/** Por card, em 24h: o bastante para o dia a dia, pouco para virar disparo em massa. */
export const LIMITE_ENVIOS_MANUAIS = 20

export class EnvioInvalido extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

const primeiroNome = (nome?: string | null) => nome?.trim().split(/\s+/)[0] || null
const dataCurta = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(d)

export function textoDoEnvio(e: { link: LinkDoEnvio; nome?: string | null; titulo: string; codigo: string; url: string; validoAte?: Date | null }) {
  const ola = primeiroNome(e.nome) ? `Olá, ${primeiroNome(e.nome)}!` : "Olá!"
  if (e.link === "entrega") {
    return `🎬 *Seu vídeo está pronto*\n\n${ola} O vídeo de *${e.titulo}* (${e.codigo}) está pronto. Para ver e baixar:\n${e.url}`
  }
  return [
    `🎥 *Vídeo pronto para aprovação*\n\n${ola} O vídeo de *${e.titulo}* (${e.codigo}) está pronto para você ver e aprovar:\n${e.url}`,
    e.validoAte ? `_O link vale até ${dataCurta(e.validoAte)}._` : null,
  ].filter(Boolean).join("\n\n")
}

/** O endereço que vai na mensagem: o link de entrega (cria, como o Compartilhar) ou a aprovação pendente. */
async function linkDoCard(tx: Tx, d: { id: string; publicToken: string | null; publicTokenAtivo: boolean; publicTokenExpiraEm: Date | null; linkFinal: string | null }, link: LinkDoEnvio) {
  const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").trim().replace(/\/$/, "")
  if (link === "aprovacao") {
    const a = await tx.aprovacaoVideo.findFirst({ where: { demandaId: d.id, status: "pendente", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: "desc" } })
    if (!a) throw new EnvioInvalido("Gere o link de aprovação primeiro (“Enviar para aprovação”).")
    return { url: `${base}/aprovar/${a.token}`, validoAte: a.expiresAt }
  }
  const temVideo = !!d.linkFinal?.trim() || !!await tx.arquivo.findFirst({ where: { demandaId: d.id, tipoArquivo: "final" }, select: { id: true } })
  if (!temVideo) throw new EnvioInvalido("Falta o vídeo final em “Arquivos”.")
  if (d.publicTokenExpiraEm && d.publicTokenExpiraEm <= new Date()) throw new EnvioInvalido("O link de acompanhamento venceu. Gere outro no “Compartilhar”.")
  const token = d.publicToken ?? novoTokenPublico()
  if (!d.publicToken || !d.publicTokenAtivo) await tx.demanda.update({ where: { id: d.id }, data: { publicToken: token, publicTokenAtivo: true } })
  return { url: linkPublicoDaDemanda(token), validoAte: null }
}

/**
 * Tudo numa transação: o registro que autoriza o número, a saída na fila, a
 * linha do histórico e (se pedido e o campo estiver vazio) o número no card.
 */
export async function enviarParaWhatsapp(tx: Tx, e: {
  organizacaoId: string; usuarioId: string; usuarioNome?: string | null; demandaId: string
  link: LinkDoEnvio; telefone: string; nome?: string | null; salvarNoCard?: boolean; chave: string
}) {
  const numero = validarWhatsappBR(e.telefone)
  if (!numero.ok) throw new EnvioInvalido(numero.erro, 400)
  await tx.$queryRaw`SELECT id FROM demandas WHERE id=${e.demandaId} AND "organizacaoId"=${e.organizacaoId} FOR UPDATE`
  const d = await tx.demanda.findFirst({ where: { id: e.demandaId, organizacaoId: e.organizacaoId }, select: {
    id: true, codigo: true, titulo: true, statusInterno: true, linkFinal: true, publicToken: true, publicTokenAtivo: true, publicTokenExpiraEm: true,
    clienteFinalTelefone: true, telefoneSolicitante: true,
  } })
  if (!d) throw new EnvioInvalido("Não encontrado", 404)
  const recentes = await tx.logAutomacao.count({ where: { demandaId: d.id, automacao: AUTOMACAO_ENVIO_MANUAL, createdAt: { gt: new Date(Date.now() - VALIDADE_ENVIO_MANUAL_MS) } } })
  if (recentes >= LIMITE_ENVIOS_MANUAIS) throw new EnvioInvalido(`Já foram ${LIMITE_ENVIOS_MANUAIS} envios deste card nas últimas 24h. Tente mais tarde.`, 429)
  const { url, validoAte } = await linkDoCard(tx, d, e.link)
  const nome = e.nome?.trim().slice(0, 80) || null
  const log = await tx.logAutomacao.create({ data: { demandaId: d.id, automacao: AUTOMACAO_ENVIO_MANUAL, status: "sucesso",
    outputJson: { telefoneHash: hashTelefone(numero.telefone), usuarioId: e.usuarioId, link: e.link } } })
  const saida = await criarSaida(tx, { organizacaoId: e.organizacaoId, origem: "manual", envioManual: log.id, referencia: log.id,
    chave: `envio-manual:${e.chave}`, telefone: numero.telefone, expiraEm: new Date(Date.now() + VALIDADE_ENVIO_MANUAL_MS),
    texto: textoDoEnvio({ link: e.link, nome, titulo: d.titulo, codigo: d.codigo, url, validoAte }) })
  const oQue = e.link === "entrega" ? "Link do vídeo" : "Link de aprovação"
  await tx.historicoStatus.create({ data: { demandaId: d.id, statusAnterior: d.statusInterno, statusNovo: EVENTO_WHATSAPP_MANUAL,
    usuarioId: e.usuarioId, origem: "manual",
    observacao: `${oQue} enviado pelo WhatsApp para ${nome ? `${nome} · ` : ""}${numero.legivel}${e.usuarioNome ? ` · por ${e.usuarioNome}` : ""}` } })
  // Salvar no card: só preenche o número que está vazio, nunca troca um que já existe.
  let salvou = false
  if (e.salvarNoCard) {
    const externo = e.link === "entrega"
    const vazio = externo ? !d.clienteFinalTelefone?.trim() : !d.telefoneSolicitante?.trim()
    if (vazio) {
      // Só o número: o nome digitado é de quem recebe (pode ser a secretária),
      // não do cliente — gravá-lo trocaria o nome e o título do card.
      await tx.demanda.update({ where: { id: d.id }, data: externo ? { clienteFinalTelefone: numero.telefone } : { telefoneSolicitante: numero.telefone } })
      salvou = true
    }
  }
  return { ok: true, saidaId: saida.id, para: numero.legivel, nome, salvouNoCard: salvou }
}
