import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { autenticarCutflow, editorCutflow, FORA_DA_FILA } from "@/lib/cutflow"

// GET /api/cutflow/fila — os cards atribuídos ao editor "Cutflow" desta empresa
// que ainda não saíram da edição, com quem já puxou cada um.
export async function GET(req: NextRequest) {
  const ctx = await autenticarCutflow(req)
  if (ctx instanceof NextResponse) return ctx
  const { organizacaoId } = ctx

  const editor = await editorCutflow(organizacaoId)
  if ("erro" in editor) return NextResponse.json({ fila: [], aviso: editor.erro })

  const demandas = await prisma.demanda.findMany({
    where: { organizacaoId, editorId: editor.id, statusInterno: { notIn: [...FORA_DA_FILA] } },
    orderBy: [{ dataLimite: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true, codigo: true, titulo: true, descricao: true, mensagemPrincipal: true, formato: true,
      tipoVideo: true, departamento: true, linhaProjeto: true, clienteFinalNome: true, prioridade: true,
      dataLimite: true, statusInterno: true, linkFolderBrutos: true, linkBrutos: true,
    },
  })
  const puxadas = demandas.length
    ? await prisma.cutflowPuxada.findMany({
        where: { organizacaoId, demandaId: { in: demandas.map((d) => d.id) } },
        select: { demandaId: true, usuarioId: true, sessaoId: true, puxadaEm: true },
      })
    : []
  const nomes = new Map(
    (puxadas.length
      ? await prisma.usuario.findMany({ where: { id: { in: [...new Set(puxadas.map((p) => p.usuarioId))] } }, select: { id: true, nome: true } })
      : []
    ).map((u) => [u.id, u.nome])
  )
  const porDemanda = new Map(puxadas.map((p) => [p.demandaId, p]))

  return NextResponse.json({
    fila: demandas.map(({ linkFolderBrutos, linkBrutos, ...d }) => {
      const p = porDemanda.get(d.id)
      return {
        ...d,
        brutos: linkFolderBrutos ?? linkBrutos ?? null,
        puxada: p
          ? { por: nomes.get(p.usuarioId) ?? "outra pessoa", em: p.puxadaEm, esteComputador: p.sessaoId === ctx.sessaoId }
          : null,
      }
    }),
  })
}
