import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { EVENTO_EDICAO, EVENTO_RESPONSAVEL } from "@/lib/status"
import type { Prisma } from "@prisma/client"

// GET /api/auditoria — o que aconteceu no sistema, por período e por pessoa.
//
// O histórico sempre existiu, mas só dentro do card: para saber "quem mexeu
// nisso" era preciso abrir demanda por demanda. Não havia como responder "o que
// fulano fez esta semana" nem "o que mudou ontem" — pergunta que todo cliente
// B2B acaba fazendo.
//
// HistoricoStatus não tem coluna de organização: o escopo vem pela demanda.

export const dynamic = "force-dynamic"

const POR_PAGINA = 50

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  // Registro de auditoria mostra a atividade de todo mundo — é leitura de gestão.
  if (!ehGestor(session)) {
    return NextResponse.json({ error: "Requer perfil de gestor" }, { status: 403 })
  }

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const sp = req.nextUrl.searchParams
  const de = sp.get("de")
  const ate = sp.get("ate")
  const usuarioId = sp.get("usuarioId")
  const tipo = sp.get("tipo") // "edicao" | "responsavel" | "status"
  const busca = sp.get("busca")?.trim()
  const pagina = Math.max(1, Number(sp.get("pagina") ?? "1") || 1)

  const where: Prisma.HistoricoStatusWhereInput = {
    demanda: { organizacaoId },
  }

  if (usuarioId) where.usuarioId = usuarioId

  if (de || ate) {
    where.createdAt = {
      ...(de ? { gte: new Date(`${de}T00:00:00`) } : {}),
      // Fim do dia: sem isto, filtrar "até hoje" perderia tudo que aconteceu hoje.
      ...(ate ? { lte: new Date(`${ate}T23:59:59.999`) } : {}),
    }
  }

  // Os dois eventos que não são mudança de coluna viajam no campo statusNovo
  // (ver src/lib/status.ts) — por isso o filtro por tipo é sobre ele.
  if (tipo === "edicao") where.statusNovo = EVENTO_EDICAO
  else if (tipo === "responsavel") where.statusNovo = EVENTO_RESPONSAVEL
  else if (tipo === "status") where.statusNovo = { notIn: [EVENTO_EDICAO, EVENTO_RESPONSAVEL] }

  if (busca) {
    where.OR = [
      { observacao: { contains: busca, mode: "insensitive" } },
      { demanda: { organizacaoId, codigo: { contains: busca, mode: "insensitive" } } },
      { demanda: { organizacaoId, titulo: { contains: busca, mode: "insensitive" } } },
    ]
  }

  const [registros, total] = await Promise.all([
    prisma.historicoStatus.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: POR_PAGINA,
      skip: (pagina - 1) * POR_PAGINA,
      select: {
        id: true,
        statusAnterior: true,
        statusNovo: true,
        observacao: true,
        origem: true,
        createdAt: true,
        usuario: { select: { id: true, nome: true } },
        demanda: { select: { id: true, codigo: true, titulo: true } },
      },
    }),
    prisma.historicoStatus.count({ where }),
  ])

  return NextResponse.json({
    registros,
    total,
    pagina,
    porPagina: POR_PAGINA,
    temMais: pagina * POR_PAGINA < total,
  })
}
