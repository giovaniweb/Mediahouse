import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { vinculosDaEmpresa } from "@/lib/editor-vinculo"
import { calcularCargaTotal, avaliarSobrecarga } from "@/lib/peso-demanda"
import { getOrgId, semOrg } from "@/lib/org"
import { inicioDoDia } from "@/lib/datas"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const hoje = new Date()
  const inicioDia = new Date(hoje.setHours(0, 0, 0, 0))
  const fimDia = new Date(hoje.setHours(23, 59, 59, 999))
  const inicioSemana = new Date()
  inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay())
  const fimSemana = new Date(inicioSemana)
  fimSemana.setDate(fimSemana.getDate() + 6)
  const em7Dias = new Date()
  em7Dias.setDate(em7Dias.getDate() + 7)

  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)

  const [
    novasHoje,
    urgentesAtivas,
    emEdicao,
    aguardandoAprovacao,
    paraPostar,
    atrasadas,
    captacoesSemana,
    expiracoesSemana,
    alertasAtivos,
    editores,
    demandasMesRaw,
  ] = await Promise.all([
    prisma.demanda.count({
      where: { area: "audiovisual", organizacaoId, createdAt: { gte: inicioDia, lte: fimDia } },
    }),
    prisma.demanda.count({
      where: {
        area: "audiovisual", organizacaoId,
        prioridade: "urgente",
        statusVisivel: { notIn: ["finalizado"] },
      },
    }),
    prisma.demanda.count({ where: { area: "audiovisual", organizacaoId, statusVisivel: "edicao" } }),
    prisma.demanda.count({ where: { area: "audiovisual", organizacaoId, statusVisivel: "aprovacao" } }),
    prisma.demanda.count({ where: { area: "audiovisual", organizacaoId, statusVisivel: "para_postar" } }),
    prisma.demanda.count({
      where: {
        area: "audiovisual", organizacaoId,
        dataLimite: { lt: inicioDoDia() },
        statusVisivel: { notIn: ["finalizado", "aprovacao", "para_postar"] },
      },
    }),
    prisma.demanda.count({
      where: {
        area: "audiovisual", organizacaoId,
        dataCaptacao: { gte: inicioSemana, lte: fimSemana },
      },
    }),
    prisma.demanda.count({
      where: {
        area: "audiovisual", organizacaoId,
        dataExpiracao: { gte: new Date(), lte: em7Dias },
        statusVisivel: "finalizado",
      },
    }),
    prisma.alertaIA.findMany({
      where: { status: "ativo", organizacaoId },
      include: { demanda: { select: { id: true, titulo: true, codigo: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.editor.findMany({
      // Ativo NESTA empresa: o status mora no vínculo desde a Fase B, então
      // quem está inativo aqui some da métrica mesmo estando ativo em outra.
      where: { vinculos: { some: { organizacaoId, status: "ativo" } } },
      include: {
        demandas: {
          where: { statusVisivel: { notIn: ["finalizado"] } },
          select: { pesoDemanda: true },
        },
      },
    }),
    prisma.demanda.findMany({
      where: {
        area: "audiovisual", organizacaoId,
        statusVisivel: "finalizado",
        OR: [
          { finalizadaEm: { gte: inicioMes } },
          { finalizadaEm: null, updatedAt: { gte: inicioMes } },
        ],
      },
      select: { id: true, linkFinal: true },
    }),
  ])

  // Contar vídeos individuais entregues no mês (Arquivo final + legacy linkFinal)
  const idsMes = demandasMesRaw.map(d => d.id)
  const arquivosMes = idsMes.length > 0
    ? await prisma.arquivo.groupBy({
        by: ["demandaId"],
        where: { demandaId: { in: idsMes }, tipoArquivo: "final" },
        _count: { id: true },
      })
    : []
  const arquivosMapMes = new Map(arquivosMes.map(a => [a.demandaId, a._count.id]))
  const concluidasMes = demandasMesRaw.reduce(
    (acc, d) => acc + (arquivosMapMes.get(d.id) ?? (d.linkFinal ? 1 : 0)),
    0
  )

  // Carga do vínculo desta empresa. O `tsc` foi quem achou este uso: a consulta
  // não tinha `select`, então trazia todas as colunas do perfil e o auditor não
  // tinha nome nenhum para marcar. Auditor estático não enxerga select implícito.
  const cargasEd = await vinculosDaEmpresa(editores.map((e) => e.id), organizacaoId)
  const cargaEditores = editores.map((editor) => {
    const limite = cargasEd.get(editor.id)?.cargaLimite ?? 5
    return {
      id: editor.id,
      nome: editor.nome,
      cargaAtual: editor.demandas.length,
      cargaLimite: limite,
      status: avaliarSobrecarga(calcularCargaTotal(editor.demandas), limite),
    }
  })

  return NextResponse.json({
    metricas: {
      demandasAtivas: emEdicao + aguardandoAprovacao + paraPostar + novasHoje,
      urgentesHoje: urgentesAtivas,
      concluidasMes, // vídeos individuais entregues neste mês
      prazoCritico: atrasadas,
      emEdicao,
      aguardandoAprovacao,
      paraPostar,
      editoresAtivos: editores.length,
    },
    alertasAtivos,
    cargaEditores,
  })
}
