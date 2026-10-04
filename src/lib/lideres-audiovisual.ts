import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/whatsapp"

// Saiu de app/api/demandas/route.ts (02/10/2026): arquivo de rota do Next só pode
// exportar handlers e config, e esta função é usada também pelo portal público,
// pela caixa de e-mail e pelas ferramentas da IA.
/**
 * Notifica os líderes do audiovisual da org sobre nova demanda:
 * alerta direcionado (sino, usuarioId do líder) + WhatsApp. Reusado pelo portal público.
 */
export async function notificarLideresAudiovisual(
  demandaId: string,
  codigo: string,
  titulo: string,
  organizacaoId?: string | null
) {
  try {
    if (!organizacaoId) return
    const lideres = await prisma.usuarioOrganizacao.findMany({
      where: { organizacaoId, liderAudiovisual: true, usuario: { status: "ativo" } },
      select: { usuario: { select: { id: true, telefone: true } } },
    })
    if (lideres.length === 0) return
    const msg = `🎬 *Nova demanda audiovisual!*\n\n📋 *${codigo}* — ${titulo}\n\nAcesse o sistema para atribuir e acompanhar.`
    for (const l of lideres) {
      await prisma.alertaIA.create({
        data: {
          organizacaoId,
          demandaId,
          usuarioId: l.usuario.id,
          tipoAlerta: "nova_demanda_audiovisual",
          mensagem: `🎬 Nova demanda audiovisual: ${codigo} — ${titulo}`,
          severidade: "aviso",
          acaoSugerida: "Atribuir responsável / acompanhar",
        },
      }).catch(() => null)
      if (l.usuario.telefone) {
        await sendWhatsappMessage(l.usuario.telefone, msg, undefined, organizacaoId).catch(() => null)
      }
    }
  } catch (e) {
    console.error("[Demanda] Falha ao notificar líderes audiovisual:", e)
  }
}
