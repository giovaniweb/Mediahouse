import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { encryptSecret, decryptSecret } from "@/lib/secret-crypto"

type Params = { params: Promise<{ id: string }> }

// Videomaker é global de propósito (rede de profissionais compartilhada entre
// clientes). O que NÃO pode ser global é quem edita: sem esta checagem, qualquer
// usuário logado de qualquer empresa alterava CPF/CNPJ, dados bancários, PIX e
// valor de diária de um profissional com quem nunca trabalhou.
//
// "Vínculo" aqui é derivado do histórico (demanda, custo ou cobertura em comum).
// Na fase de tenancy isso vira uma tabela VideomakerOrganizacao explícita.
// `undefined` significa "campo não enviado" e não pode virar UPDATE — senão uma
// edição parcial apagaria o que não veio no corpo.
function limparIndefinidos<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

function cifrarOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor) return null
  return encryptSecret(valor)
}

// Dado cifrado que não decifra não pode derrubar a tela: devolve nulo e registra.
function decifrarOuNulo(valor: string | null | undefined): string | null {
  if (!valor) return null
  try {
    return decryptSecret(valor)
  } catch (e) {
    console.error("[Videomaker] Falha ao decifrar dado fiscal:", e)
    return null
  }
}

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
    // Os campos sensíveis saem do perfil global e passam a vir das tabelas por
    // empresa, abaixo — assim uma empresa nunca lê o CPF/PIX que outra cadastrou.
    omit: {
      cpfCnpj: true,
      chavePix: true,
      dadosBancarios: true,
      razaoSocial: true,
      nomeFantasia: true,
      representante: true,
      endereco: true,
      listaNegraMotivo: true,
      valorDiaria: true,
      emListaNegra: true,
      observacoes: true,
    },
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

  const [vinculo, fiscais] = await Promise.all([
    prisma.videomakerOrganizacao.findUnique({
      where: { organizacaoId_videomakerId: { organizacaoId, videomakerId: id } },
    }),
    prisma.videomakerDadosFiscais.findUnique({
      where: { organizacaoId_videomakerId: { organizacaoId, videomakerId: id } },
    }),
  ])

  return NextResponse.json({
    videomaker: {
      ...vm,
      // Relação comercial desta empresa (diária, status, lista negra).
      valorDiaria: vinculo?.valorDiaria ?? null,
      emListaNegra: vinculo?.emListaNegra ?? false,
      listaNegraMotivo: vinculo?.listaNegraMotivo ?? null,
      observacoes: vinculo?.observacoes ?? null,
      // Fiscais desta empresa. `dadosBancarios` e `chavePix` ficam cifrados em
      // repouso e são decifrados só aqui, para quem tem vínculo.
      cpfCnpj: fiscais?.cpfCnpj ?? null,
      razaoSocial: fiscais?.razaoSocial ?? null,
      nomeFantasia: fiscais?.nomeFantasia ?? null,
      representante: fiscais?.representante ?? null,
      endereco: fiscais?.endereco ?? null,
      chavePix: decifrarOuNulo(fiscais?.chavePix),
      dadosBancarios: decifrarOuNulo(fiscais?.dadosBancarios),
    },
  })
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

  // A escrita segue as três camadas: perfil da rede, relação comercial da
  // empresa e dados fiscais da empresa. Nada sensível volta para o global.
  const vm = await prisma.videomaker.update({
    where: { id },
    data: {
      nome: body.nome,
      cidade: body.cidade,
      estado: body.estado,
      telefone: body.telefone,
      email: body.email,
      avaliacao: body.avaliacao,
      areasAtuacao: body.areasAtuacao,
      portfolio: body.portfolio,
    },
    omit: { cpfCnpj: true, chavePix: true, dadosBancarios: true },
  })

  const comercial = {
    status: body.status,
    valorDiaria: body.valorDiaria ? parseFloat(body.valorDiaria) : undefined,
    observacoes: body.observacoes,
    podeEditar: body.podeEditar,
    tipoContrato: body.tipoContrato,
    emListaNegra: body.emListaNegra,
    listaNegraMotivo: body.listaNegraMotivo,
  }
  await prisma.videomakerOrganizacao.upsert({
    where: { organizacaoId_videomakerId: { organizacaoId, videomakerId: id } },
    create: { organizacaoId, videomakerId: id, ...limparIndefinidos(comercial) },
    update: limparIndefinidos(comercial),
  })

  const fiscal = {
    cpfCnpj: body.cpfCnpj,
    razaoSocial: body.razaoSocial,
    nomeFantasia: body.nomeFantasia,
    representante: body.representante,
    endereco: body.endereco,
    chavePix: body.chavePix !== undefined ? cifrarOuNulo(body.chavePix) : undefined,
    dadosBancarios: body.dadosBancarios !== undefined ? cifrarOuNulo(body.dadosBancarios) : undefined,
  }
  if (Object.values(fiscal).some((v) => v !== undefined)) {
    await prisma.videomakerDadosFiscais.upsert({
      where: { organizacaoId_videomakerId: { organizacaoId, videomakerId: id } },
      create: { organizacaoId, videomakerId: id, ...limparIndefinidos(fiscal) },
      update: limparIndefinidos(fiscal),
    })
  }

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
