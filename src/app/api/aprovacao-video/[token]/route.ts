import { NextRequest, NextResponse, after } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { criarSessaoUploadDrive } from "@/lib/google-drive"

// GET /api/aprovacao-video/[token] — busca info da aprovação (público, sem auth)
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const aprovacao = await prisma.aprovacaoVideo.findUnique({
    where: { token },
    include: {
      demanda: {
        select: { id: true, codigo: true, titulo: true, departamento: true, tipoVideo: true },
      },
    },
  })

  if (!aprovacao) {
    return NextResponse.json({ error: "Link de aprovação não encontrado" }, { status: 404 })
  }

  if (aprovacao.expiresAt && aprovacao.expiresAt < new Date()) {
    return NextResponse.json({ error: "Este link de aprovação expirou" }, { status: 410 })
  }

  return NextResponse.json({ aprovacao })
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

  if (aprovacao.expiresAt && aprovacao.expiresAt < new Date()) {
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

        // Constrói nome: [produto]_[titulo]_[codigo].ext
        const sanitize = (s: string) => s.replace(/[/\\:*?"<>|]/g, "").trim().replace(/\s+/g, "_")
        const parts: string[] = []
        const prod = dem.produtos?.[0]?.produto?.nome
        if (prod) parts.push(sanitize(prod).substring(0, 30))
        parts.push(sanitize(dem.titulo).substring(0, 40))
        parts.push(dem.codigo)
        const ext = urlVideo.split(".").pop()?.split("?")[0] ?? "mp4"
        const fileName = `${parts.join("_")}.${ext}`

        // Stream direto: Supabase → Drive (sem buffer intermediário — server-to-server, sem CORS)
        const supaRes = await fetch(urlVideo)
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

        const { sessionUri, publicUrl } = await criarSessaoUploadDrive({ fileName, fileSize, contentType })

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
          // Atualiza linkFinal com a URL permanente do Drive
          await prisma.demanda.update({
            where: { id: dem.id },
            data: { linkFinal: publicUrl },
          })
          console.info(`[AprovacaoVideo] Drive upload concluído: ${publicUrl}`)
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
    void notificarGestoresAprovacao(msgBase)

    // Notifica editor (quem edita precisa saber de ajustes)
    if (demanda.editor) {
      const telEditor = demanda.editor.whatsapp || demanda.editor.telefone
      if (telEditor) {
        void sendWhatsappMessage(telEditor, msgBase, demanda.id).catch(() => null)
      }
    }

    // Notifica videomaker se aprovado
    if (acao === "aprovar" && demanda.videomaker?.telefone) {
      void sendWhatsappMessage(
        demanda.videomaker.telefone,
        `✅ *Vídeo Aprovado!*\n\n📋 *${demanda.codigo}* — ${demanda.titulo}\n\nParabéns! O cliente aprovou o vídeo. 🎬`,
        demanda.id
      ).catch(() => null)
    }
  }

  return NextResponse.json({ ok: true, status: updated.status })
}

async function notificarGestoresAprovacao(mensagem: string) {
  try {
    const gestores = await prisma.usuario.findMany({
      where: { tipo: { in: ["admin", "gestor"] }, status: "ativo", telefone: { not: null } },
      select: { telefone: true },
    })
    for (const g of gestores) {
      if (g.telefone) {
        await sendWhatsappMessage(g.telefone, mensagem).catch(() => null)
      }
    }
  } catch (e) {
    console.error("[AprovacaoVideo] Falha ao notificar gestores:", e)
  }
}
