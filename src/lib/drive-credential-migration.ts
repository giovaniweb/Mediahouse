import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { cifrarTokenDrive, lerTokenDrive, tokenDriveCifrado, validarChaveIntegracao } from "@/lib/integration-secret"

/** Lote limitado, simulação por padrão; nunca devolve credencial ou erro bruto. */
export async function migrarCredenciaisDrive(organizacaoId: string, aplicar = false, depoisDe?: string) {
  if (!organizacaoId) throw new Error("Informe uma empresa explícita")
  const chaveAtual = validarChaveIntegracao()
  return comOrg(organizacaoId, async () => {
    const rows = await prisma.configEmpresa.findMany({
      where: { organizacaoId, googleRefreshToken: { not: null }, ...(depoisDe ? { id: { gt: depoisDe } } : {}) },
      select: { id: true, googleRefreshToken: true }, orderBy: { id: "asc" }, take: 100,
    })
    const itens: { id: string; estado: string }[] = []
    for (const row of rows) {
      const token = row.googleRefreshToken!
      let novo: string
      try {
        const aberto = lerTokenDrive(token, organizacaoId)
        if (tokenDriveCifrado(token) && token.split(":")[2] === chaveAtual) {
          itens.push({ id: row.id, estado: "ja_protegido" }); continue
        }
        novo = cifrarTokenDrive(aberto, organizacaoId)
      } catch {
        itens.push({ id: row.id, estado: "ilegivel_reconectar" }); continue
      }
      if (!aplicar) { itens.push({ id: row.id, estado: "a_cifrar" }); continue }
      // O token legado nunca entra em argumentos SQL/Prisma (nem em seus logs
      // de erro). Bloqueio de linha + comparação em memória preserva concorrência.
      const atualizado = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM config_empresa WHERE id = ${row.id} AND "organizacaoId" = ${organizacaoId} FOR UPDATE`
        const atual = await tx.configEmpresa.findFirst({ where: { id: row.id, organizacaoId }, select: { googleRefreshToken: true } })
        if (atual?.googleRefreshToken !== token) return false
        await tx.configEmpresa.update({ where: { id: row.id }, data: { googleRefreshToken: novo } })
        await registrarAuditoria(tx, { organizacaoId, tecnico: "drive.rotacao" }, { acao: "manutencao.credenciais", recurso: "config_empresa", recursoId: row.id, correlationId: correlacaoAuditoria(), depois: { campos: ["credenciais"] } })
        return true
      })
      itens.push({ id: row.id, estado: atualizado ? "cifrado" : "alterado_concorrentemente" })
    }
    return { organizacaoId, simulacao: !aplicar, itens, proximoCursor: rows.length === 100 ? rows.at(-1)!.id : null }
  })
}
