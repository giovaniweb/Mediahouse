// POST /api/jobs/[id]/entrega — quem a empresa parceira escolheu para a
// gravação (o X da GH) entrega o material por link: os brutos e, quando a
// edição é do videomaker, o vídeo pronto (12/11/2026).
//
// É a mesma entrega do link do convite (lib/entrega-da-gravacao.ts,
// `entregarNoCard`), feita em nome do videomaker que a dona escalou (o Gabriel):
// para a dona, o material chega "do Gabriel, pela GH Produção", e a nota nasce
// para ele. Quem entregou de verdade fica na auditoria da parceira.
//
// Só no card espelhado AUTOMÁTICO, enquanto ele segue com o videomaker que o
// trouxe, e só para o executor escolhido ou a gestão da parceira. A dona usa
// os caminhos dela; aqui recebe 404.
import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaAcesso } from "@/lib/compartilhamento"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { ehGestaoDaEmpresa } from "@/lib/parceria"
import { ConviteInvalido } from "@/lib/convites"
import { comOrg } from "@/lib/org-contexto"
import { entregarNoCard } from "@/lib/entrega-da-gravacao"
import { etapaDaGravacao } from "@/lib/etapas-da-gravacao"
import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { executorDaPessoa } from "@/lib/executor-espelho"
import { emSegundoPlano } from "@/lib/notificar"
import { avisarEntregaDoVideomaker } from "@/lib/avisos-entrega-videomaker"
import { avisarGravacao } from "@/lib/avisos-gravacao"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params

  const acesso = await requireDemandaAcesso(session, id, "executar")
  if (acesso instanceof NextResponse) return acesso
  if (acesso.papel !== "espelho" || !acesso.porVideomakerId) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const [vinculo, executor] = await Promise.all([
    permissoesEfetivas(session.user.id, acesso.organizacaoId),
    executorDaPessoa(session.user.id, acesso.organizacaoId, id),
  ])
  // Quem da parceira não foi escolhido nem é gestão: para ele o card não existe
  // (404, como em Minhas Gravações), não "não é seu".
  if (!executor && !ehGestaoDaEmpresa(vinculo?.papel)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  let e: { linkBrutos?: string; linkVideo?: string }
  try {
    e = z.object({
      linkBrutos: z.string().trim().min(1).max(2000).optional(),
      linkVideo: z.string().trim().min(1).max(2000).optional(),
    }).strict().parse(await req.json())
  } catch (erro) {
    if (erro instanceof ZodError || erro instanceof SyntaxError) return NextResponse.json({ error: "Envio inválido" }, { status: 400 })
    throw erro
  }
  if (!e.linkBrutos && !e.linkVideo) return NextResponse.json({ error: "Mande o link dos brutos ou do vídeo." }, { status: 400 })

  const donaId = acesso.donaId
  const card = await prisma.demanda.findUnique({
    where: { id },
    select: { videomakerId: true, statusInterno: true, statusVisivel: true, tipoGravacao: true, videomaker: { select: { usuarioId: true } } },
  })
  // O card precisa seguir com o videomaker que o trouxe, e já confirmado.
  if (!card || card.videomakerId !== acesso.porVideomakerId) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  if (etapaDaGravacao(card) === "a_agendar") {
    return NextResponse.json({ error: "A gravação ainda não foi confirmada por quem foi escalado." }, { status: 403 })
  }

  try {
    const nome = acesso.nomeProprio ?? "empresa parceira"
    const r = await comOrg(donaId, () => prisma.$transaction((tx) => entregarNoCard(tx, {
      organizacaoId: donaId, demandaId: id, videomakerId: card.videomakerId!, ...e,
      usuarioId: card.videomaker?.usuarioId ?? null,
      observacao: { etapa: `Material entregue pelo videomaker, pela ${nome}.`, atualizacao: `Videomaker atualizou o material, pela ${nome}.` },
    })))
    await registrarAuditoria(prisma, { organizacaoId: acesso.organizacaoId, usuarioId: session.user.id }, {
      acao: "espelho.entrega", recurso: "demanda", recursoId: id, correlationId: correlacaoAuditoria(),
    })
    // Os avisos são os da dona, como na entrega pelo convite.
    emSegundoPlano(() => r.chegouAgora
      ? avisarGravacao(donaId, r.demandaId, "material")
      : avisarGravacao(donaId, r.demandaId, "material_parcial", null, `material:${r.parte}`), "aviso-gravacao")
    emSegundoPlano(() => avisarEntregaDoVideomaker(donaId, r.demandaId, { completo: r.chegouAgora }), "aviso-entrega-videomaker")
    return NextResponse.json({ completo: r.completo, mudouEtapa: r.mudouEtapa })
  } catch (erro) {
    if (erro instanceof ConviteInvalido) return NextResponse.json({ error: erro.message }, { status: erro.status })
    throw erro
  }
}
