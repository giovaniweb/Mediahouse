import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { orgPorCredencial } from "@/lib/org-por-credencial"
import { barrarTokenPublico } from "@/lib/limite-publico"
import { mudarStatus, STATUS_ANTES_DO_POSTADO } from "@/lib/mudar-status"

// O link "foi postado" que vai na cobrança a quem pediu (lib/cobranca-solicitante.ts).
// Sem login: a credencial é o token, que vale 14 dias e uma vez só. A empresa
// vem do token (org_por_credencial 'postagem', que já ignora o vencido); token
// inválido, vencido ou de outra empresa respondem o mesmo 404.

type Params = { params: Promise<{ token: string }> }
const naoEncontrado = () => NextResponse.json({ error: "Link não encontrado ou vencido." }, { status: 404 })
const semCache = { "Cache-Control": "private, no-store" }

async function demandaDoToken(org: string, token: string) {
  return prisma.demanda.findFirst({
    where: { organizacaoId: org, postagemToken: token, postagemTokenExpiraEm: { gt: new Date() } },
    select: {
      id: true, codigo: true, titulo: true, area: true, statusInterno: true, solicitanteId: true,
      nomeSolicitante: true, solicitante: { select: { nome: true } },
    },
  })
}

// GET — o que a página mostra: código, título e se ainda espera a confirmação.
export async function GET(req: NextRequest, { params }: Params) {
  const barrado = await barrarTokenPublico(req.headers, "postagem", "leitura")
  if (barrado) return barrado
  const { token } = await params
  const org = await orgPorCredencial("postagem", token)
  if (!org) return naoEncontrado()
  return comOrg(org, async () => {
    const d = await demandaDoToken(org, token)
    if (!d) return naoEncontrado()
    return NextResponse.json({
      codigo: d.codigo, titulo: d.titulo, ehArte: d.area === "design",
      nome: (d.nomeSolicitante || d.solicitante?.nome || "").trim().split(/\s+/)[0] || null,
      esperando: STATUS_ANTES_DO_POSTADO.includes(d.statusInterno),
      postado: d.statusInterno === "postado",
    }, { headers: semCache })
  })
}

const entrada = z.object({
  tipo: z.enum(["feed", "story", "reels", "youtube", "outro"]).optional().nullable(),
  link: z.string().trim().max(500).url().refine((v) => /^https?:\/\//i.test(v), "Link inválido").optional().nullable().or(z.literal("")),
}).strict()

// POST — "Sim, foi postado". O mesmo caminho do "Marcar como postado" do quadro
// (lib/mudar-status.ts), em nome de quem pediu, e o link deixa de valer.
export async function POST(req: NextRequest, { params }: Params) {
  const barrado = await barrarTokenPublico(req.headers, "postagem", "escrita")
  if (barrado) return barrado
  const { token } = await params
  let corpo: z.infer<typeof entrada>
  try {
    corpo = entrada.parse(await req.json().catch(() => ({})))
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "Confira o link da postagem." }, { status: 400 })
    throw e
  }
  const org = await orgPorCredencial("postagem", token)
  if (!org) return naoEncontrado()
  return comOrg(org, async () => {
    const d = await demandaDoToken(org, token)
    if (!d) return naoEncontrado()
    if (d.statusInterno === "postado") return NextResponse.json({ ok: true, jaEstava: true })
    const nome = d.nomeSolicitante || d.solicitante?.nome
    const r = await mudarStatus({ user: { id: d.solicitanteId, organizacaoId: org } }, d.id, {
      statusInterno: "postado",
      postagemTipo: corpo.tipo || "outro",
      ...(corpo.link ? { linkPostagem: corpo.link } : {}),
      observacao: `Postagem confirmada${nome ? ` por ${nome}` : ""} pelo link da cobrança (sem login).`,
    }, { organizacaoId: org })
    if (!r.ok) return NextResponse.json({ error: (await r.json().catch(() => ({})) as { error?: string }).error ?? "Não foi possível confirmar." }, { status: r.status })
    // Uma vez só: o link para de valer depois de usado.
    await prisma.$executeRaw`UPDATE demandas SET "postagemToken"=NULL, "postagemTokenExpiraEm"=NULL WHERE id=${d.id} AND "organizacaoId"=${org}`
    return NextResponse.json({ ok: true })
  })
}
