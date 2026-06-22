import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEventoAccess } from "@/lib/eventos-access"
import { calcularPeso } from "@/lib/peso-demanda"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { getPeca } from "@/lib/eventos-pecas"
import { getPecaDesign } from "@/lib/design-pecas"
import { checklistParaTipo } from "@/lib/eventos-checklist"
import { criarPastaDrive } from "@/lib/google-drive"
import { getOrgId, semOrg } from "@/lib/org"
import { after } from "next/server"
import type { Prioridade } from "@prisma/client"

function gerarCodigoEvento(): string {
  const ano = new Date().getFullYear().toString().slice(-2)
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `VOP-EVT-${ano}-${rand}`
}

function gerarSlug(titulo: string): string {
  return (
    titulo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .substring(0, 50) +
    "-" +
    Date.now().toString(36)
  )
}

// GET /api/eventos — lista eventos de gestão
export async function GET(req: NextRequest) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const sp = req.nextUrl.searchParams
  const status = sp.get("status")
  const tipo = sp.get("tipo")
  const search = sp.get("search")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizacaoId,
    ...(status ? { status } : {}),
    ...(tipo ? { tipo } : {}),
    ...(search
      ? {
          OR: [
            { nome: { contains: search, mode: "insensitive" } },
            { codigo: { contains: search, mode: "insensitive" } },
            { cidade: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  }

  const eventos = await prisma.eventoGestao.findMany({
    where,
    select: {
      id: true,
      codigo: true,
      nome: true,
      tipo: true,
      status: true,
      cidade: true,
      estado: true,
      local: true,
      dataInicio: true,
      dataFim: true,
      orcamentoPrevisto: true,
      orcamentoAprovado: true,
      percentualConclusao: true,
      coberturaId: true,
      responsavel: { select: { id: true, nome: true } },
      _count: { select: { demandas: true, checklist: true, documentos: true, custos: true } },
    },
    orderBy: [{ dataInicio: "desc" }],
  })

  return NextResponse.json({ eventos })
}

// POST /api/eventos — cria evento + gera demandas audiovisuais selecionadas (+ cobertura)
export async function POST(req: NextRequest) {
  const session = await requireEventoAccess()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  try {
    const body = await req.json()
    const {
      nome,
      tipo,
      descricao,
      objetivo,
      publicoAlvo,
      observacoes,
      cidade,
      estado,
      local,
      dataInicio,
      dataFim,
      responsavelId,
      orcamentoPrevisto,
      pecas, // string[] de keys de PECAS_AUDIOVISUAIS
      pecasDesign, // string[] de keys de PECAS_DESIGN
    } = body

    if (!nome || !dataInicio) {
      return NextResponse.json({ error: "Nome e data inicial são obrigatórios" }, { status: 400 })
    }

    const inicio = new Date(dataInicio)
    const fim = dataFim ? new Date(dataFim) : inicio

    const evento = await prisma.eventoGestao.create({
      data: {
        organizacaoId,
        codigo: gerarCodigoEvento(),
        nome: nome.trim(),
        tipo: tipo ?? "outro",
        status: "planejamento",
        descricao: descricao ?? null,
        objetivo: objetivo ?? null,
        publicoAlvo: publicoAlvo ?? null,
        observacoes: observacoes ?? null,
        cidade: cidade ?? null,
        estado: estado ?? null,
        local: local ?? null,
        dataInicio: inicio,
        dataFim: fim,
        responsavelId: responsavelId || null,
        orcamentoPrevisto: orcamentoPrevisto ? parseFloat(orcamentoPrevisto) : null,
        createdById: session.user.id,
      },
    })

    // Checklist automático conforme o tipo do evento
    try {
      const tarefas = checklistParaTipo(tipo ?? "outro")
      if (tarefas.length > 0) {
        await prisma.eventoGestaoChecklist.createMany({
          data: tarefas.map((t) => ({ eventoId: evento.id, titulo: t.titulo, categoria: t.categoria })),
        })
      }
    } catch (e) {
      console.error("[Eventos] Erro ao criar checklist automático:", e)
    }

    // Gerar demandas audiovisuais para cada peça selecionada
    const pecasKeys: string[] = Array.isArray(pecas) ? pecas : []
    const demandasCriadas: string[] = []
    let coberturaId: string | null = null

    for (const key of pecasKeys) {
      const peca = getPeca(key)
      if (!peca) continue

      // Se a peça é cobertura, cria um EventoCobertura e vincula
      if (peca.criaCobertura && !coberturaId) {
        try {
          const cobertura = await prisma.eventoCobertura.create({
            data: {
              organizacaoId,
              titulo: nome.trim(),
              slug: gerarSlug(nome),
              tipo: "outro",
              status: "planejamento",
              descricao: descricao ?? null,
              local: local ?? null,
              cidade: cidade ?? null,
              dataInicio: inicio,
              dataFim: fim,
              totalDias: 1,
              createdById: session.user.id,
            },
          })
          coberturaId = cobertura.id
        } catch (e) {
          console.error("[Eventos] Erro ao criar cobertura:", e)
        }
      }

      try {
        const peso = calcularPeso(peca.tipoVideo, "normal" as Prioridade)
        const dem = await prisma.demanda.create({
          data: {
            organizacaoId,
            codigo: gerarCodigoEvento().replace("EVT", "DEM"),
            titulo: `${nome.trim()} — ${peca.label}`,
            descricao: peca.descricao,
            departamento: "eventos",
            area: "audiovisual",
            tipoVideo: peca.tipoVideo,
            cidade: cidade ?? "—",
            prioridade: "normal",
            statusInterno: "aguardando_aprovacao_interna",
            statusVisivel: STATUS_PARA_COLUNA["aguardando_aprovacao_interna"],
            pesoDemanda: peso,
            solicitanteId: session.user.id,
            dataEvento: inicio,
            localEvento: local ?? null,
            eventoGestaoId: evento.id,
            ...(peca.criaCobertura && coberturaId ? { coberturaId } : {}),
          },
        })
        demandasCriadas.push(dem.id)
      } catch (e) {
        console.error(`[Eventos] Erro ao criar demanda da peça ${key}:`, e)
      }
    }

    // Gerar demandas de DESIGN (area=design) para cada peça de design selecionada
    const pecasDesignKeys: string[] = Array.isArray(pecasDesign) ? pecasDesign : []
    for (const key of pecasDesignKeys) {
      const peca = getPecaDesign(key)
      if (!peca) continue
      try {
        const dem = await prisma.demanda.create({
          data: {
            organizacaoId,
            codigo: gerarCodigoEvento().replace("EVT", "ART"),
            titulo: `${nome.trim()} — ${peca.label}`,
            descricao: peca.descricao,
            departamento: "eventos",
            area: "design",
            tipoVideo: peca.key,
            cidade: cidade ?? "—",
            prioridade: "normal",
            statusInterno: "aguardando_aprovacao_interna",
            statusVisivel: STATUS_PARA_COLUNA["aguardando_aprovacao_interna"],
            pesoDemanda: 1,
            solicitanteId: session.user.id,
            dataEvento: inicio,
            localEvento: local ?? null,
            eventoGestaoId: evento.id,
          },
        })
        demandasCriadas.push(dem.id)
      } catch (e) {
        console.error(`[Eventos] Erro ao criar demanda de design ${key}:`, e)
      }
    }

    // Vincular cobertura ao evento mestre
    if (coberturaId) {
      await prisma.eventoGestao.update({
        where: { id: evento.id },
        data: { coberturaId },
      })
    }

    await prisma.eventoGestaoLog.create({
      data: {
        eventoId: evento.id,
        usuarioId: session.user.id,
        acao: "criado",
        detalhe: `Evento criado com ${demandasCriadas.length} demanda(s) audiovisual(is)${coberturaId ? " + cobertura" : ""}`,
      },
    }).catch(() => null)

    // Pasta no Drive (best-effort, em background; não bloqueia a resposta)
    const orgIdDrive = organizacaoId
    after(async () => {
      try {
        const { folderUrl } = await criarPastaDrive(`${evento.codigo} — ${evento.nome}`, orgIdDrive)
        await prisma.eventoGestao.update({ where: { id: evento.id }, data: { linkDrive: folderUrl } })
      } catch (e) {
        console.error("[Eventos] Drive não configurado ou falha ao criar pasta:", e instanceof Error ? e.message : e)
      }
    })

    return NextResponse.json({ evento, demandasCriadas: demandasCriadas.length, coberturaId, ok: true }, { status: 201 })
  } catch (e) {
    console.error("[Eventos] Erro ao criar evento:", e)
    return NextResponse.json({ error: "Erro ao criar evento" }, { status: 500 })
  }
}
