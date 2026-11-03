// Registro de login recusado e travado no histórico de auditoria da empresa.
//
// Só quando a conta existe: é ela que diz a empresa (o registro de auditoria é
// sempre de uma empresa) e é a ela que interessa saber que alguém está tentando
// entrar com o login de uma pessoa da equipe. Tentativa num e-mail que não
// existe não tem empresa a quem contar e fica só na contagem do limite.
//
// Nada da tentativa vai junto: nem a senha, nem o e-mail digitado. O registro é
// "a conta <id> teve login recusado", e o ator é técnico ("login"), porque quem
// tentou não está identificado.
//
// A trava entra no histórico uma vez a cada 15 minutos por conta.
//
// Falha ao registrar não muda a resposta do login: o histórico é para ver
// depois, e derrubar o login por ele seria trocar um problema por outro.
import { prisma } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { comOrg } from "@/lib/org-contexto"
import { correlacaoAuditoria, registrarAuditoria } from "@/lib/auditoria"
import { consumirLimitePublico } from "@/lib/limite-publico"

export async function registrarTentativaDeLogin(usuarioId: string, resultado: "recusado" | "bloqueado"): Promise<void> {
  try {
    // Um robô insistindo numa conta travada geraria uma linha por tentativa e
    // afogaria o histórico. A trava entra uma vez a cada 15 minutos por conta.
    if (resultado === "bloqueado" && !(await consumirLimitePublico(`auditoria-login:${usuarioId}`, 1, 15 * 60))) return
    const vinculos = await prismaAuth.usuarioOrganizacao.findMany({
      where: { usuarioId },
      select: { organizacaoId: true },
      take: 5,
    })
    const correlationId = correlacaoAuditoria()
    for (const { organizacaoId } of vinculos) {
      await comOrg(organizacaoId, () => registrarAuditoria(prisma, { organizacaoId, tecnico: "login" }, {
        acao: resultado === "bloqueado" ? "login.bloqueado" : "login.recusado",
        recurso: "usuario",
        recursoId: usuarioId,
        resultado: "negado",
        correlationId,
      }))
    }
  } catch (e) {
    console.error("[auditoria-login] não registrou a tentativa:", (e as Error).message)
  }
}
