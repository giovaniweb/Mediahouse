import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { quemRecebeTudo } from "@/lib/notificados"
import { z } from "zod"
import { calcularPeso } from "@/lib/peso-demanda"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { sendWhatsappMessage, templates } from "@/lib/whatsapp"
import { notificarLideresAudiovisual } from "@/lib/lideres-audiovisual"
import { setResponsaveis } from "@/lib/responsaveis"
import { emSegundoPlano } from "@/lib/notificar"
import type { Prioridade } from "@prisma/client"
import { departamentoValido } from "@/lib/departamentos"
import { formatarDataCurta, validarPrazo } from "@/lib/datas"
import { erroDeZod, erroDeCampo } from "@/lib/erros-api"
import { resolveParaEditor, resolveParaVideomaker } from "@/lib/equipe-resolver"
import { criarComCodigoUnico } from "@/lib/codigo-demanda"
import { ideiaParaPedido, ligarIdeiaAoPedido } from "@/lib/social"
import { entradaDoPedidoInterno } from "@/lib/quem-aprova"
import { avisarGravacao } from "@/lib/avisos-gravacao"
import { novoTokenPublico } from "@/lib/acompanhamento-gravacao"
import { ehSolicitacaoDeCobertura } from "@/lib/job-fase"

// Mensagens explícitas em português: sem elas o zod devolve o texto padrão em
// inglês ("String must contain at least 3 character(s)"), que chegava a aparecer
// na tela do usuário.
const criarDemandaSchema = z.object({
  titulo: z.string().trim().min(3, "O título precisa ter pelo menos 3 caracteres."),
  descricao: z.string().trim().min(10, "A descrição precisa ter pelo menos 10 caracteres."),
  // Não é mais uma lista fixa: o conjunto válido vem de ConfigParametro por
  // empresa e é conferido depois do parse, com departamentoValido().
  departamento: z.string().trim().min(1),
  tipoVideo: z.string().trim().min(1),
  cidade: z.string().trim().min(2),
  prioridade: z.enum(["normal", "alta", "urgente"]).default("normal"),
  motivoUrgencia: z.string().optional(),
  dataLimite: z
    .string()
    .optional()
    .superRefine((valor, ctx) => {
      const r = validarPrazo(valor)
      if (!r.ok) ctx.addIssue({ code: "custom", message: r.motivo })
    }),
  // Campos condicionais
  campanha: z.string().optional(),
  objetivo: z.string().optional(),
  plataforma: z.string().optional(),
  dataEvento: z.string().optional(),
  // A gravação marcada no "+ Novo Job" (o mesmo momento de dataEvento).
  dataCaptacao: z.string().optional(),
  localEvento: z.string().optional(),
  // Gravação externa: quem edita, combinado ao pedir ou ao agendar.
  edicaoPor: z.enum(["videomaker", "equipe", "sem_edicao"]).optional(),
  // Gravação externa: tipo, brinde (tem? qual?) e o que mais levar.
  tipoGravacao: z.enum(["entrega_equipamento", "demonstracao", "conteudo", "evento"]).optional(),
  temBrinde: z.boolean().optional(),
  brinde: z.string().trim().max(120).nullable().optional(),
  levar: z.string().trim().max(300).nullable().optional(),
  cobertura: z.boolean().optional(),
  publico: z.string().optional(),
  mensagemPrincipal: z.string().optional(),
  // Extras
  referencia: z.string().optional(),
  localGravacao: z.string().optional(),
  linkBrutos: z.string().optional(),
  // Proporção da entrega ("9:16" | "16:9" | "1:1")
  formato: z.enum(["9:16", "16:9", "1:1"]).optional(),
  // Área (audiovisual padrão | design)
  area: z.enum(["audiovisual", "design"]).optional(),
  // Evento mestre vinculado (card criado a partir de um evento)
  eventoGestaoId: z.string().optional(),
  // Videomaker + Editor + Designer (opcionais na criação)
  videomakerId: z.string().optional(),
  editorId: z.string().optional(),
  designerId: z.string().optional(),
  // Growth: responsável(eis) interno(s) da org + segmentação genérica
  responsavelId: z.string().optional(),            // legado (1 responsável)
  responsavelIds: z.array(z.string()).optional(),  // múltiplos responsáveis (Growth)
  linhaProjeto: z.string().optional(),     // texto legado (compat)
  linhaProjetoId: z.string().optional(),   // referência principal (LinhaProjeto da org)
  // Cliente final (cobertura/entrega)
  clienteFinalNome: z.string().optional(),
  clienteFinalTelefone: z.string().optional(),
  clienteFinalEmail: z.string().optional(),
  // Produto(s) vinculado(s) — multi-seleção (produtoId legado mantido p/ compat)
  produtoId: z.string().optional(),
  produtoIds: z.array(z.string()).optional(),
  // Telefone solicitante
  telefoneSolicitante: z.string().optional(),
  // Classificação B2C/B2B
  classificacao: z.enum(["b2c", "b2b"]).optional(),
  // Campos condicionais por tipo de entrega (Growth)
  detalhesEntrega: z.record(z.string(), z.unknown()).optional(),
  // Pedido feito pelo quadro da social (/social): a ideia que vira esta demanda.
  ideiaId: z.string().optional(),
  // Aceito e ignorado: desde 28/10/2026 quem decide se o pedido nasce aprovado
  // é quem cria (lib/quem-aprova.ts), não a tela que mandou.
  aprovarAoCriar: z.boolean().optional(),
})

/**
 * Cria a demanda como `session` a criaria pela tela: o mesmo schema, a mesma
 * regra de aprovação (lib/quem-aprova.ts), os mesmos avisos. Quem chama já
 * conferiu a sessão e a empresa. `origem.mcpTokenId` marca a demanda criada
 * pelo assistente (MCP) da pessoa — é o que permite desfazê-la depois.
 */
export async function criarDemanda(session: Session, organizacaoId: string, body: unknown, origem?: { mcpTokenId: string }) {
  const parsed = criarDemandaSchema.safeParse(body)

  if (!parsed.success) {
    return erroDeZod(parsed.error)
  }

  const data = parsed.data

  // Token unificado da equipe (ed:/vm:/user:) → id real do editor, mesmo caminho
  // que o PUT já usava. Cria o registro espelho quando a pessoa vem de outra tabela.
  let editorIdResolvido: string | undefined = data.editorId || undefined
  if (editorIdResolvido?.includes(":")) {
    try {
      editorIdResolvido = await resolveParaEditor(editorIdResolvido, organizacaoId)
    } catch (e) {
      return erroDeCampo("editorId", e instanceof Error ? e.message : "Não foi possível identificar o editor.")
    }
  }

  // Mesmo tratamento para o slot de captação: /api/equipe-disponivel devolve
  // token unificado nos dois papéis, e aqui o videomakerId entrava cru — quem
  // escolhesse alguém vindo de Editor/Usuario gravaria um id que não existe em
  // Videomaker. O formulário de criação nunca tinha oferecido o campo, então o
  // caminho nunca chegou a ser exercitado.
  let videomakerIdResolvido: string | undefined = data.videomakerId || undefined
  if (videomakerIdResolvido?.includes(":")) {
    try {
      videomakerIdResolvido = await resolveParaVideomaker(videomakerIdResolvido, organizacaoId)
    } catch (e) {
      return erroDeCampo("videomakerId", e instanceof Error ? e.message : "Não foi possível identificar o videomaker.")
    }
  }

  // Validar urgência
  if (data.prioridade === "urgente" && !data.motivoUrgencia) {
    return NextResponse.json(
      { error: "Motivo de urgência é obrigatório." },
      { status: 400 }
    )
  }

  // Pedido de quem está logado e é da casa nasce aprovado; Aprovações fica com o
  // que chega de fora. Urgência de quem não decide a fila ainda passa por lá
  // (regra em lib/quem-aprova.ts).
  const urgente = data.prioridade === "urgente"
  const entrada = await entradaDoPedidoInterno({ usuarioId: session.user.id, gestor: ehGestor(session) }, organizacaoId, urgente)
  const jaAprovada = entrada.aprovado
  const statusInterno = entrada.statusInterno

  const statusVisivel = STATUS_PARA_COLUNA[statusInterno]
  const peso = calcularPeso(data.tipoVideo, data.prioridade as Prioridade)

  // Growth: resolve o responsável (Usuario interno da org). Valida que pertence à
  // organização logada (isolamento) e, se for designer com espelho Designer, também
  // preenche designerId para manter a visão/portal do designer funcionando.
  // Aceita responsavelIds[] (novo, múltiplos) e responsavelId (legado, 1). O primeiro
  // válido vira o responsável "primário" (compat com card/modal/relatórios).
  const idsResp = Array.from(new Set([
    ...(data.responsavelIds ?? []),
    ...(data.responsavelId ? [data.responsavelId] : []),
  ]))
  let responsavelId: string | undefined
  let designerIdResolvido = data.designerId
  let responsaveisValidos: string[] = []
  if (idsResp.length > 0) {
    const membros = await prisma.usuario.findMany({
      where: { id: { in: idsResp }, organizacoes: { some: { organizacaoId } } },
      select: { id: true, tipo: true },
    })
    if (membros.length === 0) {
      return NextResponse.json({ error: "Responsável inválido para esta organização" }, { status: 400 })
    }
    // Mantém a ordem enviada e descarta IDs de outra org
    responsaveisValidos = idsResp.filter((id) => membros.some((m) => m.id === id))
    responsavelId = responsaveisValidos[0]
    const primeiro = membros.find((m) => m.id === responsavelId)
    if (primeiro?.tipo === "designer" && !designerIdResolvido) {
      const designer = await prisma.designer.findFirst({
        where: { usuarioId: primeiro.id, vinculos: { some: { organizacaoId } } },
        select: { id: true },
      })
      if (designer) designerIdResolvido = designer.id
    }
  }

  // Growth: resolve a linha/projeto. Valida que pertence à org logada (404 se de outra
  // org). Mantém também o texto `linhaProjeto` (nome) para compatibilidade.
  let linhaProjetoId: string | undefined
  let linhaProjetoTexto = data.linhaProjeto?.trim() || undefined
  if (data.linhaProjetoId) {
    const linha = await prisma.linhaProjeto.findFirst({
      where: { id: data.linhaProjetoId, organizacaoId },
      select: { id: true, nome: true },
    })
    if (!linha) {
      return NextResponse.json({ error: "Linha/projeto inválida para esta organização" }, { status: 404 })
    }
    linhaProjetoId = linha.id
    linhaProjetoTexto = linha.nome
  }

  // Pedido do quadro da social: a ideia precisa ser dela (ou o pedido vir de
  // gestor/admin) e ainda não ter virado pedido. A linha da demanda passa a ser a da ideia, e `socialId` marca o
  // pedido como dela — é o selo "Social" no card da equipe.
  let socialId: string | undefined
  if (data.ideiaId) {
    const r = await ideiaParaPedido(data.ideiaId, organizacaoId, session.user.id, ehGestor(session))
    if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    linhaProjetoId = r.linha.id
    linhaProjetoTexto = r.linha.nome
    socialId = r.socialId
  }

  if (!(await departamentoValido(data.departamento, organizacaoId))) {
    return NextResponse.json(
      { error: "Departamento inválido — cadastre-o em Configurações → Parâmetros" },
      { status: 400 }
    )
  }

  // Gravação nasce com o link de acompanhamento de quem pediu (/d/<token>, o do
  // Compartilhar do card): lib/acompanhamento-gravacao.ts.
  const ehGravacao = ehSolicitacaoDeCobertura({ tipoVideo: data.tipoVideo, departamento: data.departamento }) || !!data.tipoGravacao

  const demanda = await criarComCodigoUnico("VOP", (codigo) => prisma.demanda.create({
    data: {
      organizacaoId,
      codigo,
      ...(ehGravacao && { publicToken: novoTokenPublico(), publicTokenAtivo: true }),
      titulo: data.titulo,
      descricao: data.descricao,
      departamento: data.departamento,
      area: (data.area ?? "audiovisual") as "audiovisual" | "design",
      tipoVideo: data.tipoVideo,
      cidade: data.cidade,
      prioridade: data.prioridade as Prioridade,
      motivoUrgencia: data.motivoUrgencia,
      statusInterno,
      statusVisivel,
      pesoDemanda: peso,
      solicitanteId: session.user.id,
      ...(origem && { mcpTokenId: origem.mcpTokenId }),
      // Quem aprovou — o mesmo campo que api/demandas/[id]/aprovar preenche. Só
      // quando quem criou decide a fila: entrar aprovado por ser da casa não faz
      // de ninguém o gestor do pedido.
      ...(jaAprovada && entrada.porQuemDecide && { gestorId: session.user.id }),
      dataLimite: data.dataLimite ? new Date(data.dataLimite) : undefined,
      campanha: data.campanha,
      objetivo: data.objetivo,
      plataforma: data.plataforma,
      dataEvento: data.dataEvento ? new Date(data.dataEvento) : undefined,
      dataCaptacao: data.dataCaptacao ? new Date(data.dataCaptacao) : undefined,
      localEvento: data.localEvento,
      cobertura: data.cobertura,
      publico: data.publico,
      mensagemPrincipal: data.mensagemPrincipal,
      referencia: data.referencia,
      localGravacao: data.localGravacao,
      edicaoPor: data.edicaoPor,
      tipoGravacao: data.tipoGravacao,
      temBrinde: data.temBrinde,
      brinde: data.brinde || undefined,
      levar: data.levar || undefined,
      // O schema sempre aceitou o cliente final, mas o create não gravava: o
      // formulário de cobertura mandava o nome e o card nascia sem ele.
      clienteFinalNome: data.clienteFinalNome?.trim() || undefined,
      clienteFinalTelefone: data.clienteFinalTelefone?.trim() || undefined,
      clienteFinalEmail: data.clienteFinalEmail?.trim() || undefined,
      // Novos campos
      videomakerId: videomakerIdResolvido,
      // O seletor de equipe devolve token unificado (ed:/vm:/user:), igual ao da
      // edição. Sem resolver aqui, escolher o editor na CRIAÇÃO gravaria um id
      // inválido — por isso o campo nunca tinha sido oferecido nos formulários.
      editorId: editorIdResolvido,
      designerId: designerIdResolvido || undefined,
      responsavelId: responsavelId || undefined,
      linhaProjeto: linhaProjetoTexto,
      linhaProjetoId: linhaProjetoId || undefined,
      socialId,
      eventoGestaoId: data.eventoGestaoId || undefined,
      telefoneSolicitante: data.telefoneSolicitante || undefined,
      classificacao: data.classificacao || undefined,
      formato: data.formato || undefined,
      linkBrutos: data.linkBrutos || undefined,
      detalhesEntrega: data.detalhesEntrega ? (data.detalhesEntrega as object) : undefined,
    },
  }))

  if (data.ideiaId) await ligarIdeiaAoPedido(data.ideiaId, demanda)

  // Vincular produto(s) — multi-seleção, validando que pertencem à org (sem cross-org).
  const produtoIds = Array.from(new Set([
    ...(data.produtoIds ?? []),
    ...(data.produtoId ? [data.produtoId] : []),
  ]))
  if (produtoIds.length > 0) {
    const validos = await prisma.produto.findMany({
      where: { id: { in: produtoIds }, organizacaoId },
      select: { id: true },
    })
    if (validos.length > 0) {
      await prisma.demandaProduto.createMany({
        data: validos.map((p) => ({ demandaId: demanda.id, produtoId: p.id })),
        skipDuplicates: true,
      }).catch(e => console.error("[Demanda] Erro ao vincular produtos:", e))
    }
  }

  // Vincular responsável(eis) — já validados como membros da org. Passa pelo
  // escritor compartilhado para a M2M e a coluna derivada nascerem em sincronia.
  if (responsaveisValidos.length > 0) {
    await setResponsaveis(demanda.id, responsaveisValidos)
      .catch(e => console.error("[Demanda] Erro ao vincular responsáveis:", e))

    // Avisa quem já nasce responsável. Sem isto, criar a demanda de Growth já
    // atribuída era o único caminho em que a pessoa nunca ficava sabendo —
    // atribuir depois avisa (ver PATCH), criar atribuindo não avisava.
    emSegundoPlano(async () => {
      const novos = responsaveisValidos.filter((uid) => uid !== session.user.id)
      if (novos.length === 0) return
      const pessoas = await prisma.usuario.findMany({
        where: { id: { in: novos }, status: "ativo", telefone: { not: null } },
        select: { telefone: true },
      })
      const prazo = demanda.dataLimite ? formatarDataCurta(demanda.dataLimite) : null
      const msg = templates.responsavelAtribuido(demanda.codigo, demanda.titulo, prazo)
      await Promise.allSettled(
        pessoas.map((p) => sendWhatsappMessage(p.telefone!, msg, demanda.id, organizacaoId))
      )
    }, "wa-responsavel-nova-demanda")
  }

  // Auto-populate checklist a partir de templates
  try {
    const templates = await prisma.checklistTemplate.findMany({
      where: {
        ativo: true,
        OR: [
          { tipoVideo: data.tipoVideo },
          { tipoVideo: null },
        ],
      },
      include: { itens: { orderBy: { ordem: "asc" } } },
    })

    // Priorizar templates específicos do tipoVideo; se não houver, usar o "Geral"
    const templatesFiltrados = templates.filter(t => t.tipoVideo === data.tipoVideo)
    const templatesParaAplicar = templatesFiltrados.length > 0
      ? templatesFiltrados
      : templates.filter(t => t.tipoVideo === null && t.papel === "geral")

    const checklistData = templatesParaAplicar.flatMap(t =>
      t.itens.map(item => ({
        demandaId: demanda.id,
        texto: item.texto,
        ordem: item.ordem,
        grupo: t.papel ?? "geral",
      }))
    )

    if (checklistData.length > 0) {
      await prisma.checklistItem.createMany({ data: checklistData })
    }
  } catch (e) {
    console.error("[Demanda] Erro ao criar checklist automático:", e)
  }

  // Registrar histórico inicial
  await prisma.historicoStatus.create({
    data: {
      demandaId: demanda.id,
      statusNovo: statusInterno,
      usuarioId: session.user.id,
      origem: origem ? "ia" : "manual",
      observacao: (!jaAprovada ? "Demanda criada"
        : entrada.porQuemDecide ? "Demanda criada e aprovada por quem pediu"
        : "Demanda criada pela equipe — entra sem passar por Aprovações")
        + (origem ? " — pelo assistente (MCP)" : ""),
    },
  })

  // Já aprovada, não há o que pedir aos gestores: o alerta e o WhatsApp de
  // "aguarda aprovação" seriam um aviso falso. Os líderes seguem avisados abaixo
  // (é para atribuir e acompanhar, não para aprovar).
  if (!jaAprovada) {
    await prisma.alertaIA.create({
      data: {
        organizacaoId,
        demandaId: demanda.id,
        tipoAlerta: data.prioridade === "urgente" ? "urgencia_pendente" : "aprovacao_pendente",
        mensagem: data.prioridade === "urgente"
          ? `🚨 Nova urgência: "${data.titulo}" aguarda aprovação do gestor.`
          : `📋 Nova demanda: "${data.titulo}" aguarda aprovação interna.`,
        severidade: data.prioridade === "urgente" ? "critico" : "aviso",
        acaoSugerida: "Aprovar ou recusar demanda",
      },
    })

    // NOVO: Notifica gestores/admins via WhatsApp sobre nova demanda
    emSegundoPlano(() => notificarGestoresNovaDemanda(
      demanda.codigo,
      data.titulo,
      session.user.name ?? "Usuário",
      data.prioridade as string,
      organizacaoId
    ), "nova-demanda-gestores")
  }

  // Gravação externa tem os avisos dela (lib/avisos-gravacao.ts): já aprovada,
  // entra para a operação agendar; o líder do audiovisual não é avisado dela.
  if (ehGravacao && jaAprovada) {
    emSegundoPlano(() => avisarGravacao(organizacaoId, demanda.id, "entrou", session.user.id), "aviso-gravacao")
  }

  // Notifica os líderes do audiovisual (alerta direcionado no sino + WhatsApp)
  if (demanda.area === "audiovisual" && !ehGravacao) {
    emSegundoPlano(
      () => notificarLideresAudiovisual(demanda.id, demanda.codigo, data.titulo, organizacaoId),
      "nova-demanda-lideres"
    )
  }

  return NextResponse.json(demanda, { status: 201 })
}

/**
 * Notifica gestores/admins via WhatsApp sobre nova demanda criada no portal
 */
async function notificarGestoresNovaDemanda(
  codigo: string,
  titulo: string,
  nomeSolicitante: string,
  prioridade: string,
  organizacaoId?: string | null
) {
  try {
    const gestores = await quemRecebeTudo(organizacaoId)

    const emoji = prioridade === "urgente" ? "🚨" : prioridade === "alta" ? "⚡" : "📋"
    const prioLabel = prioridade === "urgente" ? "URGENTE" : prioridade === "alta" ? "Alta" : "Normal"

    const msg = `${emoji} *Nova Demanda no Sistema!*\n\n📋 *${codigo}* — ${titulo}\n👤 Solicitante: ${nomeSolicitante}\n⚡ Prioridade: ${prioLabel}\n\nAcesse o sistema para aprovar.`

    for (const g of gestores) {
      if (g.telefone) {
        await sendWhatsappMessage(g.telefone, msg, undefined, organizacaoId).catch(() => null)
      }
    }
  } catch (e) {
    console.error("[Demanda] Falha ao notificar gestores:", e)
  }
}
