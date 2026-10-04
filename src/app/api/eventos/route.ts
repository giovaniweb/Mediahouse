import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"
import { calcularPeso } from "@/lib/peso-demanda"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { getPeca } from "@/lib/eventos-pecas"
import { getPecaDesign } from "@/lib/design-pecas"
import { checklistParaTipo } from "@/lib/eventos-checklist"
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
  const acesso = await requireAcesso("verEventos")
  if (acesso instanceof NextResponse) return acesso
  const organizacaoId = acesso.organizacaoId

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

  const eventos = await comOrg(organizacaoId, () => prisma.eventoGestao.findMany({
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
      orcamentoPrevisto: acesso.permissoes.verFinanceiroEvento,
      orcamentoAprovado: acesso.permissoes.verFinanceiroEvento,
      percentualConclusao: true,
      coberturaId: true,
      responsavel: { select: { id: true, nome: true } },
      _count: { select: { demandas: { where: { organizacaoId } }, checklist: true, documentos: { where: acesso.permissoes.verFinanceiroEvento ? {} : { categoria: { not: "contratos" } } }, custos: acesso.permissoes.verFinanceiroEvento } },
    },
    orderBy: [{ dataInicio: "desc" }],
  }))

  return NextResponse.json({ eventos }, { headers: { "Cache-Control": "private, no-store" } })
}

// POST /api/eventos — cria evento + gera demandas audiovisuais selecionadas (+ cobertura)
export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("verEventos")
  if (acesso instanceof NextResponse) return acesso
  const organizacaoId = acesso.organizacaoId

  return comOrg(organizacaoId, async () => {
  try {
    const body = await req.json()
    if (!acesso.permissoes.verFinanceiroEvento && body.orcamentoPrevisto != null && body.orcamentoPrevisto !== "") return NextResponse.json({ error: "Sem permissão financeira" }, { status: 403 })
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

    if (orcamentoPrevisto != null && orcamentoPrevisto !== "" && (typeof orcamentoPrevisto !== "number" && typeof orcamentoPrevisto !== "string" || !Number.isFinite(Number(orcamentoPrevisto)) || Number(orcamentoPrevisto) < 0)) return NextResponse.json({ error: "Orçamento inválido" }, { status: 400 })
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
        orcamentoPrevisto: orcamentoPrevisto == null || orcamentoPrevisto === "" ? null : Number(orcamentoPrevisto),
        createdById: acesso.usuarioId,
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
              createdById: acesso.usuarioId,
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
            solicitanteId: acesso.usuarioId,
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
            solicitanteId: acesso.usuarioId,
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
        usuarioId: acesso.usuarioId,
        acao: "criado",
        detalhe: `Evento criado com ${demandasCriadas.length} demanda(s) audiovisual(is)${coberturaId ? " + cobertura" : ""}`,
      },
    }).catch(() => null)

    return NextResponse.json({ evento: { id: evento.id }, demandasCriadas: demandasCriadas.length, coberturaId, ok: true }, { status: 201 })
  } catch (e) {
    console.error("[Eventos] Erro ao criar evento:", e)
    return NextResponse.json({ error: "Erro ao criar evento" }, { status: 500 })
  }
  })
}
