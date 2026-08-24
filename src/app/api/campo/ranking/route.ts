import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId } from "@/lib/org"
import { videomakerDoUsuario, organizacoesDoVideomaker } from "@/lib/campo-escopo"

// GET /api/campo/ranking — uploads dos últimos 7 dias.
//
// A consulta não tinha escopo: o ranking somava uploads de TODAS as empresas e
// devolvia os nomes de quem trabalha para cada uma. Com uma empresa só era um
// placar do time; com duas, é a lista de profissionais de um cliente aparecendo
// para o outro.
//
// Agora o placar é das empresas que a pessoa atende — que também é o único
// recorte em que comparar faz sentido.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const vmSessao = await videomakerDoUsuario(session.user.id)
  let orgs: string[]
    // Quem tem perfil de videomaker vê O PRÓPRIO trabalho aqui, mesmo sendo admin
  // ou gestor. `/campo` é o app de quem está executando; a visão macro da
  // empresa é o dashboard. Antes, `!isAdmin` excluía justamente quem acumula os
  // dois papéis — e essa pessoa nunca via as demandas dela.
if (vmSessao) {
    orgs = await organizacoesDoVideomaker(vmSessao.id)
  } else {
    const ativa = await getOrgId(session)
    orgs = ativa ? [ativa] : []
  }
  if (orgs.length === 0) return NextResponse.json({ ranking: [], minhaPosicao: null, meuTotal: 0 })

  // Contar uploads por videomakerId nos últimos 7 dias
  const uploads = await prisma.eventoCoberturaUpload.findMany({
    where: {
      createdAt: { gte: seteDiasAtras },
      membro: { videomakerId: { not: null } },
      cobertura: { organizacaoId: { in: orgs } },
    },
    select: {
      membro: {
        select: {
          videomakerId: true,
          nome: true,
          videomaker: {
            select: { nome: true, usuarioId: true },
          },
        },
      },
    },
  })

  // Agrupar por videomakerId
  const contagem = new Map<string, { nome: string; total: number; usuarioId: string | null }>()

  for (const up of uploads) {
    if (!up.membro?.videomakerId) continue
    const vmId = up.membro.videomakerId
    const nome = up.membro.videomaker?.nome ?? up.membro.nome
    const usuarioId = up.membro.videomaker?.usuarioId ?? null

    const atual = contagem.get(vmId) ?? { nome, total: 0, usuarioId }
    atual.total += 1
    contagem.set(vmId, atual)
  }

  // Ordenar por total desc
  const ranking = Array.from(contagem.entries())
    .map(([vmId, data], idx) => ({
      posicao: idx + 1,
      videomakerId: vmId,
      nome: data.nome,
      total: data.total,
      isMeu: data.usuarioId === session.user.id,
    }))
    .sort((a, b) => b.total - a.total)
    .map((r, idx) => ({ ...r, posicao: idx + 1 }))
    .slice(0, 10)

  // Encontrar posição do usuário logado (mesmo se não está no top 10)
  const vm = vmSessao

  let minhaPosicao: number | null = null
  let meuTotal = 0

  if (vm) {
    const todas = Array.from(contagem.entries())
      .map(([vmId, data]) => ({ vmId, total: data.total }))
      .sort((a, b) => b.total - a.total)

    const meuIdx = todas.findIndex((r) => r.vmId === vm.id)
    if (meuIdx >= 0) {
      minhaPosicao = meuIdx + 1
      meuTotal = todas[meuIdx].total
    }
  }

  return NextResponse.json({ ranking, minhaPosicao, meuTotal })
}
