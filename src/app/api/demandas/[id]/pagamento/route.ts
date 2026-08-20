import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmailFinanceiro, sendEmailVideomakerNFRecebida } from "@/lib/email"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { requireDemandaOrg } from "@/lib/org"
import { emSegundoPlano } from "@/lib/notificar"
import { resolverAlertas } from "@/lib/alertas"
import { gravarDadosPrivadosVideomaker } from "@/lib/videomaker-dados"
import { diariaDaEmpresa, fiscaisDaEmpresa } from "@/lib/videomaker-vinculo"

// Validação de chave PIX
function validarChavePix(chave: string): boolean {
  const cpf = /^\d{11}$/
  const cnpj = /^\d{14}$/
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const telefone = /^\+55\d{10,11}$/
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return cpf.test(chave) || cnpj.test(chave) || email.test(chave) || telefone.test(chave) || uuid.test(chave)
}

// GET /api/demandas/[id]/pagamento — status do pagamento da demanda
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard

  const { organizacaoId } = guard

  const custo = await prisma.custoVideomaker.findFirst({
    where: { demandaId: id },
    orderBy: { createdAt: "desc" },
    include: { videomaker: { select: { id: true, nome: true, email: true } } },
  })

  const demanda = await prisma.demanda.findUnique({
    where: { id },
    select: { id: true, codigo: true, titulo: true, statusInterno: true, videomakerId: true },
  })

  // PIX e diária vêm das tabelas por empresa, não do perfil global da rede. A
  // forma da resposta é mantida (`custo.videomaker.chavePix`) para as telas que
  // já a consomem não precisarem mudar junto.
  const fiscais = custo ? await fiscaisDaEmpresa(custo.videomakerId, organizacaoId) : null
  const diaria = custo ? await diariaDaEmpresa(custo.videomakerId, organizacaoId) : null

  return NextResponse.json({
    custo: custo && {
      ...custo,
      videomaker: { ...custo.videomaker, chavePix: fiscais?.chavePix ?? null, valorDiaria: diaria },
    },
    demanda,
  })
}

// POST /api/demandas/[id]/pagamento
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const { organizacaoId } = guard
  const body = await req.json()
  const { acao, notaFiscalUrl, chavePix } = body

  const demanda = await prisma.demanda.findUnique({
    where: { id },
    select: {
      id: true, codigo: true, titulo: true, statusInterno: true, videomakerId: true,
      // Antes era `videomaker: true` — a linha global inteira, com diária e PIX
      // de outra empresa junto. Só o que é da rede e o que esta rota usa.
      videomaker: { select: { id: true, nome: true, telefone: true, email: true } },
    },
  })
  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  // ── Videomaker envia NF ────────────────────────────────────────────────────
  if (acao === "enviar_nf") {
    if (!notaFiscalUrl || !chavePix) {
      return NextResponse.json({ error: "notaFiscalUrl e chavePix são obrigatórios" }, { status: 400 })
    }
    if (!validarChavePix(chavePix)) {
      return NextResponse.json({ error: "Chave PIX inválida. Use CPF, CNPJ, e-mail, telefone (+55) ou chave aleatória." }, { status: 400 })
    }

    // Atualiza ou cria CustoVideomaker
    let custo = await prisma.custoVideomaker.findFirst({
      where: { demandaId: id },
      orderBy: { createdAt: "desc" },
    })

    if (custo) {
      custo = await prisma.custoVideomaker.update({
        where: { id: custo.id },
        data: { notaFiscalUrl, statusPagamento: "nf_enviada" },
      })
    } else {
      // Diária vem do vínculo desta empresa — mesma regra do custo criado ao
      // finalizar a demanda. Sem valor combinado, entra zerado mas avisando.
      const diaria = await diariaDaEmpresa(demanda.videomakerId!, organizacaoId)
      if (diaria === null) {
        console.warn(
          `[Pagamento] ${demanda.codigo}: sem diária no vínculo do VM ${demanda.videomakerId} ` +
            `com a org ${organizacaoId} — custo criado zerado, precisa de valor manual.`
        )
      }
      custo = await prisma.custoVideomaker.create({
        data: {
          organizacaoId,
          videomakerId: demanda.videomakerId!,
          demandaId: id,
          tipo: "diaria",
          valor: diaria ?? 0,
          dataReferencia: new Date(),
          notaFiscalUrl,
          statusPagamento: "nf_enviada",
        },
      })
    }

    // Chave PIX é dado fiscal de UMA empresa, não do perfil global da rede: vai
    // para VideomakerDadosFiscais, cifrada. Antes gravava em texto puro no perfil
    // global — legível por qualquer empresa e sem cifra nenhuma.
    if (demanda.videomakerId && chavePix) {
      await gravarDadosPrivadosVideomaker({
        videomakerId: demanda.videomakerId,
        organizacaoId,
        fiscal: { chavePix },
      })
    }

    // Criar alerta de aprovação de pagamento
    await prisma.alertaIA.create({
      data: {
        organizacaoId,
        demandaId: id,
        tipoAlerta: "pagamento_pendente",
        mensagem: `Nota fiscal recebida de ${demanda.videomaker?.nome ?? "videomaker"} para a demanda ${demanda.codigo}. Aguardando aprovação do pagamento.`,
        severidade: "aviso",
        acaoSugerida: "Aprovar pagamento em Aprovações → Pagamentos",
      },
    })

    // WhatsApp para o videomaker agradecendo
    if (demanda.videomaker?.telefone) {
      await sendWhatsappMessage(
        demanda.videomaker.telefone,
        `🎬 *NuFlow*\n\nOlá, *${demanda.videomaker.nome}*! Recebemos sua nota fiscal com sucesso. ✅\n\nNosso time irá analisá-la e o pagamento será efetuado em até *15 dias úteis* via PIX.\n\nObrigado pelo ótimo trabalho! 🙏`,
        id, organizacaoId
      ).catch(() => {})
    }

    // E-mail para o videomaker (se tiver e-mail)
    if (demanda.videomaker?.email) {
      await sendEmailVideomakerNFRecebida(demanda.videomaker.email, demanda.videomaker.nome, 15, organizacaoId).catch(() => {})
    }

    return NextResponse.json({ ok: true, custo, mensagem: "Nota fiscal recebida! Você receberá o pagamento em até 15 dias úteis." })
  }

  // ── Admin/Gestor aprova pagamento ──────────────────────────────────────────
  if (acao === "aprovar_pagamento") {
    const papel = (session.user as { tipo?: string }).tipo
    if (!["admin", "gestor"].includes(papel ?? "")) {
      return NextResponse.json({ error: "Apenas admin ou gestor pode aprovar pagamentos" }, { status: 403 })
    }

    const custo = await prisma.custoVideomaker.findFirst({
      where: { demandaId: id, statusPagamento: "nf_enviada" },
      include: {
        videomaker: { select: { id: true, nome: true } },
        demanda: { select: { codigo: true, titulo: true } },
      },
    })
    if (!custo) return NextResponse.json({ error: "Nenhum custo com NF pendente encontrado" }, { status: 404 })

    // CPF e PIX dos fiscais desta empresa, decifrados — mesma regra da rota
    // custos-videomaker/[id]/aprovar, que faz exatamente este fluxo.
    const fiscais = await fiscaisDaEmpresa(custo.videomakerId, organizacaoId)
    if (!fiscais?.chavePix) {
      return NextResponse.json(
        { error: `Sem chave PIX cadastrada para ${custo.videomaker.nome} nesta empresa. Cadastre antes de aprovar.` },
        { status: 422 }
      )
    }

    await prisma.custoVideomaker.update({
      where: { id: custo.id },
      data: { statusPagamento: "aguardando_pagamento", emailFinanceiroAt: new Date() },
    })

    // Enviar e-mail ao financeiro
    const emailResult = await sendEmailFinanceiro({
      nomeVideomaker: custo.videomaker.nome,
      cpfCnpj: fiscais.cpfCnpj ?? undefined,
      valorDiaria: custo.valor,
      chavePix: fiscais.chavePix,
      notaFiscalUrl: custo.notaFiscalUrl,
      codigoDemanda: custo.demanda?.codigo ?? demanda.codigo,
      tituloDemanda: custo.demanda?.titulo ?? demanda.titulo,
      custoId: custo.id,
    }, organizacaoId)


    // Alguém decidiu — o alerta de "aguardando aprovação do pagamento" morre
    // aqui, aprovado ou contestado.
    emSegundoPlano(() => resolverAlertas(organizacaoId, id), "resolver-alertas")

    return NextResponse.json({
      ok: true,
      emailEnviado: emailResult.ok,
      emailErro: emailResult.error,
      mensagem: emailResult.ok
        ? "Pagamento aprovado! E-mail enviado ao financeiro."
        : `Pagamento aprovado, mas houve erro no e-mail: ${emailResult.error}`,
    })
  }

  // ── Contestar pagamento ────────────────────────────────────────────────────
  if (acao === "contestar") {
    const custo = await prisma.custoVideomaker.findFirst({
      where: { demandaId: id },
      orderBy: { createdAt: "desc" },
    })
    if (!custo) return NextResponse.json({ error: "Custo não encontrado" }, { status: 404 })

    await prisma.custoVideomaker.update({
      where: { id: custo.id },
      data: { statusPagamento: "contestado" },
    })

    // Alguém decidiu — o alerta de "aguardando aprovação do pagamento" morre
    // aqui, aprovado ou contestado.
    emSegundoPlano(() => resolverAlertas(organizacaoId, id), "resolver-alertas")

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
