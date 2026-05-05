import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calcularPeso } from "@/lib/peso-demanda"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import type { Prioridade, Departamento } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

function gerarCodigo(): string {
  const ano = new Date().getFullYear().toString().slice(-2)
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `VOP-${ano}-${rand}`
}

// POST /api/demandas/[id]/duplicate
// Cria uma cópia da demanda com novo código, status inicial e "(Cópia)" no título
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  // Busca demanda original com produto vinculado
  const original = await prisma.demanda.findUnique({
    where: { id },
    include: {
      produtos: { select: { produtoId: true } },
    },
  })

  if (!original) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  // Status inicial — mesma lógica do POST /api/demandas
  const statusInterno = original.prioridade === "urgente"
    ? "urgencia_pendente_aprovacao"
    : "aguardando_aprovacao_interna"
  const statusVisivel = STATUS_PARA_COLUNA[statusInterno]
  const peso = calcularPeso(original.tipoVideo, original.prioridade as Prioridade)

  const nova = await prisma.demanda.create({
    data: {
      codigo: gerarCodigo(),
      titulo: `${original.titulo} (Cópia)`,
      descricao: original.descricao,
      departamento: original.departamento as Departamento,
      tipoVideo: original.tipoVideo,
      cidade: original.cidade,
      prioridade: original.prioridade as Prioridade,
      motivoUrgencia: original.motivoUrgencia,
      statusInterno: statusInterno as Parameters<typeof prisma.demanda.create>[0]["data"]["statusInterno"],
      statusVisivel: statusVisivel as Parameters<typeof prisma.demanda.create>[0]["data"]["statusVisivel"],
      pesoDemanda: peso,
      solicitanteId: session.user.id,
      dataLimite: original.dataLimite,
      campanha: original.campanha,
      objetivo: original.objetivo,
      plataforma: original.plataforma,
      dataEvento: original.dataEvento,
      localEvento: original.localEvento,
      cobertura: original.cobertura,
      publico: original.publico,
      mensagemPrincipal: original.mensagemPrincipal,
      referencia: original.referencia,
      localGravacao: original.localGravacao,
      classificacao: original.classificacao,
      // videomakerId/editorId/linkFinal/linkBrutos NÃO copiados — nova demanda começa limpa
    },
  })

  // Copiar produto vinculado se existir
  if (original.produtos[0]?.produtoId) {
    await prisma.demandaProduto.create({
      data: { demandaId: nova.id, produtoId: original.produtos[0].produtoId },
    }).catch(() => null)
  }

  return NextResponse.json({ demanda: nova }, { status: 201 })
}
