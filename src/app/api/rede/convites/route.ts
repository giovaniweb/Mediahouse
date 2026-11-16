import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { sendEmailNotificacao } from "@/lib/email"
import { empresaVeRede, SEM_MODULO_REDE } from "@/lib/videomakers-da-rede"

// POST /api/rede/convites — a empresa convida um videomaker da rede para entrar
// na lista dela. O profissional aceita ou recusa na área dele
// (/minhas-avaliacoes); só o "aceito" cria o vínculo e mostra o contato.
//
// O aviso vai por e-mail do NuFlow, não pelo WhatsApp da empresa: a mensagem de
// WhatsApp fica registrada nas conversas da empresa, com o número dele.
const schema = z.object({
  videomakerId: z.string().min(1).max(64),
  mensagem: z.string().trim().max(500).optional().nullable(),
})

function escapar(t: string): string {
  return t.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  if (!ehGestor(session)) return NextResponse.json({ error: "Só quem gerencia a equipe convida profissionais." }, { status: 403 })
  // Convidar pela rede é do módulo "rede" (pago, por empresa).
  if (!(await empresaVeRede(organizacaoId))) return NextResponse.json({ error: SEM_MODULO_REDE }, { status: 403 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Escolha o profissional a convidar." }, { status: 400 })
  const { videomakerId, mensagem } = parsed.data

  const vm = await prisma.videomaker.findUnique({
    where: { id: videomakerId },
    select: { nome: true, email: true, naRede: true, status: true, vinculos: { where: { organizacaoId }, select: { id: true } } },
  })
  if (!vm || !vm.naRede || vm.status === "pendente" || vm.status === "inativo") {
    return NextResponse.json({ error: "Este profissional não está disponível na rede." }, { status: 404 })
  }
  if (vm.vinculos.length) return NextResponse.json({ error: "Este profissional já está na sua lista." }, { status: 409 })

  try {
    await prisma.conviteRede.create({
      data: { organizacaoId, videomakerId, convidadoPorId: session.user.id, mensagem: mensagem || null },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Você já convidou este profissional. Falta a resposta." }, { status: 409 })
    }
    throw e
  }

  const org = await prisma.organizacao.findUnique({ where: { id: organizacaoId }, select: { nome: true } })
  const base = process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "")
  if (vm.email && base) {
    const empresa = escapar(org?.nome ?? "Uma empresa")
    await sendEmailNotificacao({
      destinatario: vm.email,
      assunto: `[NuFlow] ${org?.nome ?? "Uma empresa"} convidou você para a equipe dela`,
      evento: "convite-rede",
      html: `<p>Olá, ${escapar(vm.nome)}.</p>
<p><strong>${empresa}</strong> encontrou seu perfil na Rede de Profissionais do NuFlow e quer você na lista de profissionais dela.</p>
${mensagem ? `<p>Recado da empresa: “${escapar(mensagem)}”</p>` : ""}
<p>Se aceitar, a empresa passa a ver seu telefone e e-mail para chamar você para trabalhos. Se recusar, nada muda.</p>
<p><a href="${base}/minhas-avaliacoes">Responder ao convite</a></p>`,
    }).catch(err => console.error("[rede] aviso de convite não enviado:", (err as Error).message))
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
