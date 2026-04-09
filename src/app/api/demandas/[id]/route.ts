import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const demanda = await prisma.demanda.findUnique({
    where: { id },
    include: {
      solicitante: { select: { id: true, nome: true, email: true } },
      gestor: { select: { id: true, nome: true } },
      videomaker: { select: { id: true, nome: true, cidade: true, telefone: true } },
      editor: { select: { id: true, nome: true, especialidade: true, telefone: true, whatsapp: true } },
      arquivos: { orderBy: { createdAt: "desc" } },
      historicos: {
        include: { usuario: { select: { id: true, nome: true } } },
        orderBy: { createdAt: "desc" },
      },
      comentarios: {
        include: { usuario: { select: { id: true, nome: true } } },
        orderBy: { createdAt: "desc" },
      },
      alertas: {
        where: { status: "ativo" },
        orderBy: { createdAt: "desc" },
      },
      produtos: {
        include: { produto: { select: { id: true, nome: true } } },
      },
    },
  })

  if (!demanda) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  return NextResponse.json({ demanda })
}

const STATUS_VISIVEL_TO_INTERNO: Record<string, string> = {
  entrada: "aguardando_triagem",
  producao: "planejamento",
  edicao: "fila_edicao",
  aprovacao: "revisao_pendente",
  para_postar: "aprovado",
  finalizado: "encerrado",
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  if (body.statusVisivel) {
    const novoStatusInterno = STATUS_VISIVEL_TO_INTERNO[body.statusVisivel]
    const demandaAtual = await prisma.demanda.findUnique({
      where: { id },
      select: { statusInterno: true, videomakerId: true, codigo: true, titulo: true },
    })

    const [demanda] = await prisma.$transaction([
      prisma.demanda.update({
        where: { id },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          statusVisivel: body.statusVisivel as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          statusInterno: novoStatusInterno as any,
        },
      }),
      prisma.historicoStatus.create({
        data: {
          demandaId: id,
          statusAnterior: demandaAtual?.statusInterno ?? null,
          statusNovo: novoStatusInterno,
          origem: "manual",
          usuarioId: session.user.id,
          observacao: `Movido via Kanban para coluna "${body.statusVisivel}"`,
        },
      }),
    ])

    // Quando finalizar → auto-criar custo se videomaker externo
    if (body.statusVisivel === "finalizado" && demandaAtual?.videomakerId) {
      try {
        const jaExiste = await prisma.custoVideomaker.findFirst({
          where: { demandaId: id, videomakerId: demandaAtual.videomakerId },
        })
        if (!jaExiste) {
          const demandaFull = await prisma.demanda.findUnique({
            where: { id },
            select: { codigo: true, tipoVideo: true, videomaker: { select: { valorDiaria: true } } },
          })
          const baseCost = 250 // R$250 por video
          const isCobertura = demandaFull?.tipoVideo?.toLowerCase().includes("cobertura")
          const diaria = demandaFull?.videomaker?.valorDiaria ?? 0
          const valor = isCobertura ? baseCost + diaria : baseCost

          await prisma.custoVideomaker.create({
            data: {
              videomakerId: demandaAtual.videomakerId,
              demandaId: id,
              tipo: "diaria",
              valor,
              descricao: `Video ${demandaFull?.codigo} - ${demandaFull?.tipoVideo}${isCobertura ? ` (R$250 + diaria R$${diaria})` : ""}`,
              dataReferencia: new Date(),
              statusPagamento: "pendente_nf",
            },
          })
        }
      } catch (e) {
        console.error("Erro ao auto-criar custo:", e)
      }
    }

    // Quando mover para edição (brutos enviados) → criar link de NF e notificar videomaker
    if (body.statusVisivel === "edicao" && demandaAtual?.videomakerId) {
      try {
        const nf = await prisma.notaFiscalUpload.create({
          data: {
            demandaId: id,
            videomakerId: demandaAtual.videomakerId,
          },
        })

        // Enviar link de NF via WhatsApp
        const vm = await prisma.videomaker.findUnique({
          where: { id: demandaAtual.videomakerId },
          select: { nome: true, telefone: true },
        })
        if (vm?.telefone) {
          const configWpp = await prisma.configWhatsapp.findFirst({ where: { ativo: true } })
          if (configWpp) {
            const baseUrl = process.env.NEXTAUTH_URL || "https://nuflow.space"
            const link = `${baseUrl}/nf-upload/${nf.token}`
            const phone = vm.telefone.replace(/\D/g, "")
            await fetch(`${configWpp.instanceUrl}/message/sendText/${configWpp.instanceId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: configWpp.apiKey },
              body: JSON.stringify({
                number: phone,
                text: `Ola ${vm.nome}! Os brutos da demanda *${demandaAtual.codigo} - ${demandaAtual.titulo}* foram recebidos.\n\nPor favor, envie sua nota fiscal pelo link abaixo:\n${link}`,
              }),
            })
          }
        }
      } catch (e) {
        console.error("Erro ao criar NF upload:", e)
      }
    }

    return NextResponse.json(demanda)
  }

  const demanda = await prisma.demanda.update({
    where: { id },
    data: {
      titulo: body.titulo,
      descricao: body.descricao,
      cidade: body.cidade,
      dataLimite: body.dataLimite ? new Date(body.dataLimite) : undefined,
      dataCaptacao: body.dataCaptacao ? new Date(body.dataCaptacao) : undefined,
      videomakerId: body.videomakerId,
      editorId: body.editorId,
      socialId: body.socialId,
      gestorId: body.gestorId,
      linkBrutos: body.linkBrutos,
      linkFinal: body.linkFinal,
      linkPostagem: body.linkPostagem,
      linkCliente: body.linkCliente,
      localGravacao: body.localGravacao,
      motivoImpedimento: body.motivoImpedimento,
      classificacao: body.classificacao,
    },
  })

  return NextResponse.json(demanda)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  await prisma.demanda.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
