import { emitirConvite, ConviteInvalido } from "@/lib/convites"
import { requireAcesso } from "@/lib/acesso"
import { marcadorConclusao } from "@/lib/job-transicoes"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { registrarServicoPendente } from "@/lib/custo-servico"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { sendWhatsappMessage, templates, getWhatsappConfig } from "@/lib/whatsapp"
import { resolveParaVideomaker, resolveParaEditor } from "@/lib/equipe-resolver"
import { getOrgId, semOrg, pertenceAOrg } from "@/lib/org"
import { requireDemandaAcesso, espelhoDoCard, SELECT_ESPELHO } from "@/lib/compartilhamento"
import { lerResponsaveisDoBody, validarResponsaveis, setResponsaveis } from "@/lib/responsaveis"
import { emSegundoPlano } from "@/lib/notificar"
import { validarPrazo, mesmoDia, formatarDataCurta } from "@/lib/datas"
import { erroDeCampo } from "@/lib/erros-api"
import { registrarEdicao, registrarTrocaResponsavel, registrarTrocaExecutor } from "@/lib/historico"
import type { Session } from "next-auth"

type Params = { params: Promise<{ id: string }> }

// Garante que a demanda pertence à org da sessão (404 se não). Retorna a org ativa
// e o prazo já gravado — usado para não barrar a edição de uma demanda antiga cujo
// prazo continua o mesmo (a regra "prazo >= hoje" vale para o que muda agora).
async function assertDemandaOrg(
  session: Session | null,
  id: string
): Promise<{ organizacaoId: string; dataLimiteAtual: Date | null } | NextResponse> {
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const dem = await prisma.demanda.findUnique({
    where: { id },
    select: { organizacaoId: true, dataLimite: true },
  })
  if (!pertenceAOrg(dem, organizacaoId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  return { organizacaoId, dataLimiteAtual: dem?.dataLimite ?? null }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  // LER aceita espelho; PUT e DELETE, logo abaixo, continuam em
  // `assertDemandaOrg` — editar briefing e excluir o card são da dona.
  const acesso = await requireDemandaAcesso(session, id, "acompanhar")
  if (acesso instanceof NextResponse) return acesso

  const demanda = await prisma.demanda.findUnique({
    where: { id },
    include: {
      solicitante: { select: { id: true, nome: true, email: true } },
      gestor: { select: { id: true, nome: true } },
      videomaker: { select: { id: true, nome: true, cidade: true, telefone: true } },
      editor: { select: { id: true, nome: true, especialidade: true, telefone: true, whatsapp: true } },
      designer: { select: { id: true, nome: true, email: true, usuarioId: true } },
      responsavel: { select: { id: true, nome: true, email: true, tipo: true } },
      responsaveis: { select: { usuario: { select: { id: true, nome: true, tipo: true } } } },
      linhaProjetoRef: { select: { id: true, nome: true } },
      arquivos: {
        orderBy: [{ sequencia: "asc" }, { createdAt: "asc" }],
        select: { id: true, tipoArquivo: true, url: true, originalUrl: true, nomeArquivo: true, sequencia: true, createdAt: true },
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
        // expiresAt vai junto: o link pode estar de pé na tela e morto para o
        // cliente. Em 17/08/2026, 44 das 49 aprovações pendentes estavam
        // expiradas — e a tela mostrava o link em verde, com check.
        select: { token: true, urlVideo: true, status: true, createdAt: true, expiresAt: true },
      },
      // Só os rótulos congelados. As relações `origem`/`destino` da aresta
      // atravessam a fronteira entre empresas, e este payload vai para os DOIS
      // lados — é exatamente o caminho que `nomeOrigem`/`nomeDestino` existem
      // para não precisar percorrer.
      compartilhamentos: { where: { revogadoEm: null }, select: SELECT_ESPELHO },
    },
  })

  if (!demanda) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  return NextResponse.json({
    demanda,
    // O que a tela precisa para desenhar a faixa e esconder os blocos que a
    // outra empresa não opera. `papel` vem do acesso, não do payload, porque é
    // ele que a rota já usou para autorizar.
    espelho: espelhoDoCard(demanda.compartilhamentos, acesso.organizacaoId),
    papelNoCard: acesso.papel,
  })
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
    return erroDeCampo(campo, `${label} inválido.`)
  }

  const texto = valor.trim()
  if (texto.length < min) {
    return erroDeCampo(campo, `${label} deve ter pelo menos ${min} caracteres.`)
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
  if (body.videomakerId !== undefined) {
    const acesso = await requireAcesso("editarDemanda")
    if (acesso instanceof NextResponse) return acesso
    if (!["admin", "gestor"].includes(acesso.papel)) return NextResponse.json({error:"Apenas a gestão pode atribuir profissionais"},{status:403})
  }

  // A edição inline é a porta por onde as datas absurdas entraram (há prazos
  // gravados no ano 0026 e no ano 0001). O prazo só é checado quando MUDA: senão
  // salvar o título de uma demanda antiga esbarraria no prazo vencido dela.
  if (body.dataLimite !== undefined && !mesmoDia(body.dataLimite, guard.dataLimiteAtual)) {
    const prazo = validarPrazo(body.dataLimite)
    if (!prazo.ok) return erroDeCampo("dataLimite", prazo.motivo)
  }

  const erroTitulo = normalizarTextoObrigatorio(body, "titulo", "Título", 3)
  if (erroTitulo) return erroTitulo
  const erroDescricao = normalizarTextoObrigatorio(body, "descricao", "Descrição", 10)
  if (erroDescricao) return erroDescricao

  // Resolver tokens de atribuição unificada (vm:/ed:/user:) → id real do slot.
  // Cria registro espelho automaticamente quando a pessoa vem de outra tabela.
  try {
    if (typeof body.videomakerId === "string" && body.videomakerId.includes(":")) {
      body.videomakerId = await resolveParaVideomaker(body.videomakerId, guard.organizacaoId)
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
      select: { statusInterno: true, statusVisivel: true, finalizadaEm: true, updatedAt: true, videomakerId: true, codigo: true, titulo: true },
    })

    if (!demandaAtual || !novoStatusInterno) return NextResponse.json({ error: "Demanda ou status inválido" }, { status: 400 })
    const [demanda] = await prisma.$transaction([
      prisma.demanda.update({
        where: { id, updatedAt: demandaAtual.updatedAt },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          statusVisivel: body.statusVisivel as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          statusInterno: novoStatusInterno as any,
          // Marcar data de finalização automaticamente
          ...marcadorConclusao(demandaAtual, body.statusVisivel),
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
        await registrarServicoPendente(prisma, guard.organizacaoId, id, demandaAtual.videomakerId)
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

    // Quando mover para "Para Postar" → aprovar automaticamente todas as AprovacaoVideo pendentes.
    // O vídeo fica no armazenamento do NuFlow; o download sai da galeria e da Biblioteca.
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
    autoStatusVideomakerNotificado = Boolean(body.videomakerId && body.videomakerId !== videomakeridAnterior)
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
          emSegundoPlano(() => sendWhatsappMessage(
            telEditor,
            templates.editorSelecionado(demandaAntes.codigo, demandaAntes.titulo),
            id
          ), "wa-editor-atribuido")
        }
        // Notificar solicitante que editor foi atribuído
        const telSolicitante = demandaAntes.telefoneSolicitante || demandaAntes.solicitante?.telefone
        if (telSolicitante) {
          const telEditorFmt = telEditor
            ? telEditor.replace(/^55(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3")
            : undefined
          emSegundoPlano(() => sendWhatsappMessage(
            telSolicitante,
            templates.profissionalSelecionadoSolicitante(novoEditor.nome, demandaAntes.codigo, demandaAntes.titulo, telEditorFmt),
            id
          ), "wa-solicitante-profissional")
        }
      }
    }
  }

  // Responsáveis: aceita `responsavelId` (singular, edição inline) ou
  // `responsavelIds[]` (multi, Growth). A gravação acontece depois do update,
  // via setResponsaveis — que mantém a M2M e a coluna derivada em sincronia.
  let responsaveisPut = lerResponsaveisDoBody(body)
  if (responsaveisPut !== undefined) {
    const validados = await validarResponsaveis(responsaveisPut, guard.organizacaoId)
    if (validados instanceof NextResponse) return validados
    responsaveisPut = validados
  }
  if (body.editorId) {
    const editor = await prisma.editor.findFirst({
      where: { id: body.editorId, vinculos: { some: { organizacaoId: guard.organizacaoId } } },
      select: { id: true },
    })
    if (!editor) return NextResponse.json({ error: "Editor inválido para esta organização" }, { status: 400 })
  }
  if (body.videomakerId) {
    const videomaker = await prisma.videomaker.findUnique({
      where: { id: body.videomakerId },
      select: { id: true },
    })
    if (!videomaker) return NextResponse.json({ error: "Videomaker inválido" }, { status: 400 })
  }
  if (body.linhaProjetoId) {
    const linha = await prisma.linhaProjeto.findFirst({
      where: { id: body.linhaProjetoId, organizacaoId: guard.organizacaoId },
      select: { id: true },
    })
    if (!linha) return NextResponse.json({ error: "Linha/projeto inválida para esta organização" }, { status: 404 })
  }

  const updateData: Record<string, any> = {
    titulo: body.titulo,
    descricao: body.descricao,
    cidade: body.cidade,
    prioridade: body.prioridade,
    dataLimite: body.dataLimite !== undefined
      ? (body.dataLimite ? new Date(body.dataLimite) : null)
      : undefined,
    // responsavelId NÃO entra aqui: quem grava é setResponsaveis (abaixo),
    // junto com a M2M, para as duas fontes nunca divergirem.
    ...(body.linhaProjetoId !== undefined ? { linhaProjetoId: body.linhaProjetoId || null } : {}),
    dataCaptacao: body.dataCaptacao !== undefined
      ? (body.dataCaptacao ? new Date(body.dataCaptacao) : null)
      : undefined,
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
    formato: body.formato,
    linkFolderBrutos: body.linkFolderBrutos,
    linkFolderFinal: body.linkFolderFinal,
  }

  // Cobertura com novo videomaker → mudar status para aguardando confirmação
  if (autoStatusVideomakerNotificado) {
    updateData.statusInterno = "videomaker_notificado"
    updateData.statusVisivel = STATUS_PARA_COLUNA.videomaker_notificado
  }

  // Estado anterior, lido antes de gravar: é o que permite dizer O QUE mudou, e
  // não só que "alguém mexeu". Editar e trocar responsável não deixavam rastro
  // nenhum — só mudança de status entrava no histórico.
  const antesDaEdicao = await prisma.demanda.findUnique({
    where: { id },
    include: { responsaveis: { select: { usuario: { select: { id: true, nome: true } } } } },
  })

  let demanda
  try {
    demanda = await prisma.$transaction(async tx => {
      // Atribuição, invalidação dos links antigos e novo aviso durável são um commit.
      if (body.videomakerId !== undefined) {
        await tx.$queryRaw`SELECT id FROM demandas WHERE id=${id} AND "organizacaoId"=${guard.organizacaoId} FOR UPDATE`
        const atual = await tx.demanda.findUniqueOrThrow({where:{id,organizacaoId:guard.organizacaoId}})
        if(atual.updatedAt.getTime()!==antesDaEdicao?.updatedAt.getTime()) throw new ConviteInvalido("O job mudou. Atualize a página antes de atribuir.")
        if(atual.videomakerId!==body.videomakerId) await tx.conviteVideomaker.updateMany({where:{demandaId:id,status:"pendente"},data:{status:"substituido"}})
      }
      const d = await tx.demanda.update({ where: { id }, data: updateData })
      if(autoStatusVideomakerNotificado) await emitirConvite(tx,{organizacaoId:guard.organizacaoId,usuarioId:session.user.id},id,body.videomakerId)
      return d
    })
  } catch(e) {
    if(e instanceof ConviteInvalido) return NextResponse.json({error:e.message},{status:e.status})
    throw e
  }

  // Responsáveis: vale tanto para `responsavelId` (singular) quanto para
  // `responsavelIds[]` — antes só o array reconstruía a M2M, e a edição inline
  // deixava o filtro por responsável apontando para o responsável antigo.
  if (responsaveisPut !== undefined) {
    await setResponsaveis(id, responsaveisPut)
  }

  // Rastro da edição. Vai em segundo plano: é registro, não pode atrasar nem
  // derrubar a resposta de quem acabou de salvar.
  emSegundoPlano(async () => {
    const statusAtual = demanda.statusInterno
    await registrarEdicao(id, session.user.id, antesDaEdicao, updateData, statusAtual)

    if (responsaveisPut !== undefined) {
      // Avisa QUEM ENTROU — só os novos, e nunca quem se atribuiu sozinho.
      // Videomaker e editor sempre receberam WhatsApp ao serem escalados; o
      // responsável do Growth não recebia nada e só descobria o trabalho
      // abrindo o sistema.
      const jaEram = new Set((antesDaEdicao?.responsaveis ?? []).map((r) => r.usuario?.id).filter(Boolean))
      const novos = (responsaveisPut ?? []).filter((uid) => !jaEram.has(uid) && uid !== session.user.id)
      if (novos.length > 0) {
        const pessoas = await prisma.usuario.findMany({
          where: { id: { in: novos }, status: "ativo", telefone: { not: null } },
          select: { telefone: true },
        })
        const prazo = demanda.dataLimite ? formatarDataCurta(demanda.dataLimite) : null
        const msg = templates.responsavelAtribuido(demanda.codigo, demanda.titulo, prazo)
        await Promise.allSettled(
          pessoas.map((p) => sendWhatsappMessage(p.telefone!, msg, id, guard.organizacaoId))
        )
      }

      const depois = await prisma.demandaResponsavel.findMany({
        where: { demandaId: id },
        select: { usuario: { select: { nome: true } } },
      })
      await registrarTrocaResponsavel(
        id,
        session.user.id,
        (antesDaEdicao?.responsaveis ?? []).map((r) => r.usuario?.nome).filter(Boolean) as string[],
        depois.map((r) => r.usuario?.nome).filter(Boolean) as string[],
        statusAtual
      )
    }

    // Quem passou a executar. Era o buraco do histórico: atribuir videomaker ou
    // editor não deixava rastro nenhum — e "quem pegou a demanda pra executar" é
    // exatamente o que a equipe pediu para conseguir ver.
    if (body.videomakerId !== undefined && demandaAntes) {
      await registrarTrocaExecutor(
        id, session.user.id, "videomaker",
        demandaAntes.videomakerId, (body.videomakerId as string | null) || null,
        statusAtual, guard.organizacaoId
      )
    }
    if (body.editorId !== undefined && demandaAntes) {
      await registrarTrocaExecutor(
        id, session.user.id, "editor",
        demandaAntes.editorId, (body.editorId as string | null) || null,
        statusAtual, guard.organizacaoId
      )
    }
  }, "historico-edicao")

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
