import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId } from "@/lib/org"
import { videomakerDoUsuario, etiquetasDeOrganizacao } from "@/lib/campo-escopo"

const CAMPOS = {
  id: true,
  codigo: true,
  titulo: true,
  descricao: true,
  statusVisivel: true,
  statusInterno: true,
  tipoVideo: true,
  prioridade: true,
  dataLimite: true,
  cidade: true,
  localGravacao: true,
  linkFolderBrutos: true,
  linkFolderFinal: true,
  createdAt: true,
  organizacaoId: true,
  produtos: { select: { produto: { select: { nome: true } } }, take: 1 },
} as const

// GET /api/campo/demandas
//
// Duas leituras diferentes, de propósito:
//
//   videomaker  vê o trabalho DELE em todas as empresas que o contrataram — a
//               agenda de um freelancer é uma só. O filtro é a alocação
//               (`videomakerId`), não a empresa.
//   admin       vê as demandas da empresa ATIVA. Antes esta rota devolvia
//               demanda de todas as empresas da plataforma para qualquer
//               admin — passava despercebido porque só havia uma empresa real.
//
// Cada demanda vai etiquetada com a empresa dona, senão o videomaker recebe uma
// lista misturada sem saber para quem está gravando o quê.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const vm = await videomakerDoUsuario(session.user.id)

  let demandas
    // Quem tem perfil de videomaker vê O PRÓPRIO trabalho aqui, mesmo sendo admin
  // ou gestor. `/campo` é o app de quem está executando; a visão macro da
  // empresa é o dashboard. Antes, `!isAdmin` excluía justamente quem acumula os
  // dois papéis — e essa pessoa nunca via as demandas dela.
if (vm) {
    demandas = await prisma.demanda.findMany({
      where: { videomakerId: vm.id, statusVisivel: { notIn: ["finalizado"] } },
      select: CAMPOS,
      orderBy: [{ prioridade: "desc" }, { dataLimite: "asc" }],
    })
  } else {
    const organizacaoId = await getOrgId(session)
    if (!organizacaoId) return NextResponse.json({ demandas: [] })
    demandas = await prisma.demanda.findMany({
      where: { organizacaoId, statusVisivel: { notIn: ["finalizado"] } },
      select: CAMPOS,
      orderBy: [{ prioridade: "desc" }, { dataLimite: "asc" }],
    })
  }

  const etiquetas = await etiquetasDeOrganizacao(
    demandas.map((d) => d.organizacaoId).filter(Boolean) as string[]
  )

  return NextResponse.json({
    demandas: demandas.map((d) => ({
      ...d,
      empresa: d.organizacaoId ? etiquetas.get(d.organizacaoId) ?? null : null,
    })),
    // A tela só mostra a etiqueta quando há mais de uma empresa em jogo: com uma
    // só, ela seria ruído repetido em toda linha.
    multiempresa: new Set(demandas.map((d) => d.organizacaoId).filter(Boolean)).size > 1,
  })
}
