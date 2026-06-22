import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calcularPeso } from "@/lib/peso-demanda"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { requireDemandaOrg } from "@/lib/org"
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
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const { organizacaoId } = guard

  // Busca demanda original com produtos e checklist
  const original = await prisma.demanda.findUnique({
    where: { id },
    include: {
      produtos: { select: { produtoId: true } },
      checklistItens: {
        select: { texto: true, ordem: true, grupo: true },
        orderBy: { ordem: "asc" },
      },
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
      organizacaoId,
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
      // Equipe
      videomakerId: original.videomakerId ?? undefined,
      editorId: original.editorId ?? undefined,
      // Dados do solicitante
      telefoneSolicitante: original.telefoneSolicitante ?? undefined,
      nomeSolicitante: original.nomeSolicitante ?? undefined,
      // Datas operacionais
      dataCaptacao: original.dataCaptacao ?? undefined,
      // Cliente final
      clienteFinalNome: original.clienteFinalNome ?? undefined,
      clienteFinalTelefone: original.clienteFinalTelefone ?? undefined,
      clienteFinalEmail: original.clienteFinalEmail ?? undefined,
      // Pastas Drive
      linkFolderBrutos: original.linkFolderBrutos ?? undefined,
      linkFolderFinal: original.linkFolderFinal ?? undefined,
      // linkFinal/linkBrutos/linkPostagem/linkCliente NÃO copiados — são outputs de produção
    },
  })

  // Copiar TODOS os produtos vinculados
  if (original.produtos.length > 0) {
    await prisma.demandaProduto.createMany({
      data: original.produtos.map(p => ({ demandaId: nova.id, produtoId: p.produtoId })),
    }).catch(() => null)
  }

  // Copiar checklist (todos os itens desmarcados — começa do zero)
  if (original.checklistItens.length > 0) {
    await prisma.checklistItem.createMany({
      data: original.checklistItens.map(item => ({
        demandaId: nova.id,
        texto: item.texto,
        ordem: item.ordem,
        grupo: item.grupo,
        concluido: false,
      })),
    }).catch(e => console.error("[Duplicate] Erro ao copiar checklist:", e))
  }

  return NextResponse.json({ demanda: nova }, { status: 201 })
}
