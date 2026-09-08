// "Aconteceu isso. Agora é sua vez." — atravessando a fronteira entre empresas.
//
// Este é o ponto que faz o espelhamento valer a pena e o que o código NÃO fazia
// sozinho: quando a produtora terceirizada move o card, a empresa dona precisa
// ver o movimento. `sendWhatsappMessage` e `quemRecebeTudo` recebem o
// `organizacaoId` da ROTA — que numa movimentação do espelho é o DESTINO. Sem
// tratamento, a executora avisa a si mesma e a dona não fica sabendo de nada.
//
// §39 é regra absoluta: nenhum canal novo. Isto entra pelo sino (`AlertaIA`) e
// pelo WhatsApp que já existem, declarando a empresa da dona com `comOrg` —
// exatamente o que `comOrg` existe para fazer fora de uma requisição da própria
// empresa.
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { quemRecebeTudo } from "@/lib/notificados"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { COLUNAS_LABEL, STATUS_PARA_COLUNA } from "@/lib/status"
import type { StatusInterno } from "@prisma/client"

/**
 * A COLUNA, não o status interno.
 *
 * `edicao_finalizada` não diz nada a um gestor que não vive dentro do enum, e a
 * dona do card quer saber em que ponto do quadro o job está. Vinte e sete
 * valores viram seis, que é o vocabulário que ela já usa.
 */
function ondeEstaAgora(statusInterno: string): string {
  const coluna = STATUS_PARA_COLUNA[statusInterno as StatusInterno]
  return coluna ? COLUNAS_LABEL[coluna] : statusInterno
}

type AvisoEspelho = {
  demandaId: string
  codigo: string
  titulo: string
  /** Empresa DONA do card — quem precisa saber. */
  donaId: string
  /** Nome da empresa que executou o movimento. */
  nomeExecutora: string
  statusNovo: string
}

/**
 * Avisa a empresa dona de que a parceira mexeu no card dela.
 *
 * Duas escolhas que valem explicação:
 *
 * A mensagem nomeia a EMPRESA, nunca a pessoa. O quadro de pessoal da parceira
 * não é assunto da dona, e vazar nome de funcionário de terceiro num aviso de
 * WhatsApp é o tipo de detalhe que ninguém revisa até virar problema.
 *
 * Não há risco de aviso duplicado com o fluxo normal: as duas listas de
 * destinatários saem de empresas diferentes, e `quemRecebeTudo` filtra por
 * membership. Uma pessoa que fosse membro das duas receberia duas mensagens
 * diferentes — uma como executora, outra como dona —, e isso é correto: são
 * dois papéis.
 */
export async function avisarOrigemDoEspelho(aviso: AvisoEspelho): Promise<void> {
  await comOrg(aviso.donaId, async () => {
    const texto =
      `🤝 *${aviso.nomeExecutora}* moveu um job seu\n\n` +
      `📋 *${aviso.codigo}* — ${aviso.titulo}\n` +
      `➡️ ${ondeEstaAgora(aviso.statusNovo)}`

    await prisma.alertaIA
      .create({
        data: {
          organizacaoId: aviso.donaId,
          demandaId: aviso.demandaId,
          tipoAlerta: "espelho_movimentou",
          mensagem: `${aviso.nomeExecutora} moveu ${aviso.codigo} para ${ondeEstaAgora(aviso.statusNovo)}.`,
          severidade: "info",
        },
      })
      .catch(() => null)

    const gestores = await quemRecebeTudo(aviso.donaId).catch(() => [])
    await Promise.all(
      gestores
        .map((g) => sendWhatsappMessage(g.telefone, texto, aviso.demandaId, aviso.donaId).catch(() => null))
    )
  })
}
