import type { StatusVisivel } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { gerarChaveMcp } from "@/lib/mcp-token"
import { COLUNAS_LABEL } from "@/lib/status"

// Configurações → Assistentes (MCP): quem tem chave, o que cada chave criou e o
// "desfazer" do que ninguém mexeu. As rotas conferem quem pode; aqui é só a regra.

export async function listarChaves(organizacaoId: string) {
  return comOrg(organizacaoId, async () => {
    const [chaves, membros] = await Promise.all([
      prisma.tokenMcp.findMany({
        where: { organizacaoId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, rotulo: true, createdAt: true, revogadoEm: true,
          usuario: { select: { id: true, nome: true } },
          _count: { select: { demandas: true } },
        },
      }),
      prisma.usuarioOrganizacao.findMany({
        where: { organizacaoId, usuario: { status: "ativo" } },
        select: { papel: true, usuario: { select: { id: true, nome: true } } },
        orderBy: { usuario: { nome: "asc" } },
      }),
    ])
    return {
      chaves: chaves.map((c) => ({
        id: c.id, rotulo: c.rotulo, pessoa: c.usuario, criadaEm: c.createdAt, revogadaEm: c.revogadoEm, demandasCriadas: c._count.demandas,
      })),
      pessoas: membros.map((m) => ({ id: m.usuario.id, nome: m.usuario.nome, papel: m.papel })),
    }
  })
}

/** Gera a chave de uma pessoa ATIVA da empresa. A chave volta uma vez só. */
export async function gerarChave(organizacaoId: string, usuarioId: string, rotulo: string) {
  return comOrg(organizacaoId, async () => {
    const membro = await prisma.usuarioOrganizacao.findUnique({
      where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
      select: { usuario: { select: { status: true } } },
    })
    if (membro?.usuario.status !== "ativo") return null
    const { chave, hash } = gerarChaveMcp()
    const t = await prisma.tokenMcp.create({ data: { organizacaoId, usuarioId, hash, rotulo }, select: { id: true } })
    return { id: t.id, chave }
  })
}

/** true se revogou agora; false se não existe nesta empresa ou já estava revogada. */
export async function revogarChave(organizacaoId: string, id: string) {
  const r = await comOrg(organizacaoId, () =>
    prisma.tokenMcp.updateMany({ where: { id, organizacaoId, revogadoEm: null }, data: { revogadoEm: new Date() } })
  )
  return r.count > 0
}

type ParaJulgar = {
  statusVisivel: StatusVisivel
  _count: { historicos: number; comentarios: number; arquivos: number }
}

/**
 * Por que a demanda NÃO pode ser desfeita, ou null se pode. "Ninguém mexeu" =
 * ainda na Entrada, só com o registro de criação no histórico (edição, troca de
 * status e de pessoa deixam rastro lá — lib/historico.ts), sem comentário e sem
 * arquivo. O que já andou fica para a equipe resolver à mão.
 */
export function motivoParaManter(d: ParaJulgar): string | null {
  if (d.statusVisivel !== "entrada") return "já saiu da Entrada"
  if (d._count.historicos > 1) return "alguém já mexeu nela"
  if (d._count.comentarios > 0) return "tem comentário"
  if (d._count.arquivos > 0) return "tem arquivo"
  return null
}

export async function demandasDaChave(organizacaoId: string, tokenId: string) {
  return comOrg(organizacaoId, async () => {
    const demandas = await prisma.demanda.findMany({
      where: { organizacaoId, mcpTokenId: tokenId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, codigo: true, titulo: true, statusVisivel: true, createdAt: true,
        _count: { select: { historicos: true, comentarios: true, arquivos: true } },
      },
    })
    return demandas.map((d) => ({
      id: d.id, codigo: d.codigo, titulo: d.titulo, status: COLUNAS_LABEL[d.statusVisivel], criadaEm: d.createdAt,
      motivoParaManter: motivoParaManter(d),
    }))
  })
}

/**
 * Apaga as demandas da chave que ninguém mexeu. Cada uma é conferida de novo no
 * próprio DELETE: se alguém comentou, anexou ou mudou a coluna entre a lista e
 * o clique, ela fica.
 */
export async function desfazerIntocadas(organizacaoId: string, tokenId: string) {
  const lista = await demandasDaChave(organizacaoId, tokenId)
  const apagadas: { id: string; codigo: string }[] = []
  const mantidas: { codigo: string; motivo: string }[] = []
  for (const d of lista) {
    if (d.motivoParaManter) { mantidas.push({ codigo: d.codigo, motivo: d.motivoParaManter }); continue }
    const r = await comOrg(organizacaoId, () => prisma.demanda.deleteMany({
      where: {
        id: d.id, organizacaoId, mcpTokenId: tokenId, statusVisivel: "entrada",
        comentarios: { none: {} }, arquivos: { none: {} },
      },
    }))
    if (r.count) apagadas.push({ id: d.id, codigo: d.codigo })
    else mantidas.push({ codigo: d.codigo, motivo: "mudou enquanto desfazia" })
  }
  return { apagadas, mantidas }
}
