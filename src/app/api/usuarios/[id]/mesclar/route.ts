import { podeAdministrarIdentidade, numeroDeEmpresasDaIdentidade } from "@/lib/identidade-admin"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { removerDaEmpresa } from "@/lib/remover-da-empresa"

type Params = { params: Promise<{ id: string }> }

// POST /api/usuarios/[principalId]/mesclar
// Body: { secundarioId }
// Mescla duas contas NA ORGANIZAÇÃO ATIVA: move demandas da org, copia dados faltantes e
// tira o secundário desta empresa (lib/remover-da-empresa.ts). A conta dele só é
// inativada se esta era a única empresa — as outras não são afetadas.
export async function POST(req: NextRequest, { params }: Params) {
  const acesso = await requireAcesso("gerenciarUsuarios")
  if (acesso instanceof NextResponse) return acesso

  const { organizacaoId } = acesso

  const { id: principalId } = await params
  const body = await req.json()
  const { secundarioId } = body

  if (!secundarioId) return NextResponse.json({ error: "secundarioId é obrigatório" }, { status: 400 })
  if (principalId === secundarioId) {
    return NextResponse.json({ error: "Principal e secundário não podem ser o mesmo" }, { status: 400 })
  }

  // Ambos precisam pertencer à organização ativa (membership).
  //
  // Uma consulta de cada vez, e não em Promise.all: com RLS ligado, dois
  // findUnique simultâneos no mesmo modelo devolvem null no segundo (medido em
  // tests/runtime/remover-da-empresa.spec.ts) — o Mesclar respondia 404 para
  // um secundário que existe.
  const memPrincipal = await prisma.usuarioOrganizacao.findUnique({ where: { usuarioId_organizacaoId: { usuarioId: principalId, organizacaoId } }, select: { id: true } })
  const memSecundario = await prisma.usuarioOrganizacao.findUnique({ where: { usuarioId_organizacaoId: { usuarioId: secundarioId, organizacaoId } }, select: { id: true } })
  if (!memPrincipal) return NextResponse.json({ error: "Usuário principal não encontrado nesta organização" }, { status: 404 })
  if (!memSecundario) return NextResponse.json({ error: "Usuário secundário não encontrado nesta organização" }, { status: 404 })

  const podeMesclar = await Promise.all([principalId, secundarioId].map(id => podeAdministrarIdentidade(acesso.usuarioId, organizacaoId, id)))
  if (podeMesclar.some(pode => !pode)) return NextResponse.json({ error: "Mesclar identidade compartilhada requer administração da plataforma" }, { status: 403 })

  const principal = await prisma.usuario.findUnique({ where: { id: principalId } })
  const secundario = await prisma.usuario.findUnique({ where: { id: secundarioId } })
  if (!principal || !secundario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  // Demandas a migrar: SOMENTE da organização ativa
  const qtdDemandas = await prisma.demanda.count({ where: { organizacaoId, solicitanteId: secundarioId } })
  // Em quantas orgs o secundário está? Define se inativa global ou só remove o vínculo daqui.
  const orgsDoSecundario = await numeroDeEmpresasDaIdentidade(secundarioId)
  const soNestaOrg = orgsDoSecundario <= 1

  const principalAtualizado = await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
    // 1. Copia dados faltantes para o principal
    const atualizado = await tx.usuario.update({
      where: { id: principalId },
      data: { email: principal.email ?? secundario.email, telefone: principal.telefone ?? secundario.telefone },
      select: { id: true, nome: true, email: true, telefone: true, tipo: true, status: true },
    })
    // 2. Move APENAS as demandas desta organização
    await tx.demanda.updateMany({
      where: { organizacaoId, solicitanteId: secundarioId },
      data: { solicitanteId: principalId },
    })
    // 3. O secundário sai desta empresa. Antes ele só era inativado e ficava aqui
    // com o mesmo WhatsApp do principal — o que bastava para travar todo aviso
    // para esse número.
    await removerDaEmpresa(tx, { usuarioId: secundarioId, organizacaoId, inativarConta: soNestaOrg })
    return atualizado
  }))

  return NextResponse.json({
    ok: true,
    principal: principalAtualizado,
    demandasMigradas: qtdDemandas,
    secundarioInativadoGlobal: soNestaOrg,
    mensagem: `Cadastros mesclados! ${qtdDemandas} demanda(s) desta organização migrada(s) para ${principal.nome}.`,
  })
}
