import { recorteMetricas } from "@/lib/metricas-recorte"
import { metricasOperacionais } from "@/lib/metricas-operacionais"
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

  const [
    urgentesAtivas,
    emEdicao,
    aguardandoAprovacao,
    paraPostar,
    atrasadas,
    alertasAtivos,
    editores,
    operacional,
  ] = await Promise.all([
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
        statusVisivel: { not: "finalizado" },
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
          where: { organizacaoId, area: "audiovisual", statusVisivel: { notIn: ["finalizado"] } },
          select: { pesoDemanda: true },
        },
      },
    }),
    metricasOperacionais(organizacaoId, recorteMetricas(new URLSearchParams({ periodo: "mes", area: "audiovisual" }))),
  ])
  const concluidasMes = operacional.entregaveis

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
    operacional,
    metricas: {
      demandasAtivas: operacional.ativas,
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
