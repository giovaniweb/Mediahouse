import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

type Params = { params: Promise<{ id: string }> }

// Videomaker é global de propósito (rede de profissionais compartilhada entre
// clientes). O que NÃO pode ser global é quem edita: sem esta checagem, qualquer
// usuário logado de qualquer empresa alterava CPF/CNPJ, dados bancários, PIX e
// valor de diária de um profissional com quem nunca trabalhou.
//
// "Vínculo" aqui é derivado do histórico (demanda, custo ou cobertura em comum).
// Na fase de tenancy isso vira uma tabela VideomakerOrganizacao explícita.
async function temVinculoComOrg(videomakerId: string, organizacaoId: string): Promise<boolean> {
  const [demandas, custos] = await Promise.all([
    prisma.demanda.count({ where: { videomakerId, organizacaoId } }),
    prisma.custoVideomaker.count({ where: { videomakerId, organizacaoId } }),
  ])
  return demandas > 0 || custos > 0
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { id } = await params

  const vm = await prisma.videomaker.findUnique({
    where: { id },
    include: {
      // Só as demandas DESTA empresa: antes, o perfil do videomaker era uma
      // janela para o pipeline de todos os clientes que já o contrataram.
      demandas: {
        where: { organizacaoId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, codigo: true, titulo: true, statusVisivel: true,
          statusInterno: true, prioridade: true, createdAt: true,
        },
      },
    },
  })

  if (!vm) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  return NextResponse.json({ videomaker: vm })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  if (!ehGestor(session)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const { id } = await params

  if (!(await temVinculoComOrg(id, organizacaoId))) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  const body = await req.json()

  const vm = await prisma.videomaker.update({
    where: { id },
    data: {
      nome: body.nome,
      cidade: body.cidade,
      estado: body.estado,
      telefone: body.telefone,
      email: body.email,
      cpfCnpj: body.cpfCnpj,
      valorDiaria: body.valorDiaria ? parseFloat(body.valorDiaria) : undefined,
      dadosBancarios: body.dadosBancarios,
      status: body.status,
      avaliacao: body.avaliacao,
      observacoes: body.observacoes,
      areasAtuacao: body.areasAtuacao,
      portfolio: body.portfolio,
      podeEditar: body.podeEditar,
      tipoContrato: body.tipoContrato,
    },
  })

  return NextResponse.json(vm)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  // Excluir apaga o profissional da REDE inteira, não só desta empresa — daí o
  // gate mais estrito: admin/gestor e apenas de quem já trabalhou com ele.
  if (!ehGestor(session)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const { id } = await params

  if (!(await temVinculoComOrg(id, organizacaoId))) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  await prisma.videomaker.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
