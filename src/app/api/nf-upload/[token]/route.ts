import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/whatsapp"

// GET /api/nf-upload/[token] — dados da NF (página pública)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const nf = await prisma.notaFiscalUpload.findUnique({
    where: { token },
    include: {
      videomaker: { select: { nome: true } },
      demanda: { select: { codigo: true, titulo: true } },
    },
  })

  if (!nf) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })

  return NextResponse.json(nf)
}

// POST /api/nf-upload/[token] — receber upload
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const nf = await prisma.notaFiscalUpload.findUnique({
    where: { token },
    include: {
      videomaker: { select: { nome: true, telefone: true } },
      demanda: { select: { codigo: true, titulo: true } },
    },
  })
  if (!nf) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })
  if (nf.status !== "pendente") {
    return NextResponse.json({ error: "Nota fiscal já foi enviada" }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get("arquivo") as File | null
  if (!file) return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 })

  // NOVO: Validação server-side do tipo de arquivo
  const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"]
  const allowedExts = ["pdf", "png", "jpg", "jpeg"]
  const ext = (file.name.split(".").pop() || "").toLowerCase()

  if (!allowedExts.includes(ext) && !allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Tipo de arquivo inválido. Envie PDF, PNG ou JPG." },
      { status: 400 }
    )
  }

  // NOVO: Limite de tamanho (20MB)
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Arquivo muito grande. Máximo 20MB." },
      { status: 400 }
    )
  }

  // Upload para Supabase Storage
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Storage não configurado" }, { status: 500 })
  }

  const path = `notas-fiscais/${nf.demandaId}/${nf.videomakerId}/${Date.now()}.${ext || "pdf"}`

  const arrayBuffer = await file.arrayBuffer()
  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/uploads/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: arrayBuffer,
  })

  // CORRIGIDO: Se upload falha, retorna erro em vez de continuar com URL vazia
  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "Erro desconhecido")
    console.error("Erro upload supabase:", errText)
    return NextResponse.json(
      { error: "Falha ao fazer upload do arquivo. Tente novamente." },
      { status: 500 }
    )
  }

  const url = `${supabaseUrl}/storage/v1/object/public/uploads/${path}`

  // Atualizar NF
  await prisma.notaFiscalUpload.update({
    where: { token },
    data: {
      url,
      nomeArquivo: file.name,
      status: "enviada",
    },
  })

  // Atualizar CustoVideomaker se existir
  await prisma.custoVideomaker.updateMany({
    where: { demandaId: nf.demandaId, videomakerId: nf.videomakerId, statusPagamento: "pendente_nf" },
    data: { notaFiscalUrl: url, statusPagamento: "nf_enviada" },
  })

  // NOVO: Notificar admin/gestor que NF foi recebida
  void notificarGestoresNF(
    nf.demanda.codigo,
    nf.demanda.titulo,
    nf.videomaker.nome
  )

  return NextResponse.json({ success: true })
}

/**
 * Notifica gestores/admins que uma NF foi enviada pelo videomaker
 */
async function notificarGestoresNF(codigo: string, titulo: string, nomeVideomaker: string) {
  try {
    const gestores = await prisma.usuario.findMany({
      where: { tipo: { in: ["admin", "gestor"] }, status: "ativo", telefone: { not: null } },
      select: { telefone: true },
    })

    const msg = `📄 *NF Recebida!*\n\n📋 *${codigo}* — ${titulo}\n👤 ${nomeVideomaker} enviou a nota fiscal.\n\nAcesse *Aprovações → Pagamentos* para aprovar.`

    for (const g of gestores) {
      if (g.telefone) {
        await sendWhatsappMessage(g.telefone, msg).catch(() => null)
      }
    }

    // Cria alerta in-app também
    const demanda = await prisma.demanda.findFirst({
      where: { codigo },
      select: { id: true },
    })
    if (demanda) {
      await prisma.alertaIA.create({
        data: {
          demandaId: demanda.id,
          tipoAlerta: "nf_recebida",
          mensagem: `📄 Nota fiscal recebida de ${nomeVideomaker} para ${codigo}. Aguardando aprovação do pagamento.`,
          severidade: "aviso",
          acaoSugerida: "Aprovar pagamento em Aprovações → Pagamentos",
        },
      }).catch(() => null)
    }
  } catch (e) {
    console.error("[NF-Upload] Falha ao notificar gestores:", e)
  }
}
