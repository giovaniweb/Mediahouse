import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { registrarAuditoria } from "@/lib/auditoria"
import { videomakerPedeNota } from "@/lib/videomaker-pede-nota"
import { ConviteInvalido } from "@/lib/convites"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import {
  esperaMaterial,
  etapaDaGravacao,
  linkValido,
  materialCompleto,
  statusDoMaterial,
} from "@/lib/etapas-da-gravacao"

// O videomaker entrega pelo mesmo link do convite (Giovani, 29/10/2026): o
// link do drive com os brutos e, quando a edição é dele, o vídeo pronto. Sem
// login — a credencial é o token do convite, como no aceite (lib/convites.ts).
//
// Material completo (materialCompleto) anda a gravação sozinho: nossa edição
// vai para "Em edição", editado por ele ou sem edição vai para "Para enviar ao
// cliente". Na mesma hora nasce o pedido da nota (NotaFiscalUpload), que a
// própria página do convite oferece logo abaixo, e a operação é avisada.

type Tx = Prisma.TransactionClient

/** O convite que vale para entregar: o deste videomaker, nesta gravação, que ele aceitou. */
export async function conviteDaEntrega(tx: Pick<Tx, "conviteVideomaker" | "demanda">, organizacaoId: string, token: string) {
  const c = await tx.conviteVideomaker.findFirst({ where: { token, demanda: { organizacaoId } } })
  if (!c) throw new ConviteInvalido("Convite não encontrado", 404)
  const d = await tx.demanda.findFirst({ where: { id: c.demandaId, organizacaoId }, select: { videomakerId: true, statusInterno: true } })
  // Aceito pelo link, ou confirmado pela equipe por fora (o convite segue
  // "pendente", mas a gravação já é dele e já saiu de "A agendar").
  const dele = !!d && d.videomakerId === c.videomakerId
  const liberado = dele && (c.status === "aceito" || (c.status === "pendente" && etapaDaGravacao(d) !== "a_agendar"))
  return { convite: c, liberado }
}

export async function entregarMaterial(tx: Tx, e: {
  organizacaoId: string
  token: string
  linkBrutos?: string
  linkVideo?: string
}): Promise<ResultadoDaEntrega> {
  const { convite, liberado } = await conviteDaEntrega(tx, e.organizacaoId, e.token)
  if (!liberado) throw new ConviteInvalido("Este link ainda não está liberado para entrega.", 403)
  const r = await entregarNoCard(tx, {
    organizacaoId: e.organizacaoId, demandaId: convite.demandaId, videomakerId: convite.videomakerId,
    linkBrutos: e.linkBrutos, linkVideo: e.linkVideo,
  })
  await registrarAuditoria(tx, { organizacaoId: e.organizacaoId, tecnico: `convite:${convite.id}` }, {
    acao: "convite.entregar", recurso: "convite", recursoId: convite.id, correlationId: randomUUID(),
  })
  return r
}

export type ResultadoDaEntrega = { completo: boolean; mudouEtapa: boolean; demandaId: string; chegouAgora: boolean; parte: "brutos" | "video" }

/**
 * O núcleo da entrega, com a regra de cima, para quem já provou que pode
 * entregar NESTE card em nome de `videomakerId`: o link do convite (acima) e,
 * desde 12/11/2026, quem a empresa parceira escolheu para fazer a gravação
 * (POST /api/jobs/[id]/entrega). A nota nasce sempre para `videomakerId` — o
 * videomaker que a dona escalou.
 */
export async function entregarNoCard(tx: Tx, e: {
  organizacaoId: string
  demandaId: string
  videomakerId: string
  linkBrutos?: string
  linkVideo?: string
  /** O texto do histórico. Padrão: o do link do convite. */
  observacao?: { etapa: string; atualizacao: string }
  /** Quem aparece no histórico da dona. Padrão: ninguém (o link não tem login). */
  usuarioId?: string | null
}): Promise<ResultadoDaEntrega> {
  if (e.linkBrutos !== undefined && !linkValido(e.linkBrutos)) throw new ConviteInvalido("Confira o link dos brutos: precisa começar com https://", 400)
  if (e.linkVideo !== undefined && !linkValido(e.linkVideo)) throw new ConviteInvalido("Confira o link do vídeo: precisa começar com https://", 400)

  await tx.$queryRaw`SELECT id FROM demandas WHERE id=${e.demandaId} AND "organizacaoId"=${e.organizacaoId} FOR UPDATE`
  const d = await tx.demanda.findFirstOrThrow({ where: { id: e.demandaId, organizacaoId: e.organizacaoId } })
  if (d.videomakerId !== e.videomakerId) throw new ConviteInvalido("Esta gravação está com outro videomaker.", 403)
  if (etapaDaGravacao(d) === "concluido") throw new ConviteInvalido("Esta gravação já foi concluída.")
  // O vídeo pronto só vem do videomaker quando a edição é dele: nas outras, o
  // vídeo final é da equipe e o link do convite não alcança.
  if (e.linkVideo !== undefined && d.edicaoPor !== "videomaker") throw new ConviteInvalido("A edição desta gravação é nossa: mande só os brutos.", 403)
  // O que já chegou não se troca por aqui: a equipe já pode estar trabalhando
  // em cima (editando, ou com o vídeo pronto para o cliente).
  if (e.linkBrutos !== undefined && d.linkBrutos) throw new ConviteInvalido("Os brutos já foram recebidos. Para trocar o link, fale com a equipe.")
  if (e.linkVideo !== undefined && d.linkFinal) throw new ConviteInvalido("O vídeo pronto já foi recebido. Para trocar o link, fale com a equipe.")

  const linkBrutos = e.linkBrutos?.trim() ?? d.linkBrutos
  // Sem edição, o cliente recebe os próprios brutos.
  const linkFinal = d.linkFinal ?? e.linkVideo?.trim() ?? (d.edicaoPor === "sem_edicao" ? linkBrutos : null)
  const completo = materialCompleto({ linkBrutos, linkFinal, edicaoPor: d.edicaoPor })
  const chegouAgora = completo && esperaMaterial(d)
  const novo = chegouAgora ? statusDoMaterial(d.edicaoPor) : null

  await tx.demanda.update({
    where: { id: d.id, organizacaoId: e.organizacaoId },
    data: {
      linkBrutos, linkFinal,
      ...(novo ? { statusInterno: novo, statusVisivel: STATUS_PARA_COLUNA[novo] } : {}),
    },
  })
  const texto = e.observacao ?? {
    etapa: "Material entregue pelo videomaker no link do convite",
    atualizacao: "Videomaker atualizou o material no link do convite",
  }
  await tx.historicoStatus.create({
    data: {
      demandaId: d.id, statusAnterior: d.statusInterno, statusNovo: novo ?? "edicao_campos", origem: "automacao",
      usuarioId: e.usuarioId ?? null,
      observacao: novo ? texto.etapa : texto.atualizacao,
    },
  })
  if (chegouAgora && await videomakerPedeNota(tx, e.organizacaoId, e.videomakerId)) {
    // O pedido da nota nasce junto com o material, como no caminho de dentro
    // (só para videomaker externo).
    const nf = await tx.notaFiscalUpload.findFirst({ where: { demandaId: d.id, videomakerId: e.videomakerId } })
    if (!nf) await tx.notaFiscalUpload.create({ data: { demandaId: d.id, videomakerId: e.videomakerId } })
  }

  // Os avisos (WhatsApp, e-mail, sino) saem depois do commit, pela rota: um
  // aviso que falha não pode desfazer a entrega (lib/avisos-entrega-videomaker.ts).
  return { completo, mudouEtapa: !!novo, demandaId: d.id, chegouAgora, parte: e.linkVideo !== undefined ? "video" : "brutos" }
}
