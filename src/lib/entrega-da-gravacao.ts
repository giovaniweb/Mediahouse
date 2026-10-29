import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { registrarAuditoria } from "@/lib/auditoria"
import { ConviteInvalido } from "@/lib/convites"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { criarSaida, destinoAutorizado } from "@/lib/whatsapp-outbox"
import { telefoneCompleto } from "@/lib/whatsapp-identidade"
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
}): Promise<{ completo: boolean; mudouEtapa: boolean }> {
  const { convite, liberado } = await conviteDaEntrega(tx, e.organizacaoId, e.token)
  if (!liberado) throw new ConviteInvalido("Este link ainda não está liberado para entrega.", 403)
  if (e.linkBrutos !== undefined && !linkValido(e.linkBrutos)) throw new ConviteInvalido("Confira o link dos brutos: precisa começar com https://", 400)
  if (e.linkVideo !== undefined && !linkValido(e.linkVideo)) throw new ConviteInvalido("Confira o link do vídeo: precisa começar com https://", 400)

  await tx.$queryRaw`SELECT id FROM demandas WHERE id=${convite.demandaId} AND "organizacaoId"=${e.organizacaoId} FOR UPDATE`
  const d = await tx.demanda.findFirstOrThrow({ where: { id: convite.demandaId, organizacaoId: e.organizacaoId } })
  if (d.videomakerId !== convite.videomakerId) throw new ConviteInvalido("Esta gravação está com outro videomaker.", 403)
  if (etapaDaGravacao(d) === "concluido") throw new ConviteInvalido("Esta gravação já foi concluída.")

  const linkBrutos = e.linkBrutos?.trim() ?? d.linkBrutos
  // Sem edição, o cliente recebe os próprios brutos.
  const linkFinal = e.linkVideo?.trim() ?? (d.edicaoPor === "sem_edicao" ? linkBrutos : d.linkFinal)
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
  await tx.historicoStatus.create({
    data: {
      demandaId: d.id, statusAnterior: d.statusInterno, statusNovo: novo ?? "edicao_campos", origem: "automacao",
      observacao: novo ? "Material entregue pelo videomaker no link do convite" : "Videomaker atualizou o material no link do convite",
    },
  })
  if (chegouAgora) {
    // O pedido da nota nasce junto com o material, como no caminho de dentro.
    const nf = await tx.notaFiscalUpload.findFirst({ where: { demandaId: d.id, videomakerId: convite.videomakerId } })
    if (!nf) await tx.notaFiscalUpload.create({ data: { demandaId: d.id, videomakerId: convite.videomakerId } })
  }
  await registrarAuditoria(tx, { organizacaoId: e.organizacaoId, tecnico: `convite:${convite.id}` }, {
    acao: "convite.entregar", recurso: "convite", recursoId: convite.id, correlationId: randomUUID(),
  })

  if (chegouAgora) {
    // A operação fica sabendo, pelo mesmo caminho do aceite do convite.
    const gestores = await tx.usuario.findMany({ where: { status: "ativo", telefone: { not: null },
      organizacoes: { some: { organizacaoId: e.organizacaoId, OR: [{ papel: { in: ["admin", "gestor"] } }, { recebeTodosAvisos: true }] } },
    }, select: { id: true, telefone: true } })
    const cliente = d.clienteFinalNome?.trim() || d.titulo
    for (const g of gestores) {
      const telefone = telefoneCompleto(g.telefone)
      const destino = telefone ? await destinoAutorizado(tx, e.organizacaoId, telefone) : null
      if (!telefone || destino?.tipo !== "usuario" || destino.id !== g.id) continue
      await criarSaida(tx, { organizacaoId: e.organizacaoId, origem: "manual", referencia: convite.id,
        chave: `convite:${convite.id}:material:${g.id}`, telefone, expiraEm: new Date(Date.now() + 86400_000),
        texto: `📁 Material recebido — ${d.codigo}: ${cliente}. ${novo === "aprovado" ? "Pronto para enviar ao cliente." : "Vai para a edição."}` })
    }
  }
  return { completo, mudouEtapa: !!novo }
}
