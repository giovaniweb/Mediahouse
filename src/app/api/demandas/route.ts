import { filtroFilaTrabalho, estadoHistorico } from "@/lib/acervo-regras"
import { numeroPagina } from "@/lib/publicacao-midia"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor, temPapel } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { STATUS_PRAZO_PAUSADO } from "@/lib/status"
import { getOrgId, semOrg } from "@/lib/org"
import { whereResponsavel } from "@/lib/responsaveis"
import { areaTravadaDaPessoa, escopoDeDemandas, filtroMinhasDemandas } from "@/lib/escopo-demanda"
import { veNotaDoVideomaker } from "@/lib/permissoes-server"
import type { Prisma } from "@prisma/client"
import { inicioDoDia, somarDias } from "@/lib/datas"
import { intervaloCalendario, RecorteInvalido } from "@/lib/metricas-recorte"
import { erroDeCampo } from "@/lib/erros-api"
import { escopoComEspelho, espelhoDoCard, SELECT_ESPELHO } from "@/lib/compartilhamento"
import { whereDoQuadro } from "@/lib/quadro-do-card-server"
import { MARCA_DO_CANCELAMENTO, STATUS_DE_ENTREGA } from "@/lib/etapas-da-gravacao"
import { criarDemanda } from "@/lib/criar-demanda"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { searchParams } = req.nextUrl
  const departamento = searchParams.get("departamento")
  const prioridade = searchParams.get("prioridade")
  const statusVisivel = searchParams.get("statusVisivel")
  const statusInterno = searchParams.get("statusInterno")
  const editorId = searchParams.get("editorId")
  const tipoVideo = searchParams.get("tipoVideo")
  const deParam = searchParams.get("de")
  const ateParam = searchParams.get("ate")
  // Paginação (usada pela página /historico)
  const limitParam = searchParams.get("limit")
  const offsetParam = searchParams.get("offset")
  const limit = limitParam ? numeroPagina(limitParam, 50, 200) : undefined
  const offset = offsetParam && /^\d{1,7}$/.test(offsetParam) ? Number(offsetParam) : 0
  const videomakerId = searchParams.get("videomakerId") ?? undefined
  const designerId = searchParams.get("designerId") ?? undefined
  let area = searchParams.get("area") ?? undefined
  const eventoGestaoId = searchParams.get("eventoGestaoId") ?? undefined
  // Growth: filtro por responsável (Usuario interno) e por linha/projeto
  const responsavelId = searchParams.get("responsavelId") ?? undefined
  const linhaProjetoId = searchParams.get("linhaProjetoId") ?? undefined

  // A separação entre as pessoas é por ÁREA, e a área vem da pessoa — não de uma
  // lista de tipos escrita aqui. Quem atua nas duas vê as duas; quem atua em uma
  // fica nela. Dentro da própria área, o quanto se enxerga é decidido por
  // `verTodasDemandas`. É isso que o painel edita: mudar a área de alguém muda o
  // que ele vê, sem tocar em código.
  // A regra mora em lib/escopo-demanda.ts — o assistente (MCP) usa a mesma.
  const travada = await areaTravadaDaPessoa(session.user.id, organizacaoId, ehGestor(session))
  if (travada) area = travada

  // Escopo "minhas demandas": explícito via ?mine=1, ou imposto quando a pessoa
  // NÃO tem `verTodasDemandas` — a regra mora em lib/escopo-demanda.ts, a mesma
  // da ficha, da edição e da exclusão.
  const escopoMinhas = searchParams.get("mine") === "1"
    ? await filtroMinhasDemandas(session.user.id, organizacaoId)
    : await escopoDeDemandas(session.user.id, organizacaoId, ehGestor(session))

  // O quadro mostra o que é da empresa E o que ela executa por espelhamento —
  // um card terceirizado que não aparecesse na tela de quem executa seria um job
  // invisível para quem tem que fazê-lo.
  //
  // Isto NÃO vale para métricas: `/api/dashboard/*` e os relatórios continuam
  // com `{ organizacaoId }` puro, senão a plataforma contaria cada job
  // terceirizado duas vezes. Ver PLANO-ESPELHAMENTO-CROSS-TENANT.md §2.4.
  const where: Record<string, unknown> = {}
  const and: Prisma.DemandaWhereInput[] = [escopoComEspelho(organizacaoId)]
  if (searchParams.get("filaTrabalho") === "1") and.push(filtroFilaTrabalho())
  if (area) where.area = area
  if (departamento) where.departamento = departamento
  if (prioridade) where.prioridade = prioridade
  if (statusVisivel) where.statusVisivel = statusVisivel
  if (statusInterno) where.statusInterno = statusInterno
  if (editorId) where.editorId = editorId
  if (videomakerId) where.videomakerId = videomakerId
  if (designerId) where.designerId = designerId
  if (tipoVideo) where.tipoVideo = tipoVideo
  if (linhaProjetoId) where.linhaProjetoId = linhaProjetoId
  if (eventoGestaoId) where.eventoGestaoId = eventoGestaoId
  // Gestor de eventos só acompanha cards ligados a eventos (não o pipeline todo)
  if (temPapel(session, "gestor_eventos")) where.eventoGestaoId = { not: null }

  // Condições que internamente usam OR entram todas em AND[], para não se
  // sobrescreverem. Antes, filtro de data e busca disputavam o mesmo `where.OR`
  // e a busca por código/descrição era silenciosamente descartada no /historico.
  // O escopo por empresa já entrou ali em cima, pelo mesmo motivo: ele também é
  // um OR, e no topo do `where` seria sobrescrito pelo primeiro filtro que usasse OR.

  if (escopoMinhas) and.push(escopoMinhas)
  if (responsavelId) and.push(whereResponsavel(responsavelId))

  // Filtro por data de finalização (usado pela página /historico).
  //
  // Dia de calendário no fuso de Brasília, fim exclusivo — o mesmo recorte das
  // métricas. Antes, `new Date("AAAA-MM-DD")` era meia-noite UTC e o setHours
  // usava o fuso do servidor: na Vercel (UTC), "até 02/10" cortava às 20h59 de
  // Brasília e "de 26/09" começava às 21h do dia 25.
  if (deParam || ateParam) {
    let faixa
    try { faixa = intervaloCalendario(deParam, ateParam) }
    catch (e) {
      if (e instanceof RecorteInvalido) return erroDeCampo(e.campo ?? "de", e.message)
      throw e
    }
    and.push({ finalizadaEm: faixa })
  }

  // ?prazoDe/?prazoAte — o critério "Prazo" do "Filtrar por…" dos quadros. Na
  // fila o que importa é quando vence, não quando terminou. O prazo é gravado
  // como meia-noite UTC (inicioDoDia), então o dia é UTC, e não o de Brasília
  // que vale para finalizadaEm: com o fuso, "prazo 01/10" não achava nada.
  const prazoDe = searchParams.get("prazoDe")
  const prazoAte = searchParams.get("prazoAte")
  if (prazoDe || prazoAte) {
    try { intervaloCalendario(prazoDe, prazoAte) } // só valida formato e ordem
    catch (e) {
      if (e instanceof RecorteInvalido) return erroDeCampo(e.campo === "ate" ? "prazoAte" : "prazoDe", e.message)
      throw e
    }
    and.push({ dataLimite: {
      ...(prazoDe ? { gte: inicioDoDia(prazoDe) } : {}),
      ...(prazoAte ? { lt: inicioDoDia(somarDias(prazoAte, 1)) } : {}),
    } })
  }

  // ?social=1 — só os pedidos que nasceram no quadro da social media (vídeo ou
  // arte). É o departamento "Social Media" do histórico e do dashboard.
  if (searchParams.get("social") === "1") and.push({ socialId: { not: null } })

  // ?atrasadas=1 — prazo vencido, exceto onde o prazo fica suspenso porque a bola
  // está com o cliente ou com quem posta. Mesma regra de estaAtrasada() no card;
  // o dashboard apontava para ?filtro=atrasadas, que a API não conhecia e devolvia
  // a lista inteira sem filtro nenhum.
  if (searchParams.get("atrasadas") === "1") {
    and.push({
      // `lt: inicioDoDia()` e não `lt: new Date()`: prazo é dia, e quem vence
      // hoje ainda tem o dia inteiro — antes entrava na lista de atrasadas de
      // manhã cedo, no mesmo dia da entrega.
      dataLimite: { lt: inicioDoDia() },
      statusVisivel: { notIn: STATUS_PRAZO_PAUSADO as never[] },
    })
  }

  // ?quadro=jobs | ?quadro=demandas — em que quadro do audiovisual o card mora.
  //
  // A regra é uma só (lib/quadro-do-card.ts) e os dois quadros pedem por ela:
  // videomaker externo escalado é Job, interno fica em Demandas, e sem
  // videomaker a marca de cobertura decide. Antes o quadro de Jobs pedia
  // `tipoVideo=cobertura_evento` e o de Demandas escondia `departamento=eventos`
  // — um card marcado só pelo departamento não aparecia em nenhum dos dois.
  //
  // É OPT-IN de propósito: Aprovações, /historico, a busca de produtos e a
  // contagem por solicitante continuam vendo tudo. `semCobertura=1` (nome antigo)
  // vale como `quadro=demandas`, para a tela que ainda estiver aberta com o
  // código anterior não voltar a mostrar Jobs em Demandas.
  const quadro = searchParams.get("quadro") ?? (searchParams.get("semCobertura") === "1" ? "demandas" : null)
  if (quadro === "jobs" || quadro === "demandas") and.push(whereDoQuadro(quadro, organizacaoId))

  // Nota e pagamento do videomaker no card de Gravações Externas (28/10/2026):
  // só o estado, nunca valor nem dado fiscal, e só para quem vê custos ou
  // aprova pagamentos — as mesmas portas de /api/custos-videomaker.
  const comPagamento = quadro === "jobs" && await veNotaDoVideomaker(session.user.id, organizacaoId, ehGestor(session))

  // ?semResponsavel=1 — ninguém assumiu ainda, nem pela M2M nem pelo escalar.
  if (searchParams.get("semResponsavel") === "1") {
    and.push({ responsavelId: null, responsaveis: { none: {} } })
  }

  // ?criadasPorMim=1 — só o que EU abri. Diferente de ?mine=1, que junta todos os
  // papéis (responsável, videomaker, editor, gestor, solicitante) num filtro só.
  // Quem recebe pedidos precisa acompanhar o que subiu, não o que executa.
  if (searchParams.get("criadasPorMim") === "1") {
    and.push({ solicitanteId: session.user.id })
  }

  const produtoId = searchParams.get("produtoId")
  if (produtoId) where.produtos = { some: { produtoId } }

  const search = searchParams.get("search")
  if (search) {
    and.push({
      OR: [
        { titulo: { contains: search, mode: "insensitive" } },
        { codigo: { contains: search, mode: "insensitive" } },
        { descricao: { contains: search, mode: "insensitive" } },
      ],
    })
  }

  if (and.length > 0) where.AND = and

  // Paginação: quando limit está presente, retorna total também
  const usePagination = !!limit

  const [demandas, total] = await Promise.all([
    prisma.demanda.findMany({
      where,
      include: {
        solicitante: { select: { id: true, nome: true, email: true } },
        videomaker: { select: { id: true, nome: true, cidade: true } },
        editor: { select: { id: true, nome: true } },
        designer: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, nome: true, tipo: true } },
        responsaveis: { select: { usuario: { select: { id: true, nome: true, tipo: true } } } },
        linhaProjetoRef: { select: { id: true, nome: true } },
        produtos: { select: { produto: { select: { nome: true } } } },
        eventoGestao: { select: { id: true, nome: true } },
        // Só os rótulos congelados: as relações da aresta atravessam a fronteira
        // entre empresas, e esta lista é servida para os dois lados.
        compartilhamentos: { where: { revogadoEm: null }, select: SELECT_ESPELHO },
        _count: { select: { comentarios: true, arquivos: true } },
        ...(comPagamento && {
          custos: { where: { organizacaoId }, select: { statusPagamento: true, pago: true } },
          notasFiscais: { select: { status: true } },
        }),
        // Gravação encerrada: só o que separa a cancelada da entregue
        // (foiCancelada em lib/etapas-da-gravacao.ts), não o histórico inteiro.
        ...(quadro === "jobs" && {
          historicos: {
            where: { OR: [{ statusNovo: { in: STATUS_DE_ENTREGA } }, { statusNovo: "encerrado", observacao: { startsWith: MARCA_DO_CANCELAMENTO } }] },
            select: { statusNovo: true, observacao: true },
            take: 5,
          },
        }),
      },
      orderBy: [
        { prioridade: "desc" },
        { createdAt: "desc" },
        { id: "asc" },
      ],
      ...(limit ? { take: limit } : {}),
      ...(offset ? { skip: offset } : {}),
    }),
    usePagination ? prisma.demanda.count({ where }) : Promise.resolve(undefined),
  ])

  // `espelho` já resolvido do lado do servidor: a tela não precisa saber de
  // aresta, só se desenha "🤝 Terceirizado" ou "🤝 Contourline".
  const comEspelho = demandas.map(({ compartilhamentos, ...d }) => ({
    ...d,
    estadoHistorico: estadoHistorico(d.statusVisivel,d.finalizadaEm),
    espelho: espelhoDoCard(compartilhamentos, organizacaoId),
  }))

  return NextResponse.json({ demandas: comEspelho, ...(usePagination ? { total } : {}) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  return criarDemanda(session, organizacaoId, await req.json())
}
