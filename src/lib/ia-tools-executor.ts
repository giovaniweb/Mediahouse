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
 * Busca agenda (eventos + captações) de um videomaker por período
 */
async function buscarAgendaVideomaker(input: Record<string, unknown>): Promise<string> {
  const hoje = new Date()
  const diasFuturos = (input.dias_futuros as number) ?? 7
  const inicio = input.inicio ? new Date(input.inicio as string) : hoje
  const fim = new Date(inicio.getTime() + diasFuturos * 86400000)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vmWhere: any = {}
  if (input.videomaker_id) vmWhere.id = input.videomaker_id
  else if (input.nome) vmWhere.nome = { contains: input.nome as string, mode: "insensitive" }
  else if (input.telefone) vmWhere.telefone = { contains: (input.telefone as string).slice(-8) }

  const videomaker = await prisma.videomaker.findFirst({
    where: vmWhere,
    select: { id: true, nome: true, telefone: true },
  })

  if (!videomaker) return JSON.stringify({ erro: "Videomaker não encontrado", input })

  const [eventos, captacoes] = await Promise.all([
    prisma.evento.findMany({
      where: { videomakerId: videomaker.id, inicio: { gte: inicio, lte: fim } },
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
    videomaker: videomaker.nome,
    videomaker_id: videomaker.id,
    telefone: videomaker.telefone,
    periodo: `${inicio.toLocaleDateString("pt-BR")} — ${fim.toLocaleDateString("pt-BR")}`,
    eventos,
    captacoesAgendadas: captacoes,
    totalOcupacoes: eventos.length + captacoes.length,
  })
}

/**
 * Cria evento na agenda de um videomaker (secretária virtual)
 */
async function criarEventoAgenda(input: Record<string, unknown>): Promise<string> {
  const videomakerId = (input.videomaker_id as string) || undefined
  const usuarioId = (input.usuario_id as string) || undefined

  if (!videomakerId && !usuarioId) {
    return JSON.stringify({ erro: "Informe videomaker_id (para videomaker) ou usuario_id (para gestor/admin)" })
  }

  const inicio = new Date(input.inicio as string)
  const fim = input.fim
    ? new Date(input.fim as string)
    : new Date(inicio.getTime() + 2 * 3600000)

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
      usuarioId,
      demandaId: (input.demanda_id as string) ?? undefined,
    },
  })

  // Nome do dono do evento
  let nomeResponsavel = "Usuário"
  if (videomakerId) {
    const vm = await prisma.videomaker.findUnique({ where: { id: videomakerId }, select: { nome: true } })
    nomeResponsavel = vm?.nome ?? "Videomaker"
  } else if (usuarioId) {
    const us = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nome: true } })
    nomeResponsavel = us?.nome ?? "Gestor"
  }

  return JSON.stringify({
    criado: true,
    evento_id: evento.id,
    titulo: evento.titulo,
    inicio: evento.inicio.toLocaleString("pt-BR"),
    fim: evento.fim.toLocaleString("pt-BR"),
    responsavel: nomeResponsavel,
    mensagem: `Evento "${evento.titulo}" criado para ${nomeResponsavel} em ${evento.inicio.toLocaleDateString("pt-BR")}`,
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

  let solicitanteId: string | undefined
  if (input.telefone_solicitante) {
    const u = await prisma.usuario.findFirst({
      where: { telefone: { contains: (input.telefone_solicitante as string).slice(-8) } },
    })
    solicitanteId = u?.id
  }
  if (!solicitanteId) {
    const admin = await prisma.usuario.findFirst({ where: { tipo: { in: ["admin", "gestor"] } } })
    solicitanteId = admin?.id
  }
  if (!solicitanteId) return JSON.stringify({ erro: "Nenhum gestor encontrado para vincular" })

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
    },
  })

  return JSON.stringify({
    criado: true,
    demanda_id: demanda.id,
    codigo: demanda.codigo,
    titulo: demanda.titulo,
    status: demanda.statusInterno,
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
