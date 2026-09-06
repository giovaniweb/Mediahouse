import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { caminhoMidia, subirArquivo } from "@/lib/midia"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { declararOrg } from "@/lib/org-contexto"
import { orgPorCredencial } from "@/lib/org-por-credencial"

type Params = { params: Promise<{ token: string }> }

// GET /api/publico/fornecedor/[token] — portal do fornecedor (sem login)
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params

  // A credencial é a chave: ela diz de qual empresa é este registro, e sob RLS a
  // empresa precisa ser declarada ANTES da primeira consulta — senão o banco
  // devolve vazio e a página some. `orgPorCredencial` resolve por uma função no
  // banco que devolve só o id da empresa, sem abrir a tabela.
  //
  // O 404 aqui responde igual para credencial inválida e para credencial de
  // outra empresa: a diferença entre "não existe" e "existe e não é sua" seria
  // um oráculo.
  const organizacaoId = await orgPorCredencial("fornecedor", token)
  if (!organizacaoId) return NextResponse.json({ error: "Portal não encontrado" }, { status: 404 })
  declararOrg(organizacaoId)
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

  // A credencial é a chave: ela diz de qual empresa é este registro, e sob RLS a
  // empresa precisa ser declarada ANTES da primeira consulta — senão o banco
  // devolve vazio e a página some. `orgPorCredencial` resolve por uma função no
  // banco que devolve só o id da empresa, sem abrir a tabela.
  //
  // O 404 aqui responde igual para credencial inválida e para credencial de
  // outra empresa: a diferença entre "não existe" e "existe e não é sua" seria
  // um oráculo.
  const organizacaoId = await orgPorCredencial("fornecedor", token)
  if (!organizacaoId) return NextResponse.json({ error: "Portal não encontrado" }, { status: 404 })
  declararOrg(organizacaoId)
  const fornecedor = await prisma.fornecedor.findUnique({
    where: { portalToken: token },
    select: { id: true, nome: true, organizacaoId: true },
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

  // Nota fiscal de fornecedor: mesmo tratamento da NF de videomaker — vai para
  // o bucket privado, sem convivência. Documento fiscal não fica público.
  if (!fornecedor.organizacaoId) {
    return NextResponse.json({ error: "Fornecedor sem organização" }, { status: 500 })
  }
  const arrayBuffer = await file.arrayBuffer()
  const caminho = caminhoMidia({
    organizacaoId: fornecedor.organizacaoId,
    tipo: "nf",
    id: `fornecedor-${fornecedor.id}-${custoId}`,
    ext,
  })
  const url = await subirArquivo(caminho, arrayBuffer, file.type || "application/octet-stream")
  if (!url) return NextResponse.json({ error: "Falha no upload. Tente novamente." }, { status: 500 })
  await prisma.custoEvento.update({
    where: { id: custoId },
    data: { notaFiscalUrl: url, statusPagamento: "nf_enviada" },
  })

  // Notifica admins/gestores da organização dona do fornecedor
  const orgId = fornecedor.organizacaoId
  const gestores = await prisma.usuario.findMany({
    where: { tipo: { in: ["admin", "gestor", "gestor_eventos"] }, telefone: { not: null }, ...(orgId ? { organizacoes: { some: { organizacaoId: orgId } } } : {}) },
    select: { telefone: true },
  })
  const msg = `🧾 *NuFlow Eventos* — ${fornecedor.nome} enviou documento para "${custo.descricao}" (evento ${custo.evento.nome}).`
  for (const g of gestores) {
    if (g.telefone) await sendWhatsappMessage(g.telefone, msg, undefined, orgId).catch(() => null)
  }

  return NextResponse.json({ ok: true, url })
}
