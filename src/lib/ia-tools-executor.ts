/**
 * Executor de ferramentas IA — implementa cada tool disponível para os agentes
 * Acessa o Prisma diretamente para buscar e criar dados
 */

import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/whatsapp"

// ─── Executor principal ───────────────────────────────────────────────────────

export async function executarFerramenta(
  nome: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (nome) {
      case "buscar_demandas":
        return await buscarDemandas(input)
      case "buscar_videomakers":
        return await buscarVideomakers(input)
      case "buscar_custos":
        return await buscarCustos(input)
      case "buscar_metricas":
        return await buscarMetricas()
      case "buscar_alertas":
        return await buscarAlertas(input)
      case "criar_alerta":
        return await criarAlerta(input)
      case "buscar_historico_demanda":
        return await buscarHistoricoDemanda(input)
      // ── Novas ferramentas ─────────────────────────────────────────────────
      case "buscar_agenda_videomaker":
        return await buscarAgendaVideomaker(input)
      case "criar_evento_agenda":
        return await criarEventoAgenda(input)
      case "enviar_whatsapp":
        return await enviarWhatsapp(input)
      case "criar_demanda_rascunho":
        return await criarDemandaRascunho(input)
      case "buscar_demanda_por_codigo":
        return await buscarDemandaPorCodigo(input)
      case "listar_gestores":
        return await listarGestores()
      case "estruturar_demanda":
        return await estruturarDemanda(input)
      case "solicitar_dados_demanda":
        return await solicitarDadosDemanda(input)
      case "vincular_arquivo_demanda":
        return await vincularArquivoDemanda(input)
      case "salvar_ideia_video":
        return await salvarIdeiaVideo(input)
      case "buscar_ideias":
        return await buscarIdeias(input)
      default:
        return JSON.stringify({ erro: `Ferramenta '${nome}' não encontrada` })
    }
  } catch (e) {
    return JSON.stringify({ erro: String(e) })
  }
}

// ─── Implementações ───────────────────────────────────────────────────────────

async function buscarDemandas(input: Record<string, unknown>): Promise<string> {
  const limite = (input.limite as number) ?? 25
  const hoje = new Date()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (input.status) {
    where.statusInterno = input.status
  }
  if (input.prioridade) {
    where.prioridade = input.prioridade
  }
  if (input.em_atraso) {
    where.dataLimite = { lt: hoje }
    where.statusInterno = {
      notIn: ["postado", "entregue_cliente", "encerrado", "expirado"],
    }
  }
  if (input.paradas_ha_dias) {
    const limite_data = new Date(hoje.getTime() - (input.paradas_ha_dias as number) * 86400000)
    where.updatedAt = { lt: limite_data }
    where.statusInterno = {
      notIn: ["postado", "entregue_cliente", "encerrado", "expirado"],
    }
  }

  const demandas = await prisma.demanda.findMany({
    where,
    take: limite,
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      codigo: true,
      titulo: true,
      tipoVideo: true,
      prioridade: true,
      statusInterno: true,
      statusVisivel: true,
      dataLimite: true,
      dataCaptacao: true,
      createdAt: true,
      updatedAt: true,
      riscoAtraso: true,
      videomaker: { select: { id: true, nome: true, telefone: true } },
      editor: { select: { id: true, nome: true } },
      solicitante: { select: { nome: true, telefone: true } },
    },
  })

  const demandasFormatadas = demandas.map(d => ({
    ...d,
    diasSemAtualizacao: Math.floor((hoje.getTime() - d.updatedAt.getTime()) / 86400000),
    emAtraso: d.dataLimite ? d.dataLimite < hoje : false,
    horasParaPrazo: d.dataLimite
      ? Math.floor((d.dataLimite.getTime() - hoje.getTime()) / 3600000)
      : null,
  }))

  return JSON.stringify({
    total: demandasFormatadas.length,
    demandas: demandasFormatadas,
  })
}

async function buscarVideomakers(input: Record<string, unknown>): Promise<string> {
  const apenasAtivos = input.apenas_ativos !== false

  const videomakers = await prisma.videomaker.findMany({
    where: apenasAtivos
      ? { status: { in: ["ativo", "preferencial"] }, emListaNegra: false }
      : undefined,
    select: {
      id: true,
      nome: true,
      cidade: true,
      telefone: true,
      valorDiaria: true,
      avaliacao: true,
      status: true,
      areasAtuacao: true,
      habilidades: true,
      demandas: {
        where: {
          statusInterno: {
            notIn: ["postado", "entregue_cliente", "encerrado", "expirado"],
          },
        },
        select: { id: true, statusInterno: true, prioridade: true },
      },
    },
  })

  const hoje = new Date()
  const ha30dias = new Date(hoje.getTime() - 30 * 86400000)

  const custosPorVm = await prisma.custoVideomaker.groupBy({
    by: ["videomakerId"],
    where: { dataReferencia: { gte: ha30dias } },
    _sum: { valor: true },
    _count: { id: true },
  })

  const vmComDados = videomakers.map(vm => {
    const custoVm = custosPorVm.find(c => c.videomakerId === vm.id)
    return {
      ...vm,
      demandasAtivas: vm.demandas.length,
      custoUltimos30d: custoVm?._sum.valor ?? 0,
      servicosMes: custoVm?._count.id ?? 0,
    }
  })

  return JSON.stringify({ total: vmComDados.length, videomakers: vmComDados })
}

async function buscarCustos(input: Record<string, unknown>): Promise<string> {
  const dias = (input.dias as number) ?? 30
  const inicio = new Date(Date.now() - dias * 86400000)

  const [custos, totalPorTipo, totalPorVm] = await Promise.all([
    prisma.custoVideomaker.findMany({
      where: { dataReferencia: { gte: inicio } },
      include: { videomaker: { select: { nome: true } } },
      orderBy: { dataReferencia: "desc" },
      take: 50,
    }),
    prisma.custoVideomaker.groupBy({
      by: ["tipo"],
      where: { dataReferencia: { gte: inicio } },
      _sum: { valor: true },
      _count: { id: true },
    }),
    prisma.custoVideomaker.groupBy({
      by: ["videomakerId"],
      where: { dataReferencia: { gte: inicio } },
      _sum: { valor: true },
      _count: { id: true },
    }),
  ])

  const total = custos.reduce((s, c) => s + c.valor, 0)
  const demandasPeriodo = await prisma.demanda.count({
    where: { createdAt: { gte: inicio } },
  })

  const vmNames = await prisma.videomaker.findMany({
    where: { id: { in: totalPorVm.map(v => v.videomakerId) } },
    select: { id: true, nome: true },
  })

  return JSON.stringify({
    periodo: `últimos ${dias} dias`,
    totalGasto: total,
    custoMedioPorVideo: demandasPeriodo > 0 ? total / demandasPeriodo : 0,
    numeroDemandas: demandasPeriodo,
    porTipo: totalPorTipo.map(t => ({ tipo: t.tipo, total: t._sum.valor, servicos: t._count.id })),
    porVideomaker: totalPorVm.map(v => ({
      videomaker: vmNames.find(n => n.id === v.videomakerId)?.nome ?? v.videomakerId,
      total: v._sum.valor,
      servicos: v._count.id,
    })).sort((a, b) => (b.total ?? 0) - (a.total ?? 0)),
  })
}

async function buscarMetricas(): Promise<string> {
  const hoje = new Date()
  const ha7d = new Date(hoje.getTime() - 7 * 86400000)
  const ha30d = new Date(hoje.getTime() - 30 * 86400000)

  const [
    totalAtivas,
    urgentes,
    emAtraso,
    concluidasSemana,
    concluidasMes,
    alertasCriticos,
    alertasTotal,
    custoMes,
    demandasMes,
  ] = await Promise.all([
    prisma.demanda.count({
      where: { statusInterno: { notIn: ["postado", "entregue_cliente", "encerrado", "expirado"] } },
    }),
    prisma.demanda.count({
      where: {
        prioridade: "urgente",
        statusInterno: { notIn: ["postado", "entregue_cliente", "encerrado"] },
      },
    }),
    prisma.demanda.count({
      where: {
        dataLimite: { lt: hoje },
        statusInterno: { notIn: ["postado", "entregue_cliente", "encerrado", "expirado"] },
      },
    }),
    prisma.demanda.count({
      where: { statusInterno: { in: ["postado", "entregue_cliente"] }, updatedAt: { gte: ha7d } },
    }),
    prisma.demanda.count({
      where: { statusInterno: { in: ["postado", "entregue_cliente"] }, updatedAt: { gte: ha30d } },
    }),
    prisma.alertaIA.count({ where: { status: "ativo", severidade: "critico" } }),
    prisma.alertaIA.count({ where: { status: "ativo" } }),
    prisma.custoVideomaker.aggregate({ where: { dataReferencia: { gte: ha30d } }, _sum: { valor: true } }),
    prisma.demanda.count({ where: { createdAt: { gte: ha30d } } }),
  ])

  return JSON.stringify({
    geradoEm: hoje.toISOString(),
    demandas: {
      ativas: totalAtivas,
      urgentes,
      emAtraso,
      concluidasSemana,
      concluidasMes,
      totalMes: demandasMes,
    },
    alertas: { total: alertasTotal, criticos: alertasCriticos },
    financeiro: {
      custoMes: custoMes._sum.valor ?? 0,
      custoMedioPorVideo: demandasMes > 0 ? (custoMes._sum.valor ?? 0) / demandasMes : 0,
    },
    saudeGeral: calcularSaude({ totalAtivas, urgentes, emAtraso, alertasCriticos, concluidasSemana }),
  })
}

function calcularSaude(dados: {
  totalAtivas: number
  urgentes: number
  emAtraso: number
  alertasCriticos: number
  concluidasSemana: number
}): number {
  let score = 100
  if (dados.emAtraso > 0) score -= Math.min(30, dados.emAtraso * 5)
  if (dados.alertasCriticos > 0) score -= Math.min(20, dados.alertasCriticos * 5)
  if (dados.urgentes > dados.concluidasSemana) score -= 10
  return Math.max(0, score)
}

async function buscarAlertas(input: Record<string, unknown>): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { status: "ativo" }
  if (input.severidade) where.severidade = input.severidade

  const alertas = await prisma.alertaIA.findMany({
    where,
    orderBy: [{ severidade: "desc" }, { createdAt: "desc" }],
    take: 30,
    include: { demanda: { select: { codigo: true, titulo: true } } },
  })

  return JSON.stringify({ total: alertas.length, alertas })
}

async function criarAlerta(input: Record<string, unknown>): Promise<string> {
  const alerta = await prisma.alertaIA.create({
    data: {
      tipoAlerta: input.tipo as string,
      mensagem: input.mensagem as string,
      severidade: (input.severidade as "info" | "aviso" | "critico") ?? "aviso",
      acaoSugerida: input.acao_sugerida as string | undefined,
      demandaId: input.demanda_id as string | undefined,
      status: "ativo",
    },
  })

  return JSON.stringify({ criado: true, id: alerta.id, mensagem: alerta.mensagem })
}

async function buscarHistoricoDemanda(input: Record<string, unknown>): Promise<string> {
  const historico = await prisma.historicoStatus.findMany({
    where: { demandaId: input.demanda_id as string },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      statusAnterior: true,
      statusNovo: true,
      origem: true,
      createdAt: true,
      observacao: true,
    },
  })

  return JSON.stringify({ demandaId: input.demanda_id, historico })
}

// ─── Novas ferramentas ────────────────────────────────────────────────────────

/**
 * Busca agenda de um videomaker (externo) ou editor (videomaker interno).
 * Aceita videomaker_id, editor_id, nome ou telefone.
 */
async function buscarAgendaVideomaker(input: Record<string, unknown>): Promise<string> {
  const hoje = new Date()
  const diasFuturos = (input.dias_futuros as number) ?? 7
  const inicio = input.inicio ? new Date(input.inicio as string) : hoje
  const fim = new Date(inicio.getTime() + diasFuturos * 86400000)

  // Tenta encontrar editor (videomaker interno) primeiro
  if (input.editor_id) {
    const editor = await prisma.editor.findUnique({
      where: { id: input.editor_id as string },
      select: { id: true, nome: true, telefone: true },
    })
    if (editor) {
      const eventos = await prisma.evento.findMany({
        where: { editorId: editor.id, inicio: { gte: inicio, lte: fim }, status: { not: "cancelado" } },
        orderBy: { inicio: "asc" },
        select: {
          id: true, titulo: true, descricao: true, inicio: true,
          fim: true, diaTodo: true, tipo: true, status: true, local: true,
          demanda: { select: { codigo: true, titulo: true } },
        },
      })
      return JSON.stringify({
        pessoa: editor.nome,
        tipo_pessoa: "editor (videomaker interno)",
        editor_id: editor.id,
        telefone: editor.telefone,
        periodo: `${inicio.toLocaleDateString("pt-BR")} — ${fim.toLocaleDateString("pt-BR")}`,
        eventos,
        totalOcupacoes: eventos.length,
      })
    }
  }

  // Busca videomaker externo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vmWhere: any = {}
  if (input.videomaker_id) vmWhere.id = input.videomaker_id
  else if (input.nome) vmWhere.nome = { contains: input.nome as string, mode: "insensitive" }
  else if (input.telefone) vmWhere.telefone = { contains: (input.telefone as string).slice(-8) }

  // Se não encontrou por videomaker, tenta editor por nome/telefone
  if (!input.videomaker_id && (input.nome || input.telefone)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const edWhere: any = {}
    if (input.nome) edWhere.nome = { contains: input.nome as string, mode: "insensitive" }
    else if (input.telefone) {
      edWhere.OR = [
        { telefone: { contains: (input.telefone as string).slice(-8) } },
        { whatsapp: { contains: (input.telefone as string).slice(-8) } },
      ]
    }
    const editor = await prisma.editor.findFirst({ where: edWhere, select: { id: true, nome: true, telefone: true } })
    if (editor) {
      const eventos = await prisma.evento.findMany({
        where: { editorId: editor.id, inicio: { gte: inicio, lte: fim }, status: { not: "cancelado" } },
        orderBy: { inicio: "asc" },
        select: {
          id: true, titulo: true, descricao: true, inicio: true,
          fim: true, diaTodo: true, tipo: true, status: true, local: true,
          demanda: { select: { codigo: true, titulo: true } },
        },
      })
      return JSON.stringify({
        pessoa: editor.nome,
        tipo_pessoa: "editor (videomaker interno)",
        editor_id: editor.id,
        telefone: editor.telefone,
        periodo: `${inicio.toLocaleDateString("pt-BR")} — ${fim.toLocaleDateString("pt-BR")}`,
        eventos,
        totalOcupacoes: eventos.length,
      })
    }
  }

  const videomaker = await prisma.videomaker.findFirst({
    where: vmWhere,
    select: { id: true, nome: true, telefone: true },
  })

  if (!videomaker) return JSON.stringify({ erro: "Nenhum videomaker ou editor encontrado", input })

  const [eventos, captacoes] = await Promise.all([
    prisma.evento.findMany({
      where: { videomakerId: videomaker.id, inicio: { gte: inicio, lte: fim }, status: { not: "cancelado" } },
      orderBy: { inicio: "asc" },
      select: {
        id: true, titulo: true, descricao: true, inicio: true,
        fim: true, diaTodo: true, tipo: true, status: true, local: true,
        demanda: { select: { codigo: true, titulo: true } },
      },
    }),
    prisma.demanda.findMany({
      where: {
        videomakerId: videomaker.id,
        dataCaptacao: { gte: inicio, lte: fim },
        statusInterno: { notIn: ["encerrado", "postado", "entregue_cliente", "expirado"] },
      },
      select: { codigo: true, titulo: true, dataCaptacao: true, statusInterno: true, cidade: true },
    }),
  ])

  return JSON.stringify({
    pessoa: videomaker.nome,
    tipo_pessoa: "videomaker externo",
    videomaker_id: videomaker.id,
    telefone: videomaker.telefone,
    periodo: `${inicio.toLocaleDateString("pt-BR")} — ${fim.toLocaleDateString("pt-BR")}`,
    eventos,
    captacoesAgendadas: captacoes,
    totalOcupacoes: eventos.length + captacoes.length,
  })
}

/**
 * Verifica conflitos de agenda para um período
 */
async function verificarConflitos(
  inicio: Date,
  fim: Date,
  opts: { videomakerId?: string; editorId?: string; usuarioId?: string }
): Promise<{ conflito: boolean; eventoConflitante?: { titulo: string; inicio: Date; fim: Date; local?: string | null }; sugestoes: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    status: { not: "cancelado" },
    OR: [
      // Novo evento começa durante evento existente
      { inicio: { lte: inicio }, fim: { gt: inicio } },
      // Novo evento termina durante evento existente
      { inicio: { lt: fim }, fim: { gte: fim } },
      // Evento existente está completamente dentro do novo
      { inicio: { gte: inicio }, fim: { lte: fim } },
    ],
  }

  if (opts.editorId) where.editorId = opts.editorId
  else if (opts.videomakerId) where.videomakerId = opts.videomakerId
  else if (opts.usuarioId) where.usuarioId = opts.usuarioId

  const conflitantes = await prisma.evento.findMany({
    where,
    orderBy: { inicio: "asc" },
    take: 3,
    select: { titulo: true, inicio: true, fim: true, local: true },
  })

  if (conflitantes.length === 0) {
    return { conflito: false, sugestoes: [] }
  }

  // Gera sugestões de horários livres no mesmo dia
  const duracao = fim.getTime() - inicio.getTime()
  const diaInicio = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 8, 0) // 8h
  const diaFim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 20, 0) // 20h

  // Busca todos os eventos do dia para encontrar gaps
  const ownerWhere = opts.editorId
    ? { editorId: opts.editorId }
    : opts.videomakerId
    ? { videomakerId: opts.videomakerId }
    : { usuarioId: opts.usuarioId }

  const eventosDoDia = await prisma.evento.findMany({
    where: {
      ...ownerWhere,
      status: { not: "cancelado" },
      inicio: { gte: diaInicio, lt: new Date(diaInicio.getTime() + 86400000) },
    },
    orderBy: { inicio: "asc" },
    select: { inicio: true, fim: true },
  })

  const sugestoes: string[] = []

  // Encontra slots livres
  let cursor = diaInicio.getTime()
  for (const ev of eventosDoDia) {
    const evInicio = ev.inicio.getTime()
    const evFim = ev.fim.getTime()
    if (evInicio - cursor >= duracao) {
      const sugInicio = new Date(cursor)
      sugestoes.push(sugInicio.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }))
    }
    cursor = Math.max(cursor, evFim)
  }
  // Depois do último evento
  if (diaFim.getTime() - cursor >= duracao) {
    const sugInicio = new Date(cursor)
    sugestoes.push(sugInicio.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }))
  }

  // Se não encontrou no mesmo dia, sugere o dia seguinte
  if (sugestoes.length === 0) {
    const amanha = new Date(inicio.getTime() + 86400000)
    amanha.setHours(inicio.getHours(), inicio.getMinutes(), 0, 0)
    sugestoes.push(`Amanhã ${amanha.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}`)
  }

  return {
    conflito: true,
    eventoConflitante: conflitantes[0],
    sugestoes: sugestoes.slice(0, 3),
  }
}

/**
 * Cria evento com verificação de conflitos.
 * Se conflito encontrado, retorna sugestões ao invés de criar.
 */
async function criarEventoAgenda(input: Record<string, unknown>): Promise<string> {
  const videomakerId = (input.videomaker_id as string) || undefined
  const editorId = (input.editor_id as string) || undefined
  const usuarioId = (input.usuario_id as string) || undefined
  const forcar = (input.forcar as boolean) ?? false

  if (!videomakerId && !editorId && !usuarioId) {
    return JSON.stringify({ erro: "Informe editor_id (videomaker interno), videomaker_id (externo) ou usuario_id (gestor)" })
  }

  const inicio = new Date(input.inicio as string)
  const fim = input.fim
    ? new Date(input.fim as string)
    : new Date(inicio.getTime() + 2 * 3600000)

  // ── Verifica conflitos (a menos que forcar=true) ──────────────────────
  if (!forcar) {
    const check = await verificarConflitos(inicio, fim, { videomakerId, editorId, usuarioId })
    if (check.conflito && check.eventoConflitante) {
      const ev = check.eventoConflitante
      return JSON.stringify({
        conflito: true,
        criado: false,
        evento_conflitante: {
          titulo: ev.titulo,
          inicio: ev.inicio.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
          fim: ev.fim.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
          local: ev.local,
        },
        sugestoes_horarios: check.sugestoes,
        instrucao: `⚠️ CONFLITO: Já existe "${ev.titulo}" nesse horário. Sugestões de horários livres: ${check.sugestoes.join(", ")}. Informe ao usuário e pergunte qual horário prefere. Se insistir no horário original, chame criar_evento_agenda novamente com forcar=true.`,
      })
    }
  }

  // ── Cria o evento ─────────────────────────────────────────────────────
  const evento = await prisma.evento.create({
    data: {
      titulo: input.titulo as string,
      descricao: (input.descricao as string) ?? undefined,
      inicio,
      fim,
      diaTodo: (input.dia_todo as boolean) ?? false,
      tipo: ((input.tipo as string) ?? "captacao") as import("@prisma/client").TipoEvento,
      contexto: "sistema",
      status: "agendado",
      local: (input.local as string) ?? undefined,
      videomakerId,
      editorId,
      usuarioId,
      demandaId: (input.demanda_id as string) ?? undefined,
    },
  })

  // Nome do dono
  let nomeResponsavel = "Usuário"
  if (editorId) {
    const ed = await prisma.editor.findUnique({ where: { id: editorId }, select: { nome: true } })
    nomeResponsavel = ed?.nome ?? "Editor"
  } else if (videomakerId) {
    const vm = await prisma.videomaker.findUnique({ where: { id: videomakerId }, select: { nome: true } })
    nomeResponsavel = vm?.nome ?? "Videomaker"
  } else if (usuarioId) {
    const us = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nome: true } })
    nomeResponsavel = us?.nome ?? "Gestor"
  }

  return JSON.stringify({
    criado: true,
    conflito: false,
    evento_id: evento.id,
    titulo: evento.titulo,
    inicio: evento.inicio.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    fim: evento.fim.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    responsavel: nomeResponsavel,
    mensagem: `Evento "${evento.titulo}" agendado para ${nomeResponsavel} em ${evento.inicio.toLocaleDateString("pt-BR")}`,
  })
}

/**
 * Envia mensagem WhatsApp (secretária + notificações automáticas)
 */
async function enviarWhatsapp(input: Record<string, unknown>): Promise<string> {
  const telefone = input.telefone as string
  const mensagem = input.mensagem as string
  if (!telefone || !mensagem) return JSON.stringify({ erro: "telefone e mensagem são obrigatórios" })

  const resultado = await sendWhatsappMessage(telefone, mensagem, (input.demanda_id as string) ?? undefined)
  return JSON.stringify({
    enviado: !!resultado,
    telefone,
    preview: mensagem.slice(0, 120),
  })
}

/**
 * Cria rascunho de demanda recebida via WhatsApp
 */
async function criarDemandaRascunho(input: Record<string, unknown>): Promise<string> {
  const count = await prisma.demanda.count()
  const codigo = `VID-${String(count + 1).padStart(4, "0")}`

  // Normaliza telefone do solicitante
  const telSolicitante = input.telefone_solicitante
    ? (input.telefone_solicitante as string).replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, "").replace(/\D/g, "")
    : undefined

  // Tenta vincular a um usuário pelo telefone
  let solicitanteId: string | undefined
  let isExternalRequester = false
  if (telSolicitante) {
    const u = await prisma.usuario.findFirst({
      where: { telefone: { contains: telSolicitante.slice(-8) } },
    })
    solicitanteId = u?.id
  }
  if (!solicitanteId) {
    // Solicitante externo — vincula ao admin/gestor como responsável
    isExternalRequester = true
    const admin = await prisma.usuario.findFirst({ where: { tipo: { in: ["admin", "gestor"] } } })
    solicitanteId = admin?.id
  }
  if (!solicitanteId) return JSON.stringify({ erro: "Nenhum gestor encontrado para vincular" })

  // Resolve nome do solicitante real (de ContatoWhatsApp ou input)
  let nomeSolicitante = (input.nome_solicitante as string) || null
  if (!nomeSolicitante && telSolicitante) {
    const contato = await prisma.contatoWhatsApp.findFirst({
      where: { telefone: { contains: telSolicitante.slice(-8) } },
    })
    nomeSolicitante = contato?.nome ?? null
  }

  const demanda = await prisma.demanda.create({
    data: {
      codigo,
      titulo: input.titulo as string,
      descricao: (input.descricao as string) ?? "Demanda criada via WhatsApp",
      departamento: ((input.departamento as string) ?? "outros") as import("@prisma/client").Departamento,
      tipoVideo: (input.tipo_video as string) ?? "institucional",
      prioridade: (input.prioridade as "normal" | "alta" | "urgente") ?? "normal",
      cidade: (input.cidade as string) ?? "A definir",
      statusInterno: "aguardando_aprovacao_interna",
      statusVisivel: "entrada",
      solicitanteId,
      telefoneSolicitante: telSolicitante || undefined,
      nomeSolicitante: nomeSolicitante || undefined,
    },
  })

  // Notifica gestores sobre a nova demanda
  if (isExternalRequester && nomeSolicitante) {
    const gestores = await prisma.usuario.findMany({
      where: { tipo: { in: ["admin", "gestor"] as import("@prisma/client").TipoUsuario[] }, status: "ativo", telefone: { not: null } },
      select: { telefone: true, nome: true },
    })
    for (const g of gestores) {
      if (g.telefone) {
        await sendWhatsappMessage(
          g.telefone,
          `📋 *Nova demanda via WhatsApp!*\n\n*${codigo}* — ${demanda.titulo}\n👤 Solicitante: ${nomeSolicitante} (${telSolicitante})\n\nAcesse o sistema para aprovar.`,
          demanda.id
        ).catch(() => null)
      }
    }
  }

  return JSON.stringify({
    criado: true,
    demanda_id: demanda.id,
    codigo: demanda.codigo,
    titulo: demanda.titulo,
    status: demanda.statusInterno,
    solicitante_externo: isExternalRequester,
    nome_solicitante: nomeSolicitante,
    mensagem: `Demanda *${codigo}* criada e aguardando aprovação interna.`,
  })
}

/**
 * Busca demanda pelo código (ex: VID-0023)
 */
async function buscarDemandaPorCodigo(input: Record<string, unknown>): Promise<string> {
  const demanda = await prisma.demanda.findFirst({
    where: { codigo: { equals: input.codigo as string, mode: "insensitive" } },
    include: {
      videomaker: { select: { nome: true, telefone: true } },
      editor: { select: { nome: true } },
      solicitante: { select: { nome: true, telefone: true } },
      historicos: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  })

  if (!demanda) return JSON.stringify({ erro: `Demanda ${input.codigo} não encontrada` })

  const hoje = new Date()
  return JSON.stringify({
    ...demanda,
    emAtraso: demanda.dataLimite ? demanda.dataLimite < hoje : false,
    diasSemAtualizacao: Math.floor((hoje.getTime() - demanda.updatedAt.getTime()) / 86400000),
  })
}

/**
 * Lista gestores/admins com telefones para notificação
 */
async function listarGestores(): Promise<string> {
  const gestores = await prisma.usuario.findMany({
    where: { tipo: { in: ["admin", "gestor"] as import("@prisma/client").TipoUsuario[] }, status: "ativo" },
    select: { id: true, nome: true, telefone: true, email: true, tipo: true },
  })
  return JSON.stringify({ total: gestores.length, gestores })
}

// ─── Ferramentas Fase WhatsApp Avançado ──────────────────────────────────────

/**
 * Estrutura uma descrição vaga/informal em campos organizados de demanda.
 * Usa IA para interpretar e retorna os dados estruturados (sem criar a demanda).
 */
async function estruturarDemanda(input: Record<string, unknown>): Promise<string> {
  const texto = input.texto_original as string
  if (!texto) return JSON.stringify({ erro: "texto_original é obrigatório" })

  // Usa heurísticas para extrair dados sem chamar IA (evita loop recursivo)
  const textoLower = texto.toLowerCase()

  // Detecta tipo de vídeo
  let tipoVideo = "institucional"
  if (textoLower.includes("evento") || textoLower.includes("cobertura") || textoLower.includes("aftermovie")) tipoVideo = "cobertura_evento"
  else if (textoLower.includes("social") || textoLower.includes("instagram") || textoLower.includes("tiktok") || textoLower.includes("reels")) tipoVideo = "social_media"
  else if (textoLower.includes("treinamento") || textoLower.includes("curso")) tipoVideo = "treinamento"
  else if (textoLower.includes("ads") || textoLower.includes("meta") || textoLower.includes("anúncio")) tipoVideo = "video_meta_ads"
  else if (textoLower.includes("vsl") || textoLower.includes("vendas")) tipoVideo = "vsl"

  // Detecta departamento
  let departamento = "outros"
  if (textoLower.includes("growth") || textoLower.includes("marketing")) departamento = "growth"
  else if (textoLower.includes("evento")) departamento = "eventos"
  else if (textoLower.includes("institucional") || textoLower.includes("empresa")) departamento = "institucional"
  else if (textoLower.includes("rh") || textoLower.includes("recurso")) departamento = "rh"

  // Detecta prioridade
  let prioridade = "normal"
  if (textoLower.includes("urgente") || textoLower.includes("urgência") || textoLower.includes("pra ontem")) prioridade = "urgente"
  else if (textoLower.includes("importante") || textoLower.includes("prioridade")) prioridade = "alta"

  // Detecta cidade (padrões simples)
  let cidade = "A definir"
  const cidadeMatch = texto.match(/(?:em|na|no)\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][a-záéíóúâêîôûãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][a-záéíóúâêîôûãõç]+)?)/u)
  if (cidadeMatch) cidade = cidadeMatch[1]

  // Gera título curto a partir do texto
  const titulo = texto.length > 60 ? texto.slice(0, 57) + "..." : texto

  const estruturada = {
    titulo,
    descricao: texto,
    tipo_video: tipoVideo,
    departamento,
    prioridade,
    cidade,
    nome_solicitante: (input.nome_solicitante as string) || "Desconhecido",
    telefone_solicitante: (input.telefone_solicitante as string) || undefined,
    resumo_para_confirmacao: `📋 *Demanda Estruturada:*\n\n📌 *Título:* ${titulo}\n🎬 *Tipo:* ${tipoVideo}\n🏢 *Depto:* ${departamento}\n⚡ *Prioridade:* ${prioridade}\n📍 *Cidade:* ${cidade}\n\n📝 *Descrição:* ${texto}`,
  }

  return JSON.stringify({
    estruturada: true,
    ...estruturada,
    instrucao: "Apresente o resumo_para_confirmacao ao solicitante via enviar_whatsapp e pergunte se deseja confirmar. Se SIM, use criar_demanda_rascunho com os dados acima.",
  })
}

/**
 * Envia mensagem ao solicitante original de uma demanda pedindo dados faltantes
 */
async function solicitarDadosDemanda(input: Record<string, unknown>): Promise<string> {
  // Busca a demanda
  let demanda
  if (input.demanda_id) {
    demanda = await prisma.demanda.findUnique({
      where: { id: input.demanda_id as string },
      select: { id: true, codigo: true, titulo: true, telefoneSolicitante: true, solicitante: { select: { nome: true, telefone: true } } },
    })
  } else if (input.codigo_demanda) {
    demanda = await prisma.demanda.findFirst({
      where: { codigo: { equals: input.codigo_demanda as string, mode: "insensitive" } },
      select: { id: true, codigo: true, titulo: true, telefoneSolicitante: true, solicitante: { select: { nome: true, telefone: true } } },
    })
  }

  if (!demanda) return JSON.stringify({ erro: "Demanda não encontrada" })

  // Determina o telefone do solicitante
  const telefone = demanda.telefoneSolicitante || demanda.solicitante?.telefone
  if (!telefone) {
    return JSON.stringify({
      erro: "Solicitante não tem telefone cadastrado. Não é possível enviar mensagem.",
      demanda_codigo: demanda.codigo,
    })
  }

  const mensagem = input.mensagem as string
  const msgCompleta = `📋 *NuFlow — ${demanda.codigo}*\n\n${mensagem}\n\n_Responda esta mensagem com as informações solicitadas._`

  const resultado = await sendWhatsappMessage(telefone, msgCompleta, demanda.id)

  return JSON.stringify({
    enviado: !!resultado,
    telefone,
    demanda_codigo: demanda.codigo,
    dados_faltantes: (input.dados_faltantes as string) || "dados gerais",
    mensagem: `Mensagem enviada para o solicitante de ${demanda.codigo}`,
  })
}

/**
 * Vincula arquivo recebido via WhatsApp a uma demanda
 */
async function vincularArquivoDemanda(input: Record<string, unknown>): Promise<string> {
  // Busca demanda
  let demandaId = input.demanda_id as string | undefined
  if (!demandaId && input.codigo_demanda) {
    const d = await prisma.demanda.findFirst({
      where: { codigo: { equals: input.codigo_demanda as string, mode: "insensitive" } },
      select: { id: true },
    })
    demandaId = d?.id
  }

  if (!demandaId) return JSON.stringify({ erro: "Demanda não encontrada" })

  const arquivo = await prisma.arquivo.create({
    data: {
      demandaId,
      tipoArquivo: ((input.tipo as string) || "referencia") as import("@prisma/client").TipoArquivo,
      nomeArquivo: input.nome_arquivo as string,
      url: input.url_arquivo as string,
      origem: "whatsapp",
    },
  })

  return JSON.stringify({
    vinculado: true,
    arquivo_id: arquivo.id,
    demanda_id: demandaId,
    nome: arquivo.nomeArquivo,
    mensagem: `Arquivo "${arquivo.nomeArquivo}" vinculado à demanda.`,
  })
}

// ─── Banco de Ideias ─────────────────────────────────────────────────────────

/**
 * Salva uma ideia de vídeo no Banco de Ideias (via WhatsApp ou IA)
 */
async function salvarIdeiaVideo(input: Record<string, unknown>): Promise<string> {
  const titulo = input.titulo as string
  const telefone = input.telefone_origem as string
  if (!titulo) return JSON.stringify({ erro: "titulo é obrigatório" })

  // Auto-detect platform from link
  const link = input.link_referencia as string | undefined
  let plataforma: string | null = null
  let origem: "whatsapp" | "instagram" | "tiktok" | "youtube" | "outro" = "whatsapp"

  if (link) {
    if (/instagram\.com/i.test(link)) { plataforma = "instagram"; origem = "instagram" }
    else if (/tiktok\.com/i.test(link)) { plataforma = "tiktok"; origem = "tiktok" }
    else if (/youtu(be\.com|\.be)/i.test(link)) { plataforma = "youtube"; origem = "youtube" }
  }

  // Try to match product by name
  let produtoId: string | null = null
  if (input.produto_nome) {
    const produto = await prisma.produto.findFirst({
      where: { nome: { contains: input.produto_nome as string, mode: "insensitive" }, ativo: true },
      select: { id: true, nome: true },
    })
    produtoId = produto?.id || null
  }

  const ideia = await prisma.ideiaVideo.create({
    data: {
      titulo,
      descricao: (input.descricao as string) || null,
      linkReferencia: link || null,
      mediaUrl: (input.media_url as string) || null,
      origem,
      plataforma,
      classificacao: (input.classificacao as string) || null,
      enviadoPor: (input.nome_origem as string) || null,
      telefoneOrigem: telefone ? telefone.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, "").replace(/\D/g, "") : null,
      produtoId,
      tags: [],
    },
  })

  const totalIdeias = await prisma.ideiaVideo.count()

  return JSON.stringify({
    salvo: true,
    ideia_id: ideia.id,
    titulo: ideia.titulo,
    produto: produtoId ? "vinculado" : "sem produto",
    total_ideias: totalIdeias,
    mensagem: `💡 Ideia "${titulo}" salva no Banco de Ideias! Total: ${totalIdeias} ideias.`,
  })
}

/**
 * Busca ideias de vídeo no Banco de Ideias
 */
async function buscarIdeias(input: Record<string, unknown>): Promise<string> {
  const limite = (input.limite as number) || 10

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (input.status) where.status = input.status
  if (input.produto_nome) {
    where.produto = { nome: { contains: input.produto_nome as string, mode: "insensitive" } }
  }

  const ideias = await prisma.ideiaVideo.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limite,
    include: {
      produto: { select: { nome: true } },
    },
  })

  const total = await prisma.ideiaVideo.count({ where })

  return JSON.stringify({
    total,
    ideias: ideias.map(i => ({
      id: i.id,
      titulo: i.titulo,
      status: i.status,
      origem: i.origem,
      scoreIA: i.scoreIA,
      produto: i.produto?.nome || null,
      classificacao: i.classificacao,
      criadoEm: i.createdAt.toLocaleDateString("pt-BR"),
      link: i.linkReferencia?.slice(0, 50) || null,
    })),
  })
}
