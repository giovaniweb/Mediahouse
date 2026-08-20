// Leituras do vínculo empresa↔designer.
//
// Mesma arquitetura do editor e do videomaker: o perfil é da REDE, o combinado
// comercial e os fiscais são da empresa. A tabela tem 1 linha em produção e zero
// dado sensível preenchido — o helper existe para que a migração das consultas
// de escopo tenha para onde apontar, não porque haja dívida a resgatar.
import { prisma } from "@/lib/prisma"

/** Ids dos designers vinculados a ESTA empresa — substitui o filtro por organizacaoId. */
export async function designersDaEmpresa(
  organizacaoId: string,
  opcoes?: { apenasAtivos?: boolean }
): Promise<string[]> {
  const vinculos = await prisma.designerOrganizacao.findMany({
    where: {
      organizacaoId,
      ...(opcoes?.apenasAtivos ? { status: "ativo", emListaNegra: false } : {}),
    },
    select: { designerId: true },
  })
  return vinculos.map((v) => v.designerId)
}

/** Ids dos designers que ESTA empresa bloqueou. */
export async function bloqueadosDaEmpresa(organizacaoId: string): Promise<string[]> {
  const vinculos = await prisma.designerOrganizacao.findMany({
    where: { organizacaoId, emListaNegra: true },
    select: { designerId: true },
  })
  return vinculos.map((v) => v.designerId)
}
