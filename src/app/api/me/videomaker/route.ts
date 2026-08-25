import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { etiquetasDeOrganizacao } from "@/lib/campo-escopo"

// GET /api/me/videomaker — perfil + demandas + NFs do videomaker logado.
//
// Cross-company DE PROPÓSITO: o profissional é da rede, atende várias empresas,
// e a tela dele tem que mostrar tudo o que ele tem para fazer. O escopo é o
// usuário logado — mais estreito que o de organização, não mais largo.
//
// O que faltava era o rótulo. A lista vinha achatada, sem dizer de quem é cada
// demanda: o videomaker via oito trabalhos e não sabia para qual empresa era
// cada um, e a nota fiscal saía sem indicar de quem cobrar. Agora cada demanda e
// cada NF vêm com `empresa`, no mesmo formato e com a mesma etiqueta que /campo
// já usa.
//
// A empresa vem por consulta separada (`etiquetasDeOrganizacao`) e não por
// `include`: `Demanda.organizacaoId` ainda não tem relação declarada no schema —
// é uma das chaves estrangeiras que faltam, e criá-la é Fase 2.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const videomaker = await prisma.videomaker.findFirst({
    where: { usuarioId: session.user.id },
    include: {
      demandas: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          codigo: true,
          titulo: true,
          tipoVideo: true,
          statusVisivel: true,
          statusInterno: true,
          prioridade: true,
          dataLimite: true,
          dataCaptacao: true,
          linkBrutos: true,
          linkFinal: true,
          linkFolderBrutos: true,
          linkFolderFinal: true,
          finalizadaEm: true,
          createdAt: true,
          organizacaoId: true,
        },
      },
      notasFiscais: {
        orderBy: { createdAt: "desc" },
        include: {
          demanda: { select: { codigo: true, titulo: true, organizacaoId: true } },
        },
      },
    },
  })

  if (!videomaker) {
    return NextResponse.json({ videomaker: null })
  }

  const { demandas, notasFiscais, ...perfil } = videomaker
  const etiquetas = await etiquetasDeOrganizacao([
    ...demandas.map((d) => d.organizacaoId),
    ...notasFiscais.map((nf) => nf.demanda?.organizacaoId),
  ].filter((id): id is string => Boolean(id)))

  return NextResponse.json({
    videomaker: {
      ...perfil,
      demandas: demandas.map(({ organizacaoId, ...d }) => ({
        ...d,
        empresa: organizacaoId ? etiquetas.get(organizacaoId) ?? null : null,
      })),
      notasFiscais: notasFiscais.map(({ demanda, ...nf }) => ({
        ...nf,
        demanda: demanda
          ? {
              codigo: demanda.codigo,
              titulo: demanda.titulo,
              empresa: demanda.organizacaoId ? etiquetas.get(demanda.organizacaoId) ?? null : null,
            }
          : null,
      })),
    },
  })
}
