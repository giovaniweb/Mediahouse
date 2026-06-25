import { NextRequest, NextResponse, after } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage, templates, getWhatsappConfig } from "@/lib/whatsapp"
import { criarSessaoUploadDrive } from "@/lib/google-drive"
import { resolveParaVideomaker, resolveParaEditor } from "@/lib/equipe-resolver"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"
import type { Session } from "next-auth"

type Params = { params: Promise<{ id: string }> }

// Garante que a demanda pertence à org da sessão (404 se não). Retorna a org ativa.
async function assertDemandaOrg(session: Session | null, id: string): Promise<{ organizacaoId: string } | NextResponse> {
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const dem = await prisma.demanda.findUnique({ where: { id }, select: { organizacaoId: true } })
  if (!pertenceAOrg(dem, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  return { organizacaoId }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await assertDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard

  const demanda = await prisma.demanda.findUnique({
    where: { id },
    include: {
      solicitante: { select: { id: true, nome: true, email: true } },
      gestor: { select: { id: true, nome: true } },
      videomaker: { select: { id: true, nome: true, cidade: true, telefone: true } },
      editor: { select: { id: true, nome: true, especialidade: true, telefone: true, whatsapp: true } },
      designer: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, nome: true, tipo: true } },
      linhaProjetoRef: { select: { id: true, nome: true } },
      arquivos: {
        orderBy: [{ sequencia: "asc" }, { createdAt: "asc" }],
        select: { id: true, tipoArquivo: true, url: true, nomeArquivo: true, sequencia: true, createdAt: true },
      },
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
      aprovacoesVideo: {
        where: { status: "pendente" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { token: true, urlVideo: true, status: true, createdAt: true },
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

function normalizarTextoObrigatorio(
  body: Record<string, unknown>,
  campo: "titulo" | "descricao",
  label: string,
  min: number
): NextResponse | null {
  if (!Object.prototype.hasOwnProperty.call(body, campo)) return null

  const valor = body[campo]
  if (typeof valor !== "string") {
    return NextResponse.json({ error: `${label} inválido.` }, { status: 400 })
  }

  const texto = valor.trim()
  if (texto.length < min) {
    return NextResponse.json(
      { error: `${label} deve ter pelo menos ${min} caracteres.` },
      { status: 400 }
    )
  }

  body[campo] = texto
  return null
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await assertDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const body = await req.json()

  const erroTitulo = normalizarTextoObrigatorio(body, "titulo", "Título", 3)
  if (erroTitulo) return erroTitulo
  const erroDescricao = normalizarTextoObrigatorio(body, "descricao", "Descrição", 10)
  if (erroDescricao) return erroDescricao

  // Resolver tokens de atribuição unificada (vm:/ed:/user:) → id real do slot.
  // Cria registro espelho automaticamente quando a pessoa vem de outra tabela.
  try {
    if (typeof body.videomakerId === "string" && body.videomakerId.includes(":")) {
      body.videomakerId = await resolveParaVideomaker(body.videomakerId)
    }
    if (typeof body.editorId === "string" && body.editorId.includes(":")) {
      body.editorId = await resolveParaEditor(body.editorId, guard.organizacaoId)
    }
  } catch (e) {
    console.error("[Demanda PUT] Erro ao resolver atribuição:", e)
    return NextResponse.json({ error: "Erro ao resolver a pessoa atribuída" }, { status: 400 })
  }

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
          // Marcar data de finalização automaticamente
          ...(body.statusVisivel === "finalizado" ? { finalizadaEm: new Date() } : {}),
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
            select: { codigo: true, titulo: true, videomaker: { select: { valorDiaria: true } } },
          })
          const valor = demandaFull?.videomaker?.valorDiaria ?? 0

          await prisma.custoVideomaker.create({
            data: {
              organizacaoId: guard.organizacaoId,
              videomakerId: demandaAtual.videomakerId,
              demandaId: id,
              tipo: "projeto",
              valor,
              descricao: `Serviço: ${demandaFull?.codigo} — ${demandaFull?.titulo}`,
              dataReferencia: new Date(),
              pago: false,
              statusPagamento: "pendente_nf",
            },
          })
        }
      } catch (e) {
        console.error("Erro ao auto-criar custo:", e)
      }
    }

    // Quando finalizar → atualizar ultimoConteudo nos produtos vinculados a esta demanda
    if (body.statusVisivel === "finalizado") {
      try {
        const agora = new Date()
        const produtosVinculados = await prisma.demandaProduto.findMany({
          where: { demandaId: id },
          select: { produtoId: true },
        })
        if (produtosVinculados.length > 0) {
          await prisma.produto.updateMany({
            where: { id: { in: produtosVinculados.map((p) => p.produtoId) } },
            data: { ultimoConteudo: agora },
          })
        }
      } catch (e) {
        console.error("Erro ao atualizar ultimoConteudo dos produtos:", e)
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
          const configWpp = await getWhatsappConfig(guard.organizacaoId)
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

    // Quando mover para "Para Postar" → aprovar automaticamente todas as AprovacaoVideo pendentes
    // e transferir cada vídeo do Supabase → Drive em background
    if (body.statusVisivel === "para_postar") {
      try {
        const aprovacoesPendentes = await prisma.aprovacaoVideo.findMany({
          where: { demandaId: id, status: "pendente" },
          select: { id: true, urlVideo: true, demandaId: true },
        })

        if (aprovacoesPendentes.length > 0) {
          // Marcar todas como aprovadas
          await prisma.aprovacaoVideo.updateMany({
            where: { demandaId: id, status: "pendente" },
            data: { status: "aprovado", aprovadoPor: "Sistema (Para Postar)" },
          })

          // Criar alerta para a equipe
          await prisma.alertaIA.create({
            data: {
              organizacaoId: guard.organizacaoId,
              demandaId: id,
              tipoAlerta: "video_aprovado",
              mensagem: `✅ ${aprovacoesPendentes.length} vídeo(s) aprovado(s) automaticamente ao mover para Para Postar!`,
              severidade: "info",
            },
          }).catch(() => null)

          // Para cada aprovação com vídeo no Supabase → transferir para o Drive em background
          const demandaSnap = demandaAtual
          const aprovacoesCopy = aprovacoesPendentes
          const orgIdDrive = guard.organizacaoId
          after(async () => {
            for (const aprovacao of aprovacoesCopy) {
              try {
                const urlVideo = aprovacao.urlVideo
                if (!urlVideo || !urlVideo.includes("supabase")) continue

                // Busca dados da demanda para construir o nome do arquivo
                const dem = await prisma.demanda.findUnique({
                  where: { id: aprovacao.demandaId },
                  include: { produtos: { select: { produto: { select: { nome: true } } } } },
                })
                if (!dem) continue

                // Busca o Arquivo correspondente para obter sequencia
                const arq = await prisma.arquivo.findFirst({
                  where: { demandaId: dem.id, url: urlVideo, tipoArquivo: "final" },
                })
                const seq = arq?.sequencia ?? 1
                const seqStr = String(seq).padStart(3, "0")

                // Constrói nome: [produto]_[titulo]_[codigo]_001.ext
                const sanitize = (s: string) => s.replace(/[/\\:*?"<>|]/g, "").trim().replace(/\s+/g, "_")
                const parts: string[] = []
                const prod = dem.produtos?.[0]?.produto?.nome
                if (prod) parts.push(sanitize(prod).substring(0, 30))
                parts.push(sanitize(dem.titulo).substring(0, 40))
                parts.push(dem.codigo)
                const ext = urlVideo.split(".").pop()?.split("?")[0] ?? "mp4"
                const fileName = `${parts.join("_")}_${seqStr}.${ext}`

                // Stream: Supabase → Drive (server-to-server)
                const supaRes = await fetch(urlVideo)
                if (!supaRes.ok || !supaRes.body) {
                  console.error(`[ParaPostar] Falha ao buscar vídeo ${seqStr} do Supabase:`, supaRes.status)
                  continue
                }
                const fileSize = parseInt(supaRes.headers.get("Content-Length") ?? "0")
                if (fileSize <= 0) {
                  console.error(`[ParaPostar] Content-Length ausente para vídeo ${seqStr}`)
                  continue
                }
                const contentType = supaRes.headers.get("Content-Type") ?? "video/mp4"

                const { sessionUri, publicUrl } = await criarSessaoUploadDrive({ fileName, fileSize, contentType }, orgIdDrive)

                const driveRes = await fetch(sessionUri, {
                  method: "PUT",
                  headers: {
                    "Content-Type": contentType,
                    "Content-Length": String(fileSize),
                    "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`,
                  },
                  body: supaRes.body,
                  // @ts-ignore — duplex necessário no Node.js fetch para body streaming
                  duplex: "half",
                })

                if (driveRes.status === 200 || driveRes.status === 201) {
                  // Atualiza o Arquivo com a URL permanente do Drive
                  if (arq) {
                    await prisma.arquivo.update({
                      where: { id: arq.id },
                      data: { url: publicUrl },
                    })
                  }
                  // Atualiza linkFinal com o Drive URL mais recente
                  await prisma.demanda.update({
                    where: { id: dem.id },
                    data: { linkFinal: publicUrl },
                  })
                  console.info(`[ParaPostar] Drive upload concluído (${seqStr}): ${publicUrl}`)
                } else {
                  const errText = await driveRes.text().catch(() => "")
                  console.error(`[ParaPostar] Drive retornou HTTP ${driveRes.status} para ${seqStr}:`, errText.slice(0, 300))
                }
              } catch (e) {
                console.error(`[ParaPostar] Erro ao transferir vídeo para Drive:`, e)
              }
            }
          })
        }
      } catch (e) {
        console.error("Erro ao auto-aprovar aprovações ao mover para Para Postar:", e)
      }
    }

    return NextResponse.json(demanda)
  }

  // Detectar mudança de videomakerId / editorId para notificação WhatsApp
  let videomakeridAnterior: string | null | undefined
  let autoStatusVideomakerNotificado = false
  // Buscar estado anterior quando qualquer dos dois campos pode mudar
  let demandaAntes: {
    videomakerId: string | null; editorId: string | null; codigo: string; titulo: string;
    descricao: string | null; dataCaptacao: Date | null; tipoVideo: string | null;
    localGravacao: string | null; cidade: string | null; statusInterno: string;
    telefoneSolicitante: string | null;
    solicitante: { telefone: string | null } | null;
  } | null = null

  if (body.videomakerId !== undefined || body.editorId !== undefined) {
    demandaAntes = await prisma.demanda.findUnique({
      where: { id },
      select: {
        videomakerId: true, editorId: true, codigo: true, titulo: true, descricao: true,
        dataCaptacao: true, tipoVideo: true, localGravacao: true, cidade: true,
        statusInterno: true, telefoneSolicitante: true,
        solicitante: { select: { telefone: true } },
      },
    })
  }

  if (body.videomakerId !== undefined) {
    videomakeridAnterior = demandaAntes?.videomakerId

    // Se mudou o videomaker, notificar o NOVO videomaker via WhatsApp
    if (body.videomakerId && body.videomakerId !== videomakeridAnterior) {
      const novoVm = await prisma.videomaker.findUnique({
        where: { id: body.videomakerId },
        select: { nome: true, telefone: true },
      })
      if (novoVm?.telefone && demandaAntes) {
        const dataFmt = body.dataCaptacao || demandaAntes.dataCaptacao
          ? new Date(body.dataCaptacao ?? demandaAntes!.dataCaptacao!).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "A confirmar"

        const isCobertura = demandaAntes.tipoVideo?.toLowerCase().includes("cobertura")

        // Criar ConviteVideomaker com token (validade 72h) para confirmação via link
        let conviteLink: string | undefined
        try {
          const convite = await prisma.conviteVideomaker.create({
            data: {
              demandaId: id,
              videomakerId: body.videomakerId,
              expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
            },
          })
          const baseUrl = process.env.NEXTAUTH_URL ?? "https://nuflow.space"
          conviteLink = `${baseUrl}/convite/${convite.token}`
        } catch (e) {
          console.error("[Convite] Erro ao criar convite:", e)
        }

        if (isCobertura) {
          // Template rico para cobertura — inclui local, cidade, descrição, pagamento e link
          const local = body.localGravacao || demandaAntes.localGravacao || "A confirmar"
          const cidade = body.cidade || demandaAntes.cidade || ""
          const descricao = body.descricao || demandaAntes.descricao || null
          void sendWhatsappMessage(
            novoVm.telefone,
            templates.coberturaConfirmacao(novoVm.nome, demandaAntes.codigo, demandaAntes.titulo, dataFmt, local, cidade, descricao, conviteLink),
            id
          ).catch(() => null)
        } else {
          // Demandas normais: template padrão com link
          void sendWhatsappMessage(
            novoVm.telefone,
            templates.videomakertNotificado(demandaAntes.codigo, demandaAntes.titulo, dataFmt, conviteLink),
            id
          ).catch(() => null)
        }
        // Sempre mudar status para "videomaker_notificado" quando VM é atribuído e notificado
        // (seja cobertura ou demanda normal) — permite que o SIM/NÃO via WhatsApp ainda funcione como fallback
        autoStatusVideomakerNotificado = true

        // Notificar solicitante que um profissional foi selecionado
        const telSolicitante = demandaAntes.telefoneSolicitante || demandaAntes.solicitante?.telefone
        if (telSolicitante) {
          // Formata o telefone do VM para exibir ao solicitante (ex: (31) 99999-9999)
          const telVmFmt = novoVm.telefone
            ? novoVm.telefone.replace(/^55(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3")
            : undefined
          void sendWhatsappMessage(
            telSolicitante,
            templates.profissionalSelecionadoSolicitante(novoVm.nome, demandaAntes.codigo, demandaAntes.titulo, telVmFmt),
            id
          ).catch(() => null)
        }
      }
    }
  }

  // Detectar mudança de editorId para notificação WhatsApp
  if (body.editorId !== undefined && demandaAntes) {
    const editorAnterior = demandaAntes.editorId
    if (body.editorId && body.editorId !== editorAnterior) {
      const novoEditor = await prisma.editor.findUnique({
        where: { id: body.editorId },
        select: { nome: true, telefone: true, whatsapp: true },
      })
      if (novoEditor && demandaAntes) {
        const telEditor = novoEditor.whatsapp || novoEditor.telefone
        // Notificar editor
        if (telEditor) {
          void sendWhatsappMessage(
            telEditor,
            templates.editorSelecionado(demandaAntes.codigo, demandaAntes.titulo),
            id
          ).catch(() => null)
        }
        // Notificar solicitante que editor foi atribuído
        const telSolicitante = demandaAntes.telefoneSolicitante || demandaAntes.solicitante?.telefone
        if (telSolicitante) {
          const telEditorFmt = telEditor
            ? telEditor.replace(/^55(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3")
            : undefined
          void sendWhatsappMessage(
            telSolicitante,
            templates.profissionalSelecionadoSolicitante(novoEditor.nome, demandaAntes.codigo, demandaAntes.titulo, telEditorFmt),
            id
          ).catch(() => null)
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
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
    linkFolderBrutos: body.linkFolderBrutos,
    linkFolderFinal: body.linkFolderFinal,
  }

  // Cobertura com novo videomaker → mudar status para aguardando confirmação
  if (autoStatusVideomakerNotificado) {
    updateData.statusInterno = "videomaker_notificado"
  }

  const demanda = await prisma.demanda.update({ where: { id }, data: updateData })

  // Registrar histórico se mudou para videomaker_notificado
  if (autoStatusVideomakerNotificado) {
    await prisma.historicoStatus.create({
      data: {
        demandaId: id,
        statusNovo: "videomaker_notificado",
        usuarioId: session.user.id,
        origem: "manual",
        observacao: "Videomaker notificado via WhatsApp — aguardando confirmação de cobertura",
      },
    }).catch(() => null)
  }

  return NextResponse.json(demanda)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await assertDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard

  await prisma.demanda.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
