import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { orgPublica } from "@/lib/org"
import { comOrg } from "@/lib/org-contexto"
import { checarRateLimit, ipDaRequisicao } from "@/lib/rate-limit"

const schema = z.object({
  cliente: z.string().trim().min(2).max(160),
  endereco: z.string().trim().min(5).max(500),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  consultora: z.string().trim().min(2).max(120),
  envioId: z.string().uuid(),
  website: z.string().max(200).optional(),
})

export async function POST(req: NextRequest) {
  const limit = checarRateLimit(`job-publico:${ipDaRequisicao(req.headers)}`, 10, 15 * 60 * 1000)
  if (!limit.ok) return NextResponse.json({ error: "Aguarde alguns minutos antes de enviar novamente." }, { status: 429 })
  const slug = req.nextUrl.searchParams.get("org")?.trim()
  if (!slug || slug.length > 150) return NextResponse.json({ error: "Use o link fornecido pela empresa." }, { status: 400 })
  if (Number(req.headers.get("content-length")) > 12000) return NextResponse.json({ error: "Formulário muito longo." }, { status: 413 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Confira os cinco campos antes de enviar." }, { status: 400 })
  const d = parsed.data
  const quando = new Date(`${d.data}T${d.hora}:00-03:00`)
  // Date normaliza datas como 30/02: confira também o dia informado.
  const dia = new Date(`${d.data}T12:00:00Z`)
  if (!Number.isFinite(quando.getTime()) || !Number.isFinite(dia.getTime()) || dia.toISOString().slice(0, 10) !== d.data || quando.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Informe uma data e um horário futuros válidos (horário de Brasília)." }, { status: 400 })
  }
  try {
    const organizacaoId = await orgPublica(slug)
    if (!organizacaoId) return NextResponse.json({ error: "Este link não está disponível. Peça um novo link à empresa." }, { status: 404 })
    if (d.website) return NextResponse.json({ ok: true }, { status: 201 })
    const id = `job-form-${d.envioId}`
    const codigo = `JOB-${d.envioId.replaceAll("-", "").toUpperCase()}`
    await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
      // Serializa reenvios do mesmo formulário; nenhuma duplicação após timeout.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`
      const existente = await tx.demanda.findFirst({ where: { id, organizacaoId }, select: { id: true } })
      if (existente) return
      // Identidade técnica inativa por empresa: não atribuir o pedido a um admin
      // real nem criar uma conta de acesso para a consultora não autenticada.
      const atorId = `formulario-jobs-${organizacaoId}`
      await tx.$executeRaw`INSERT INTO usuarios (id, nome, tipo, status, "senhaHash", "updatedAt") VALUES (${atorId}, 'Formulário de gravação', 'solicitante', 'inativo', '!sem-login', NOW()) ON CONFLICT (id) DO NOTHING`
      await tx.usuarioOrganizacao.upsert({
        where: { usuarioId_organizacaoId: { usuarioId: atorId, organizacaoId } },
        create: { id: randomUUID(), usuarioId: atorId, organizacaoId, papel: "solicitante", areas: [], funcaoProfissional: "Recebimento de Jobs · sem acesso" }, update: {},
      })
      await tx.demanda.create({ data: {
        id, codigo, organizacaoId, titulo: `Gravação · ${d.cliente}`,
        descricao: `Cliente / clínica: ${d.cliente}\nEndereço: ${d.endereco}\nData: ${d.data.split("-").reverse().join("/")} às ${d.hora} (Brasília)\nConsultora: ${d.consultora}\n\nPedido recebido pelo formulário público. Aguardando atribuição de videomaker.`,
        clienteFinalNome: d.cliente, nomeSolicitante: d.consultora,
        localGravacao: d.endereco, localEvento: d.endereco,
        dataCaptacao: quando, dataEvento: quando,
        detalhesEntrega: { consultora: d.consultora, origem: "formulario_gravacao", fuso: "America/Sao_Paulo" },
        departamento: "eventos", area: "audiovisual", tipoVideo: "cobertura_evento", cidade: "Não informada",
        statusInterno: "planejamento", statusVisivel: "producao", solicitanteId: atorId,
        historicos: { create: { statusNovo: "planejamento", observacao: "Job criado diretamente pelo formulário público de gravação, sem autenticação do remetente. Aguardando atribuição.", origem: "manual" } },
      } })
    }))
    return NextResponse.json({ ok: true, codigo }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Não foi possível registrar agora. Tente novamente." }, { status: 500 })
  }
}
