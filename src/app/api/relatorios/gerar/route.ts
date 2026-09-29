import { z } from "zod"
import { criarRelatorioV1, apresentarRelatorio, tiposRelatorio, lerRespostaRelatorio } from "@/lib/relatorio-contrato"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MODELO_POTENTE, MODELO_RAPIDO } from "@/lib/claude"
import { analisarComOrcamento, FalhaAnaliseIA } from "@/lib/ia-analise"
import { LimiteIA } from "@/lib/ia-orcamento"
import { recorteMetricas, RecorteInvalido } from "@/lib/metricas-recorte"
import { metricasRelatorio, snapshotDoRelatorio } from "@/lib/metricas-relatorio"
import { comOrg } from "@/lib/org-contexto"

export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("verRelatorios")
  if (acesso instanceof NextResponse) return acesso
  const body = z.object({ analiseIA: z.boolean().optional().default(false), tipo: tiposRelatorio, periodo: z.enum(["semanal", "mensal", "realtime", "semana", "mes", "3meses", "ano", "custom"]).optional(), area: z.enum(["audiovisual", "design", "growth"]).optional(), de: z.string().optional(), ate: z.string().optional(), mes: z.string().optional() }).strict().safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: "Tipo ou período inválido" }, { status: 400 })
  const { tipo, analiseIA, ...filtros } = body.data
  // Bancos legados misturam finanças: só novos snapshots operacionais podem dispensar verCustos.
  const financeiro = acesso.permissoes.verCustos
  if (!financeiro && ["analise_custos", "otimizacao_contratacao", "performance_videomaker"].includes(tipo)) return NextResponse.json({ error: "Este relatório exige acesso financeiro" }, { status: 403 })
  try {
    const sp = new URLSearchParams(Object.entries(filtros).filter((e): e is [string,string] => typeof e[1] === "string"))
    const periodo = sp.get("periodo") ?? (tipo === "semanal" || tipo === "realtime" ? "semana" : "mes")
    sp.set("periodo", ({ semanal: "semana", mensal: "mes", realtime: "semana" } as Record<string,string>)[periodo] ?? periodo)
    const recorte = recorteMetricas(sp)
    const dados = await comOrg(acesso.organizacaoId, () => metricasRelatorio(acesso.organizacaoId,recorte,financeiro))
    const snapshot = snapshotDoRelatorio(dados)
    const operacional = snapshot.metricas
    let modelo = "regras-v1"
    let texto = "Relatório de indicadores calculados pelo sistema. A análise textual de IA não foi solicitada.", tokens = 0
    if (analiseIA) {
      modelo = tipo === "realtime" ? MODELO_RAPIDO : MODELO_POTENTE
      try {
        const analise = await analisarComOrcamento(`Analise o snapshot autorizado do relatório ${tipo}. Responda em português com uma análise textual concisa, sem HTML. Não invente números, nomes, rankings, publicações ou dados ausentes. Os valores null significam não medido. As fontes manuais são mensais e NÃO podem ser somadas às entregas automáticas: pode haver duplicação. Custos abrangem apenas lançamentos vinculados à área selecionada. Não trate o índice de referência de produção como receita ou lucro. Explique limitações relevantes.\nSNAPSHOT:\n${JSON.stringify(snapshot)}`, "", modelo, { organizacaoId: acesso.organizacaoId, usuarioId: acesso.usuarioId, finalidade: `relatorio.${tipo}` })
        texto = analise.texto
        tokens = analise.tokens
      } catch (e) {
        if (!(e instanceof LimiteIA) && !(e instanceof FalhaAnaliseIA)) throw e
        texto = `${e.message} Os indicadores abaixo foram calculados pelo sistema, sem análise textual de IA.`
        modelo = "regras-v1"
      }
    }
    const documento = criarRelatorioV1(lerRespostaRelatorio(texto), { tipo, periodo: `${recorte.de} a ${recorte.ate}`, area: recorte.area, origem: "manual", geradoEm: operacional.geradoEm, inicio: recorte.inicio, fim: recorte.fim }, snapshot)
    const relatorio = await comOrg(acesso.organizacaoId, () => prisma.relatorioIA.create({ data: { organizacaoId: acesso.organizacaoId, tipo, periodo: documento.metadados.periodo, conteudo: documento, tokens, modelo } }))
    const { conteudo: _conteudo, ...metadados } = relatorio
    return NextResponse.json({ relatorio: { ...metadados, apresentacao: apresentarRelatorio(documento) }, tokens }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (e) {
    if (e instanceof RecorteInvalido) return NextResponse.json({ error: e.message }, { status: 400 })
    console.error("Erro ao gerar relatório")
    return NextResponse.json({ error: "Erro ao gerar relatório" }, { status: 500 })
  }
}
