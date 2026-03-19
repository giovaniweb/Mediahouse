import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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

  const nf = await prisma.notaFiscalUpload.findUnique({ where: { token } })
  if (!nf) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })
  if (nf.status !== "pendente") {
    return NextResponse.json({ error: "Nota fiscal já foi enviada" }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get("arquivo") as File | null
  if (!file) return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 })

  // Upload para Supabase Storage
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Storage não configurado" }, { status: 500 })
  }

  const ext = file.name.split(".").pop() || "pdf"
  const path = `notas-fiscais/${nf.demandaId}/${nf.videomakerId}/${Date.now()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/uploads/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: arrayBuffer,
  })

  let url = `${supabaseUrl}/storage/v1/object/public/uploads/${path}`
  if (!uploadRes.ok) {
    // Fallback: salvar referência sem URL real
    console.error("Erro upload supabase:", await uploadRes.text())
    url = ""
  }

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

  return NextResponse.json({ success: true })
}
