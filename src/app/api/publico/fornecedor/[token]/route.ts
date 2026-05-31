import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/whatsapp"

type Params = { params: Promise<{ token: string }> }

// GET /api/publico/fornecedor/[token] — portal do fornecedor (sem login)
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params
  const fornecedor = await prisma.fornecedor.findUnique({
    where: { portalToken: token },
    select: {
      id: true, nome: true, categoria: true, cidade: true, estado: true,
      custos: {
        select: {
          id: true, descricao: true, categoria: true, valorPrevisto: true, valorReal: true,
          statusPagamento: true, notaFiscalUrl: true, pago: true,
          evento: { select: { nome: true, dataInicio: true, cidade: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  })
  if (!fornecedor) return NextResponse.json({ error: "Portal não encontrado" }, { status: 404 })
  return NextResponse.json({ fornecedor })
}

// POST /api/publico/fornecedor/[token] — fornecedor envia NF/documento para um custo
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params
  const fornecedor = await prisma.fornecedor.findUnique({
    where: { portalToken: token },
    select: { id: true, nome: true },
  })
  if (!fornecedor) return NextResponse.json({ error: "Portal não encontrado" }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get("arquivo") as File | null
  const custoId = formData.get("custoId") as string | null
  if (!file || !custoId) return NextResponse.json({ error: "Arquivo e custoId obrigatórios" }, { status: 400 })

  // Confirma que o custo pertence a este fornecedor
  const custo = await prisma.custoEvento.findFirst({
    where: { id: custoId, fornecedorId: fornecedor.id },
    include: { evento: { select: { nome: true } } },
  })
  if (!custo) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 })

  const allowedExts = ["pdf", "png", "jpg", "jpeg"]
  const ext = (file.name.split(".").pop() || "").toLowerCase()
  if (!allowedExts.includes(ext)) return NextResponse.json({ error: "Envie PDF, PNG ou JPG." }, { status: 400 })
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Máximo 20MB." }, { status: 400 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: "Storage não configurado" }, { status: 500 })

  const path = `fornecedores/${fornecedor.id}/${custoId}/${Date.now()}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/uploads/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": file.type || "application/octet-stream" },
    body: arrayBuffer,
  })
  if (!uploadRes.ok) return NextResponse.json({ error: "Falha no upload. Tente novamente." }, { status: 500 })

  const url = `${supabaseUrl}/storage/v1/object/public/uploads/${path}`
  await prisma.custoEvento.update({
    where: { id: custoId },
    data: { notaFiscalUrl: url, statusPagamento: "nf_enviada" },
  })

  // Notifica admins/gestores
  const gestores = await prisma.usuario.findMany({
    where: { tipo: { in: ["admin", "gestor", "gestor_eventos"] }, telefone: { not: null } },
    select: { telefone: true },
  })
  const msg = `🧾 *NuFlow Eventos* — ${fornecedor.nome} enviou documento para "${custo.descricao}" (evento ${custo.evento.nome}).`
  for (const g of gestores) {
    if (g.telefone) await sendWhatsappMessage(g.telefone, msg).catch(() => null)
  }

  return NextResponse.json({ ok: true, url })
}
