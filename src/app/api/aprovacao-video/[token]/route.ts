import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { comToken } from "@/lib/midia"
import { paraDownload } from "@/lib/midia-download"
import { quemRecebeTudo } from "@/lib/notificados"
import { getOrgId } from "@/lib/org"
import { emSegundoPlano } from "@/lib/notificar"
import { resolverAlertas } from "@/lib/alertas"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { orgPorCredencial } from "@/lib/org-por-credencial"
import { declararOrg } from "@/lib/org-contexto"

// Sob RLS, ler a aprovação pelo token já exige a empresa declarada — sem ela o
// banco devolve vazio e o cliente lê "link não encontrado". O token diz de qual
// empresa ele é, e cada handler declara antes da primeira consulta.
//
// A declaração fica no corpo do handler, não numa função auxiliar: `declararOrg`
// usa `enterWith`, que vale para o contexto assíncrono corrente — chamada depois
// de um `await` dentro de um helper, ela vale só para o resto do helper e o
// handler segue sem empresa. O ensaio pegou exatamente isso.
//
// Token sem empresa não interrompe de propósito: segue para a busca, que sob
// RLS volta vazia (o mesmo 404 de token inválido) e sem RLS segue como sempre.
// É o que deixa o deploy indiferente à ordem da migration 20261004000000, que é
// quem ensina o tipo `aprovacao_video` à função.
const empresaDoToken = (token: string) => orgPorCredencial("aprovacao_video", token)

// A validade do token protege o link que vai ao CLIENTE por WhatsApp — não a
// equipe. Como o botão "Abrir aprovação" do sistema reusa esse mesmo token, a
// expiração trancava a própria equipe para fora da aprovação depois de 30 dias.
// Quem está logado na empresa dona da demanda enxerga e decide sempre; o acesso
// anônimo continua expirando normalmente.
async function ehAcessoInterno(organizacaoId: string | null | undefined): Promise<boolean> {
  if (!organizacaoId) return false
  const session = await auth()
  if (!session?.user) return false
  return (await getOrgId(session)) === organizacaoId
}

// GET /api/aprovacao-video/[token] — busca info da aprovação (público, sem auth)
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const empresa = await empresaDoToken(token)
  if (empresa) declararOrg(empresa)

  const aprovacao = await prisma.aprovacaoVideo.findUnique({
    where: { token },
    include: {
      demanda: {
        select: {
          id: true, codigo: true, titulo: true, departamento: true, tipoVideo: true,
          organizacaoId: true,
          // Growth: área + copy + todas as artes (carrossel) + produto/linha
          area: true, descricao: true, detalhesEntrega: true,
          linhaProjetoRef: { select: { nome: true } },
          produtos: { select: { produto: { select: { nome: true } } }, take: 1 },
          arquivos: {
            where: { tipoArquivo: "final" },
            select: { id: true, url: true, nomeArquivo: true, sequencia: true },
            orderBy: { sequencia: "asc" },
          },
        },
      },
    },
  })

  if (!aprovacao) {
    return NextResponse.json({ error: "Link de aprovação não encontrado" }, { status: 404 })
  }

  const expirado = !!aprovacao.expiresAt && aprovacao.expiresAt < new Date()
  const interno = expirado && (await ehAcessoInterno(aprovacao.demanda?.organizacaoId))
  if (expirado && !interno) {
    return NextResponse.json({ error: "Este link de aprovação expirou" }, { status: 410 })
  }

  // Versão anterior do mesmo vídeo. Cada rodada de ajuste cria uma AprovacaoVideo
  // nova, então a anterior é o corte que o cliente já viu — poder comparar os dois
  // lado a lado é o que responde "o que mudou?" sem precisar confiar na memória.
  // Campos deliberadamente mínimos: nada de quem aprovou nem de dados internos.
  const versaoAnterior = aprovacao.demandaId
    ? await prisma.aprovacaoVideo.findFirst({
        where: { demandaId: aprovacao.demandaId, createdAt: { lt: aprovacao.createdAt } },
        orderBy: { createdAt: "desc" },
        select: { urlVideo: true, nomeVideo: true, comentario: true, status: true, createdAt: true },
      })
    : null

  // A mídia nova vive em bucket privado. Quem abre esta página não tem conta —
  // a credencial dela é o token, e ele passa a valer para o ARQUIVO também.
  // Anexado aqui, no servidor, para a página não precisar mudar.
  // URL do acervo antigo (pública) passa intacta.
  // Assiste-se à prévia convertida; baixa-se o original do mesmo arquivo, quando houver.
  const original = aprovacao.demandaId
    ? (await prisma.arquivo.findFirst({
        where: { demandaId: aprovacao.demandaId, tipoArquivo: "final", url: aprovacao.urlVideo, originalUrl: { not: null } },
        select: { originalUrl: true },
      }))?.originalUrl ?? null
    : null

  return NextResponse.json({
    aprovacao: { ...aprovacao, urlVideo: comToken(aprovacao.urlVideo, token) ?? aprovacao.urlVideo },
    urlDownload: paraDownload(comToken(original ?? aprovacao.urlVideo, token) ?? aprovacao.urlVideo),
    expirado,
    versaoAnterior: versaoAnterior
      ? { ...versaoAnterior, urlVideo: comToken(versaoAnterior.urlVideo, token) ?? versaoAnterior.urlVideo }
      : null,
  })
}

// PATCH /api/aprovacao-video/[token] — renova a validade do link do cliente.
// Só quem está logado na empresa dona da demanda: reabre o mesmo link por mais 30
// dias sem recriar a aprovação (preserva token, histórico e comentários).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const empresa = await empresaDoToken(token)
  if (empresa) declararOrg(empresa)

  const aprovacao = await prisma.aprovacaoVideo.findUnique({
    where: { token },
    select: { id: true, demanda: { select: { organizacaoId: true } } },
  })
  if (!aprovacao) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })

  if (!(await ehAcessoInterno(aprovacao.demanda?.organizacaoId))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const dias = 30
  const atualizada = await prisma.aprovacaoVideo.update({
    where: { token },
    data: { expiresAt: new Date(Date.now() + dias * 24 * 60 * 60 * 1000) },
    select: { expiresAt: true },
  })

  return NextResponse.json({ ok: true, expiresAt: atualizada.expiresAt })
}

// POST /api/aprovacao-video/[token] — aprova ou solicita feedback (público, sem auth)
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json()
  const { acao, aprovadoPor, comentario } = body // acao: "aprovar" | "feedback"

  if (!["aprovar", "feedback"].includes(acao)) {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  }
  const empresa = await empresaDoToken(token)
  if (empresa) declararOrg(empresa)

  const aprovacao = await prisma.aprovacaoVideo.findUnique({ where: { token } })
  if (!aprovacao) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })

  // Rota pública resolve a org pelo registro (demanda do token)
  const demandaOrg = await prisma.demanda.findUnique({
    where: { id: aprovacao.demandaId },
    select: { organizacaoId: true },
  })
  // A demanda é a credencial deste token. Se ela sumiu, não há empresa a quem
  // atribuir a aprovação nem quem avisar — e o alerta que este fluxo cria
  // nasceria órfão, invisível para todas as telas.
  if (!demandaOrg) {
    return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })
  }
  const organizacaoId = demandaOrg.organizacaoId

  if (aprovacao.expiresAt && aprovacao.expiresAt < new Date() && !(await ehAcessoInterno(organizacaoId))) {
    return NextResponse.json({ error: "Link expirado" }, { status: 410 })
  }

  if (aprovacao.status !== "pendente") {
    return NextResponse.json({ error: "Esta aprovação já foi respondida", status: aprovacao.status }, { status: 400 })
  }

  const novoStatus = acao === "aprovar" ? "aprovado" : "feedback_solicitado"

  const updated = await prisma.aprovacaoVideo.update({
    where: { token },
    data: { status: novoStatus, aprovadoPor, comentario },
  })

  // Se aprovado → vai para "Para Postar". O vídeo continua no armazenamento do NuFlow.
  if (acao === "aprovar") {
    await prisma.demanda.update({
      where: { id: aprovacao.demandaId },
      data: {
        statusInterno: "aprovado",
        statusVisivel: "para_postar",
      },
    })
    await prisma.historicoStatus.create({
      data: {
        demandaId: aprovacao.demandaId,
        statusAnterior: aprovacao.status,
        statusNovo: "aprovado",
        origem: "manual",
        observacao: `Vídeo aprovado pelo cliente${aprovadoPor ? ` (${aprovadoPor})` : ""} — aguardando postagem`,
      },
    })
  } else {
    // Solicita ajuste
    await prisma.demanda.update({
      where: { id: aprovacao.demandaId },
      data: { statusInterno: "ajuste_solicitado", statusVisivel: "aprovacao" },
    })
    await prisma.historicoStatus.create({
      data: {
        demandaId: aprovacao.demandaId,
        statusAnterior: "revisao_pendente",
        statusNovo: "ajuste_solicitado",
        origem: "manual",
        observacao: `Feedback do cliente: ${comentario ?? "Ajuste solicitado"}`,
      },
    })
  }

  // Cria alerta para a equipe
  await prisma.alertaIA.create({
    data: {
      organizacaoId,
      demandaId: aprovacao.demandaId,
      tipoAlerta: acao === "aprovar" ? "video_aprovado" : "ajuste_solicitado",
      mensagem: acao === "aprovar"
        ? `✅ Vídeo aprovado pelo cliente${aprovadoPor ? ` (${aprovadoPor})` : ""}!`
        : `🔄 Cliente solicitou ajustes: "${comentario ?? "Sem comentário"}"`,
      severidade: acao === "aprovar" ? "info" : "aviso",
    },
  })

  // NOVO: Notifica admin/gestor e editor via WhatsApp
  const demanda = await prisma.demanda.findUnique({
    where: { id: aprovacao.demandaId },
    include: {
      editor: { select: { nome: true, telefone: true, whatsapp: true } },
      videomaker: { select: { nome: true, telefone: true } },
    },
  })

  if (demanda) {
    const msgBase = acao === "aprovar"
      ? `✅ *Vídeo Aprovado pelo Cliente!*\n\n📋 *${demanda.codigo}* — ${demanda.titulo}${aprovadoPor ? `\n👤 Aprovado por: ${aprovadoPor}` : ""}\n\nMovido para *Para Postar*. Realize a postagem e finalize no sistema. 🎬`
      : `🔄 *Cliente Pediu Ajustes!*\n\n📋 *${demanda.codigo}* — ${demanda.titulo}\n💬 "${comentario ?? "Ajuste solicitado"}"\n\nPor favor, revise e reenvie.`

    // Notifica gestores
    emSegundoPlano(() => notificarGestoresAprovacao(msgBase, demanda.organizacaoId), "gestores-aprovacao")
    // A demanda mudou de estado — o que estava pendente por causa do estado
    // anterior deixa de valer. Sem isto o alerta ficava aberto para sempre.
    emSegundoPlano(() => resolverAlertas(demanda.organizacaoId, demanda.id), "resolver-alertas")

    // Notifica editor (quem edita precisa saber de ajustes)
    if (demanda.editor) {
      const telEditor = demanda.editor.whatsapp || demanda.editor.telefone
      if (telEditor) {
        emSegundoPlano(() => sendWhatsappMessage(telEditor, msgBase, demanda.id, demanda.organizacaoId), "wa-editor-aprovacao")
      }
    }

    // Notifica videomaker se aprovado
    const telVmAprovacao = demanda.videomaker?.telefone
    if (acao === "aprovar" && telVmAprovacao) {
      emSegundoPlano(() => sendWhatsappMessage(
        telVmAprovacao,
        `✅ *Vídeo Aprovado!*\n\n📋 *${demanda.codigo}* — ${demanda.titulo}\n\nParabéns! O cliente aprovou o vídeo. 🎬`,
        demanda.id, demanda.organizacaoId
      ), "wa-videomaker-aprovado")
    }
  }

  return NextResponse.json({ ok: true, status: updated.status })
}

async function notificarGestoresAprovacao(mensagem: string, organizacaoId?: string | null) {
  try {
    const gestores = await quemRecebeTudo(organizacaoId)
    for (const g of gestores) {
      if (g.telefone) {
        await sendWhatsappMessage(g.telefone, mensagem, undefined, organizacaoId).catch(() => null)
      }
    }
  } catch (e) {
    console.error("[AprovacaoVideo] Falha ao notificar gestores:", e)
  }
}
