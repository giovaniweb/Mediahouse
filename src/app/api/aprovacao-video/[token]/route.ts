import { NextRequest, NextResponse, after } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { comToken, resolverParaAssinada, VALIDADE_MAQUINA_SEGUNDOS } from "@/lib/midia"
import { quemRecebeTudo } from "@/lib/notificados"
import { getOrgId } from "@/lib/org"
import { emSegundoPlano } from "@/lib/notificar"
import { resolverAlertas } from "@/lib/alertas"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { criarSessaoUploadDrive } from "@/lib/google-drive"

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
  return NextResponse.json({
    aprovacao: { ...aprovacao, urlVideo: comToken(aprovacao.urlVideo, token) ?? aprovacao.urlVideo },
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

  const aprovacao = await prisma.aprovacaoVideo.findUnique({ where: { token } })
  if (!aprovacao) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })

  // Rota pública resolve a org pelo registro (demanda do token)
  const demandaOrg = await prisma.demanda.findUnique({
    where: { id: aprovacao.demandaId },
    select: { organizacaoId: true },
  })
  const organizacaoId = demandaOrg?.organizacaoId ?? null

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

  // Se aprovado → vai para "Para Postar" + transfere vídeo do Supabase para o Drive em background
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

    // Transfere vídeo do Supabase para o Google Drive em background (após retornar ao cliente)
    // O nome do arquivo é construído a partir dos dados da demanda, não do nome original do arquivo.
    const aprovacaoSnap = aprovacao
    after(async () => {
      try {
        const urlVideo = aprovacaoSnap.urlVideo
        // Só transfere vídeos hospedados no Supabase; URLs externas (YouTube, Drive, etc.) ficam como estão
        if (!urlVideo || !urlVideo.includes("supabase")) return

        // Busca dados da demanda para construir o nome do arquivo
        const dem = await prisma.demanda.findUnique({
          where: { id: aprovacaoSnap.demandaId },
          include: { produtos: { select: { produto: { select: { nome: true } } } } },
        })
        if (!dem) return

        // Busca o Arquivo correspondente a este vídeo para obter sequencia
        const arq = await prisma.arquivo.findFirst({
          where: { demandaId: dem.id, url: urlVideo, tipoArquivo: "final" },
        })
        const seq = arq?.sequencia ?? 1
        const seqStr = String(seq).padStart(3, "0") // "001", "002", "003"...

        // Constrói nome: [produto]_[titulo]_[codigo]_001.ext
        const sanitize = (s: string) => s.replace(/[/\\:*?"<>|]/g, "").trim().replace(/\s+/g, "_")
        const parts: string[] = []
        const prod = dem.produtos?.[0]?.produto?.nome
        if (prod) parts.push(sanitize(prod).substring(0, 30))
        parts.push(sanitize(dem.titulo).substring(0, 40))
        parts.push(dem.codigo)
        const ext = urlVideo.split(".").pop()?.split("?")[0] ?? "mp4"
        const fileName = `${parts.join("_")}_${seqStr}.${ext}`

        // Stream direto: Supabase → Drive (sem buffer intermediário — server-to-server, sem CORS)
        // A mídia nova vive em bucket privado e a URL guardada é do nosso app:
        // o servidor não consegue buscá-la direto. Assina aqui, com validade de
        // máquina — a cópia para o Drive baixa o arquivo inteiro, e 10 minutos
        // não bastam para vídeo grande.
        const origem = (await resolverParaAssinada(urlVideo, VALIDADE_MAQUINA_SEGUNDOS)) ?? urlVideo
        const supaRes = await fetch(origem)
        if (!supaRes.ok || !supaRes.body) {
          console.error("[AprovacaoVideo] Falha ao buscar vídeo do Supabase:", supaRes.status)
          return
        }
        const fileSize = parseInt(supaRes.headers.get("Content-Length") ?? "0")
        if (fileSize <= 0) {
          console.error("[AprovacaoVideo] Content-Length ausente ou zero — não é possível iniciar sessão Drive")
          return
        }
        const contentType = supaRes.headers.get("Content-Type") ?? "video/mp4"

        // Drive da organização dona da demanda (rota pública resolve org pelo registro)
        const { sessionUri, publicUrl } = await criarSessaoUploadDrive({ fileName, fileSize, contentType }, dem.organizacaoId)

        // PUT streaming (sem carregar o arquivo inteiro na memória)
        const driveRes = await fetch(sessionUri, {
          method: "PUT",
          headers: {
            "Content-Type":   contentType,
            "Content-Length": String(fileSize),
            "Content-Range":  `bytes 0-${fileSize - 1}/${fileSize}`,
          },
          body: supaRes.body,
          // @ts-ignore — duplex necessário no Node.js fetch para body streaming
          duplex: "half",
        })

        if (driveRes.status === 200 || driveRes.status === 201) {
          // Atualiza Arquivo.url para URL do Drive (para download/entrega ao cliente)
          // NÃO atualiza linkFinal — mantém URL do Supabase para galeria/player
          if (arq) {
            await prisma.arquivo.update({
              where: { id: arq.id },
              data: { url: publicUrl },
            })
          }
          console.info(`[AprovacaoVideo] Drive upload concluído (${seqStr}): ${publicUrl}`)
        } else {
          const errText = await driveRes.text().catch(() => "")
          console.error(`[AprovacaoVideo] Drive retornou HTTP ${driveRes.status}:`, errText.slice(0, 300))
        }
      } catch (e) {
        // Falha silenciosa — o vídeo continua acessível no Supabase; admin pode re-enviar manualmente
        console.error("[AprovacaoVideo] Erro ao transferir para Drive:", e)
      }
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
