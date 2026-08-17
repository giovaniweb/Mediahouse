import { NextRequest, NextResponse, after } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { STATUS_PARA_COLUNA } from "@/lib/status"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { criarSessaoUploadDrive } from "@/lib/google-drive"
import { requireDemandaOrg } from "@/lib/org"
import { emSegundoPlano } from "@/lib/notificar"
import { destinatariosDoAviso, type DadosAvisoKanban } from "@/lib/kanban-avisos"
import type { StatusInterno } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const { organizacaoId } = guard
  const body = await req.json()
  const { statusInterno, observacao } = body
  // Sanitiza origem para valores válidos do enum OrigemHistorico
  const ORIGENS_VALIDAS = ["manual", "automacao", "ia", "whatsapp", "kanban"]
  const origemRaw = (body.origem as string) || "manual"
  const origem = (ORIGENS_VALIDAS.includes(origemRaw) ? origemRaw : "manual") as import("@prisma/client").OrigemHistorico

  if (!statusInterno) {
    return NextResponse.json({ error: "statusInterno obrigatório" }, { status: 400 })
  }

  const demandaAtual = await prisma.demanda.findUnique({
    where: { id },
    include: {
      videomaker: { select: { nome: true, telefone: true } },
      solicitante: { select: { nome: true, telefone: true } },
      editor: { select: { nome: true, telefone: true, whatsapp: true } },
      // Executores do Growth. Faltavam aqui, e por isso quem ia fazer o
      // trabalho era a única pessoa que não recebia aviso nenhum.
      responsavel: { select: { telefone: true } },
      responsaveis: { select: { usuario: { select: { telefone: true } } } },
      designer: { select: { telefone: true, whatsapp: true } },
      // Para a checagem de "não mandar para aprovação sem peça anexada".
      _count: { select: { arquivos: true } },
    },
  })
  // telefoneSolicitante é o número de quem pediu via WhatsApp (pode ser diferente do solicitante do sistema)
  if (!demandaAtual) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  // Validações de regras de negócio
  // Aceita linkBrutos OU linkFolderBrutos (videomakers externos usam pasta do Drive)
  const temBrutos = demandaAtual.linkBrutos || body.linkBrutos || demandaAtual.linkFolderBrutos
  if (statusInterno === "brutos_enviados" && !temBrutos) {
    return NextResponse.json({ error: "Link dos brutos obrigatório para avançar. Adicione o link da pasta ou do arquivo antes de marcar como entregue." }, { status: 400 })
  }
  if (statusInterno === "edicao_finalizada" && !demandaAtual.linkFinal && !body.linkFinal) {
    return NextResponse.json({ error: "Link do vídeo final obrigatório." }, { status: 400 })
  }
  if (statusInterno === "impedimento" && !observacao && !demandaAtual.motivoImpedimento) {
    return NextResponse.json({ error: "Motivo do impedimento obrigatório." }, { status: 400 })
  }
  // Growth: "Para aprovação" sem arte anexada é um card que não tem o que
  // aprovar. Em 16/08/2026 as três demandas de Growth nessa coluna estavam
  // assim — nenhuma com peça, nenhuma com link de aprovação. Quem movia achava
  // que tinha mandado para o cliente; o cliente nunca recebeu nada.
  //
  // Mesmo princípio que o audiovisual já aplica ao exigir o link do vídeo final
  // para sair da edição.
  if (
    statusInterno === "revisao_pendente" &&
    demandaAtual.area === "design" &&
    demandaAtual._count.arquivos === 0
  ) {
    return NextResponse.json(
      { error: "Anexe a arte final antes de mandar para aprovação — sem peça, o cliente recebe um link vazio." },
      { status: 400 }
    )
  }

  const novoStatusVisivel = STATUS_PARA_COLUNA[statusInterno as StatusInterno]
  if (!novoStatusVisivel) {
    return NextResponse.json({ error: `Status "${statusInterno}" inválido` }, { status: 400 })
  }

  try {
    const [demanda] = await prisma.$transaction([
      prisma.demanda.update({
        where: { id },
        data: {
          statusInterno: statusInterno as StatusInterno,
          statusVisivel: novoStatusVisivel,
          // Marcar data de finalização ao chegar em "finalizado"
          ...(novoStatusVisivel === "finalizado" ? { finalizadaEm: new Date() } : {}),
          ...(body.linkBrutos && { linkBrutos: body.linkBrutos }),
          ...(body.linkFinal && { linkFinal: body.linkFinal }),
          ...(body.linkPostagem && { linkPostagem: body.linkPostagem }),
          ...(body.postagemTipo && { postagemTipo: body.postagemTipo }),
          // Auto-setar dataPostagem ao marcar como postado
          ...(statusInterno === "postado" ? { dataPostagem: new Date() } : {}),
          ...(observacao && statusInterno === "impedimento" && { motivoImpedimento: observacao }),
        },
      }),
      prisma.historicoStatus.create({
        data: {
          demandaId: id,
          statusAnterior: demandaAtual.statusInterno,
          statusNovo: statusInterno,
          usuarioId: session.user.id,
          origem,
          observacao,
        },
      }),
    ])

    // ── Auto-aprovar AprovacaoVideo + Drive upload quando vai para Para Postar ─
    if (novoStatusVisivel === "para_postar") {
      try {
        const aprovacoesPendentes = await prisma.aprovacaoVideo.findMany({
          where: { demandaId: id, status: "pendente" },
          select: { id: true, urlVideo: true, demandaId: true },
        })
        if (aprovacoesPendentes.length > 0) {
          // Marcar como aprovadas (síncrono, antes da resposta)
          await prisma.aprovacaoVideo.updateMany({
            where: { demandaId: id, status: "pendente" },
            data: { status: "aprovado", aprovadoPor: "Sistema (Para Postar)" },
          })
          await prisma.alertaIA.create({
            data: {
              organizacaoId,
              demandaId: id,
              tipoAlerta: "video_aprovado",
              mensagem: `✅ ${aprovacoesPendentes.length} vídeo(s) aprovado(s) automaticamente ao mover para Para Postar`,
              severidade: "info",
            },
          }).catch(() => null)
          // Drive upload em background, após resposta ao cliente
          const aprovacoesCopy = aprovacoesPendentes
          after(async () => {
            for (const aprovacao of aprovacoesCopy) {
              try {
                const urlVideo = aprovacao.urlVideo
                if (!urlVideo || !urlVideo.includes("supabase")) continue
                const dem = await prisma.demanda.findUnique({
                  where: { id: aprovacao.demandaId },
                  include: { produtos: { select: { produto: { select: { nome: true } } } } },
                })
                if (!dem) continue
                const arq = await prisma.arquivo.findFirst({
                  where: { demandaId: dem.id, url: urlVideo, tipoArquivo: "final" },
                })
                const seq = arq?.sequencia ?? 1
                const seqStr = String(seq).padStart(3, "0")
                const sanitize = (s: string) => s.replace(/[/\\:*?"<>|]/g, "").trim().replace(/\s+/g, "_")
                const parts: string[] = []
                const prod = dem.produtos?.[0]?.produto?.nome
                if (prod) parts.push(sanitize(prod).substring(0, 30))
                parts.push(sanitize(dem.titulo).substring(0, 40))
                parts.push(dem.codigo)
                const ext = urlVideo.split(".").pop()?.split("?")[0] ?? "mp4"
                const fileName = `${parts.join("_")}_${seqStr}.${ext}`
                const supaRes = await fetch(urlVideo)
                if (!supaRes.ok || !supaRes.body) continue
                const fileSize = parseInt(supaRes.headers.get("Content-Length") ?? "0")
                if (fileSize <= 0) continue
                const contentType = supaRes.headers.get("Content-Type") ?? "video/mp4"
                const { sessionUri, publicUrl } = await criarSessaoUploadDrive({ fileName, fileSize, contentType }, organizacaoId)
                const driveRes = await fetch(sessionUri, {
                  method: "PUT",
                  headers: {
                    "Content-Type": contentType,
                    "Content-Length": String(fileSize),
                    "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`,
                  },
                  body: supaRes.body,
                  // @ts-ignore — duplex necessário no Node.js fetch para body streaming
                  duplex: "half",
                })
                if (driveRes.status === 200 || driveRes.status === 201) {
                  // Atualiza Arquivo.url para URL do Drive (para download), mas mantém linkFinal
                  // apontando para Supabase (para galeria/player sem restrições de CORS)
                  if (arq) await prisma.arquivo.update({ where: { id: arq.id }, data: { url: publicUrl } })
                  console.info(`[ParaPostar/Status] Drive upload concluído (${seqStr}): ${publicUrl}`)
                } else {
                  const errText = await driveRes.text().catch(() => "")
                  console.error(`[ParaPostar/Status] Drive HTTP ${driveRes.status} (${seqStr}):`, errText.slice(0, 200))
                }
              } catch (e) {
                console.error(`[ParaPostar/Status] Erro Drive upload:`, e)
              }
            }
          })
        }
      } catch (e) {
        console.error("[Status] Erro auto-aprovação para_postar:", e)
      }
    }

    // ── Auto-criar NotaFiscalUpload quando videomaker entrega os brutos ──────
    if (statusInterno === "brutos_enviados" && demandaAtual.videomakerId) {
      emSegundoPlano(async () => {
        try {
          const nfExistente = await prisma.notaFiscalUpload.findFirst({
            where: { demandaId: id, videomakerId: demandaAtual.videomakerId! },
          })
          const nf = nfExistente ?? await prisma.notaFiscalUpload.create({
            data: { demandaId: id, videomakerId: demandaAtual.videomakerId! },
          })
          // Enviar link da NF para o videomaker via WhatsApp
          if (demandaAtual.videomaker?.telefone) {
            const baseUrl = process.env.NEXTAUTH_URL || "https://nuflow.space"
            const nfLink = `${baseUrl}/nf-upload/${nf.token}`
            const msg =
              `🧾 *NuFlow — Brutos Recebidos!*\n\n` +
              `📋 *${demandaAtual.codigo}* — ${demandaAtual.titulo}\n\n` +
              `✅ Seus arquivos foram recebidos pela equipe. Obrigado!\n\n` +
              `Agora envie sua *Nota Fiscal* pelo link abaixo:\n${nfLink}\n\n` +
              `_O pagamento é processado em até 15 dias após o recebimento da NF._`
            await sendWhatsappMessage(demandaAtual.videomaker.telefone, msg, id, organizacaoId)
          }
        } catch (e) {
          console.error("[Status] Erro ao criar NF/enviar WA:", e)
        }
      }, "nf-upload-brutos")
    }

    // ── Atualizar ultimoConteudo nos produtos ao finalizar ────────────────────
    if (novoStatusVisivel === "finalizado") {
      emSegundoPlano(async () => {
        try {
          const produtosVinculados = await prisma.demandaProduto.findMany({
            where: { demandaId: id },
            select: { produtoId: true },
          })
          if (produtosVinculados.length > 0) {
            await prisma.produto.updateMany({
              where: { id: { in: produtosVinculados.map((p) => p.produtoId) } },
              data: { ultimoConteudo: new Date() },
            })
          }
        } catch (e) {
          console.error("[Status] Erro ao atualizar ultimoConteudo:", e)
        }
      }, "atualizar-produtos")
    }

    // ── Auto-criar CustoVideomaker ao finalizar ───────────────────────────────
    if (novoStatusVisivel === "finalizado" && demandaAtual.videomakerId) {
      emSegundoPlano(async () => {
        try {
          const jaExiste = await prisma.custoVideomaker.findFirst({
            where: { demandaId: id, videomakerId: demandaAtual.videomakerId! },
          })
          if (!jaExiste) {
            const vm = await prisma.videomaker.findUnique({
              where: { id: demandaAtual.videomakerId! },
              select: { valorDiaria: true },
            })
            await prisma.custoVideomaker.create({
              data: {
                organizacaoId,
                videomakerId: demandaAtual.videomakerId!,
                demandaId: id,
                tipo: "projeto",
                valor: vm?.valorDiaria ?? 0,
                descricao: `Serviço: ${demandaAtual.codigo} — ${demandaAtual.titulo}`,
                dataReferencia: new Date(),
                pago: false,
                statusPagamento: "pendente_nf",
              },
            })
            console.info(`[Status] Custo auto-criado para ${demandaAtual.codigo} — VM ${demandaAtual.videomakerId}`)
          }
        } catch (e) {
          console.error("[Status] Erro ao auto-criar custo:", e)
        }
      }, "custo-videomaker")
    }

    // ── Notificações WhatsApp: rodam DEPOIS da resposta, mas com a função viva.
    // Antes eram `void` solto e a instância congelava antes do envio sair.
    // Quem mexeu no card: usado para não mandar o aviso de volta para ele e para
    // decidir se a gestão precisa saber (executor mexendo é notícia; gestor
    // mexendo não precisa ser anunciado para os outros gestores).
    const autor = await prisma.usuario.findUnique({
      where: { id: session.user.id },
      select: { nome: true, telefone: true, tipo: true },
    }).catch(() => null)

    emSegundoPlano(() => notificarMudancaKanban({
      statusNovo: statusInterno,
      codigo: demandaAtual.codigo,
      titulo: demandaAtual.titulo,
      demandaId: id,
      organizacaoId,
      telefoneVideomaker: demandaAtual.videomaker?.telefone ?? null,
      telefoneEditor: demandaAtual.editor?.whatsapp ?? demandaAtual.editor?.telefone ?? null,
      telefonesExecutores: [
        ...demandaAtual.responsaveis.map((r) => r.usuario.telefone),
        demandaAtual.responsavel?.telefone ?? null,
        demandaAtual.designer?.whatsapp ?? demandaAtual.designer?.telefone ?? null,
      ].filter((t): t is string => !!t),
      telefoneSolicitanteSistema: demandaAtual.solicitante?.telefone ?? null,
      telefoneSolicitanteWhatsapp: demandaAtual.telefoneSolicitante ?? null,
      autorTelefone: autor?.telefone ?? null,
      autorNome: (autor?.nome ?? "Alguém").split(" ")[0],
      autorEhGestor: autor?.tipo === "admin" || autor?.tipo === "gestor",
      // `extra` vira observação OU link final — nessa ordem: um motivo de
      // impedimento escrito à mão é mais útil que um link que a mensagem
      // do papel já carrega quando precisa.
      extra: observacao ?? demandaAtual.motivoImpedimento ?? body.linkFinal ?? demandaAtual.linkFinal,
    }), "mudanca-kanban")

    return NextResponse.json(demanda)
  } catch (e) {
    console.error("[Status PATCH] Erro na transação:", e)
    const msg = e instanceof Error ? e.message : "Erro ao atualizar status"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * Busca os telefones que dependem do banco e delega a decisão de quem recebe o
 * quê para @/lib/kanban-avisos (função pura, coberta por testes).
 */
async function notificarMudancaKanban(aviso: Omit<DadosAvisoKanban, "telefonesGestores" | "telefonesSocial"> & {
  demandaId: string
  organizacaoId: string
}) {
  const { demandaId, organizacaoId, ...dados } = aviso
  try {
    const gestores = await prisma.usuario.findMany({
      where: {
        tipo: { in: ["admin", "gestor"] as import("@prisma/client").TipoUsuario[] },
        status: "ativo",
        organizacoes: { some: { organizacaoId } },
      },
      select: { telefone: true },
    })

    const social = dados.statusNovo === "postagem_pendente"
      ? await prisma.usuario.findMany({
          where: { tipo: "social" as import("@prisma/client").TipoUsuario, status: "ativo", organizacoes: { some: { organizacaoId } } },
          select: { telefone: true },
        })
      : []

    const destinatarios = destinatariosDoAviso({
      ...dados,
      telefonesGestores: gestores.map((g) => g.telefone).filter((t): t is string => !!t),
      telefonesSocial: social.map((s) => s.telefone).filter((t): t is string => !!t),
    })

    await Promise.allSettled(
      destinatarios.map((d) => sendWhatsappMessage(d.telefone, d.mensagem, demandaId, organizacaoId))
    )
  } catch (e) {
    console.error("[Kanban Notify]", e)
  }
}
