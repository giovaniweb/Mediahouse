// Escopo "minhas demandas" — quais demandas uma pessoa considera suas.
//
// "Responsável" no NuFlow está espalhado por várias dimensões (herança de como o
// produto cresceu): a M2M de responsáveis, a coluna derivada, o videomaker e o
// editor do audiovisual, o designer e o social do Growth, o gestor e o
// solicitante. Quem se organiza por "o que é meu" espera ver todas elas.
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

// Monta o filtro de demandas ligadas a um usuário dentro de uma organização.
// Resolve os espelhos profissionais (Videomaker/Editor/Designer têm id próprio,
// diferente do id de Usuario) antes de montar o OR.
export async function filtroMinhasDemandas(
  usuarioId: string,
  organizacaoId: string
): Promise<Prisma.DemandaWhereInput> {
  const [videomaker, editor, designer] = await Promise.all([
    prisma.videomaker.findFirst({ where: { usuarioId }, select: { id: true } }),
    prisma.editor.findFirst({ where: { usuarioId, organizacaoId }, select: { id: true } }),
    prisma.designer.findFirst({ where: { usuarioId, organizacaoId }, select: { id: true } }),
  ])

  const alternativas: Prisma.DemandaWhereInput[] = [
    { responsaveis: { some: { usuarioId } } },
    { responsavelId: usuarioId },
    { gestorId: usuarioId },
    { solicitanteId: usuarioId },
    { socialId: usuarioId },
  ]
  if (videomaker) alternativas.push({ videomakerId: videomaker.id })
  if (editor) alternativas.push({ editorId: editor.id })
  if (designer) alternativas.push({ designerId: designer.id })

  return { OR: alternativas }
}
