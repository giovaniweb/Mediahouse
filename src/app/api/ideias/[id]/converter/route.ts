import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"
import { criarComCodigoDaEmpresa } from "@/lib/codigo-demanda"
import { departamentoDoPedido } from "@/lib/departamento-do-pedido"
import { departamentoValido } from "@/lib/departamentos"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const ideia = await prisma.ideiaVideo.findUnique({
    where: { id },
    include: { produto: { select: { id: true, nome: true } } },
  })

  if (!ideia || !pertenceAOrg(ideia, organizacaoId)) return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })
  if (ideia.demandaId) return NextResponse.json({ error: "Ideia já foi convertida em demanda" }, { status: 400 })

  // Build description
  let descricao = ideia.descricao || `Ideia convertida: ${ideia.titulo}`
  if (ideia.linkReferencia) {
    descricao += `\n\nReferência: ${ideia.linkReferencia}`
  }

  // A ideia vira pedido de vídeo ao Audiovisual: o departamento é o do
  // "Nova demanda" (lib/departamento-do-pedido.ts). Antes caía em "growth", o
  // do quadro de arte, porque a tela de Ideias manda o corpo vazio. Um
  // departamento mandado de propósito vale se a empresa o aceita.
  const tipoVideo: string = body.tipoVideo || "social_media"
  const departamento = typeof body.departamento === "string" && await departamentoValido(body.departamento, organizacaoId)
    ? body.departamento
    : departamentoDoPedido(tipoVideo === "cobertura_evento" ? "cobertura" : "video")

  // Mesmo código das demandas internas (PREFIXO-AA-####, por empresa). O "próximo VID-####"
  // de antes lia a última demanda criada, de qualquer prefixo — quase sempre
  // VOP-… —, o parseInt dava NaN e o código saía "VID-0NaN". A primeira
  // conversão passava; quase todas as seguintes batiam no mesmo código.
  const demanda = await criarComCodigoDaEmpresa(organizacaoId, "", (codigo) => prisma.demanda.create({
    data: {
      organizacaoId,
      codigo,
      titulo: body.titulo || ideia.titulo,
      descricao,
      departamento,
      tipoVideo,
      cidade: body.cidade || "Remoto",
      prioridade: "normal",
      classificacao: ideia.classificacao || null,
      referencia: ideia.linkReferencia || null,
      solicitanteId: session.user.id,
      telefoneSolicitante: ideia.telefoneOrigem || null,
    },
  }))

  // Link to product if exists
  if (ideia.produtoId) {
    await prisma.demandaProduto.create({
      data: { demandaId: demanda.id, produtoId: ideia.produtoId },
    })
  }

  // Update idea
  await prisma.ideiaVideo.update({
    where: { id },
    data: {
      status: "em_producao",
      demandaId: demanda.id,
      convertidoEm: new Date(),
    },
  })

  // Create history entry
  await prisma.historicoStatus.create({
    data: {
      demandaId: demanda.id,
      statusNovo: "pedido_criado",
      usuarioId: session.user.id,
      origem: "manual",
      observacao: `Demanda criada a partir da ideia: ${ideia.titulo}`,
    },
  })

  return NextResponse.json({
    demandaId: demanda.id,
    codigo: demanda.codigo,
    ideiaId: id,
  })
}
