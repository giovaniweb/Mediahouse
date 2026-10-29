import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { ehGestor } from "@/lib/papel"
import { hojeEmSaoPaulo } from "@/lib/datas"
import { contratoEfetivo, quadroDoCard } from "@/lib/quadro-do-card"
import { selectContrato } from "@/lib/quadro-do-card-server"
import { podeAprovarEntrega, SELECT_PESSOAS_DA_ENTREGA } from "@/lib/quem-aprova"
import { resumoDoPedido } from "@/lib/meus-pedidos"
import type { Prisma } from "@prisma/client"

// Quantos encerrados a tela mostra; os abertos vêm todos.
const ENCERRADOS = 20

// GET /api/meus-pedidos — o que a pessoa logada pediu, com o andamento em
// palavras (lib/meus-pedidos.ts). É a tela "Meus Pedidos" do solicitante.
//
// O filtro é `solicitanteId` = a própria pessoa, nesta empresa: só o que ela
// pediu, seja qual for o papel. O `select` é uma allowlist; o que entra só para
// montar o resumo (status interno, histórico, pessoas, contrato) não sai cru.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const select = {
    ...SELECT_PESSOAS_DA_ENTREGA,
    id: true, codigo: true, titulo: true, clienteFinalNome: true,
    statusVisivel: true, statusInterno: true, dataLimite: true,
    createdAt: true, updatedAt: true, finalizadaEm: true,
    tipoVideo: true, departamento: true, tipoGravacao: true, edicaoPor: true,
    // Sobrepõe o `videomaker` de SELECT_PESSOAS_DA_ENTREGA, mantendo o usuarioId dele.
    videomakerId: true, videomaker: { select: { nome: true, usuarioId: true, ...selectContrato(organizacaoId) } },
    dataCaptacao: true, dataEvento: true, localGravacao: true, localEvento: true,
    historicos: { select: { statusNovo: true, createdAt: true }, orderBy: { createdAt: "asc" as const }, take: 200 },
  } satisfies Prisma.DemandaSelect

  const meus: Prisma.DemandaWhereInput = { organizacaoId, solicitanteId: session.user.id }
  const fechado: Prisma.DemandaWhereInput = {
    OR: [{ statusVisivel: "finalizado" }, { statusInterno: { in: ["encerrado", "expirado"] } }],
  }
  const [abertos, encerrados, totalEncerrados] = await Promise.all([
    prisma.demanda.findMany({ where: { AND: [meus, { NOT: fechado }] }, select, orderBy: { createdAt: "desc" } }),
    prisma.demanda.findMany({ where: { AND: [meus, fechado] }, select, orderBy: { updatedAt: "desc" }, take: ENCERRADOS }),
    prisma.demanda.count({ where: { AND: [meus, fechado] } }),
  ])

  const hoje = hojeEmSaoPaulo()
  const quem = { usuarioId: session.user.id, gestor: ehGestor(session) }
  const pedidos = [...abertos, ...encerrados].map((d) => {
    const contratoVideomaker = d.videomaker ? contratoEfetivo(d.videomaker.vinculos[0]?.tipoContrato, d.videomaker.tipoContrato) : null
    const resumo = resumoDoPedido({
      ...d,
      videomaker: d.videomaker ? { nome: d.videomaker.nome } : null,
      ehGravacao: quadroDoCard({ ...d, contratoVideomaker }) === "jobs",
      podeAprovar: podeAprovarEntrega(quem, d),
    }, hoje)
    return {
      id: d.id, codigo: d.codigo, titulo: d.titulo, cliente: d.clienteFinalNome?.trim() || null,
      prazo: d.dataLimite, criadoEm: d.createdAt, atualizadoEm: d.updatedAt, entregueEm: d.finalizadaEm,
      ...resumo,
    }
  })

  return NextResponse.json({ pedidos, totalEncerrados }, { headers: { "Cache-Control": "private, no-store" } })
}
