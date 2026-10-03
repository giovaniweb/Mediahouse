import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { criarUsuarioParaProfissional, notificarCredenciaisWhatsapp } from "@/lib/user-helpers"
import { getOrgId, semOrg } from "@/lib/org"
import { permissoesEfetivas } from "@/lib/permissoes-server"

// POST /api/videomakers/[id]/aprovar
// Aprova um videomaker pendente: ativa, cria conta de acesso e notifica via WhatsApp
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  // Papel do VÍNCULO desta empresa, não o tipo global da sessão.
  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  if (!vinculo || (vinculo.papel !== "admin" && vinculo.papel !== "gestor")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const { id } = await params

  // O perfil é da rede, mas a candidatura é desta empresa: só aprova quem
  // recebeu o candidato (vínculo pendente aqui). Antes bastava o perfil global
  // estar pendente, e gestor de qualquer empresa aprovava candidato alheio — com
  // as credenciais saindo pelo WhatsApp de quem aprovou.
  const vm = await prisma.videomaker.findFirst({
    where: { id, vinculos: { some: { organizacaoId, status: "pendente" } } },
  })
  if (!vm) return NextResponse.json({ error: "Candidato pendente não encontrado nesta empresa" }, { status: 404 })

  // 1. Ativar a relação com esta empresa e, se ainda pendente, o perfil da rede.
  // Juntos: perfil ativo com vínculo pendente deixava o comercial "pendente" para
  // sempre. A troca é condicional: dois cliques simultâneos não aprovam (nem
  // mandam credenciais) duas vezes.
  const aprovou = await prisma.$transaction(async (tx) => {
    const r = await tx.videomakerOrganizacao.updateMany({
      where: { organizacaoId, videomakerId: id, status: "pendente" },
      data: { status: "ativo" },
    })
    if (r.count !== 1) return false
    await tx.videomaker.updateMany({ where: { id, status: "pendente" }, data: { status: "ativo" } })
    return true
  })
  if (!aprovou) return NextResponse.json({ error: "Este candidato já foi aprovado" }, { status: 409 })

  // 2. Criar conta de acesso (se ainda não tem usuário vinculado)
  let senha: string | null = null
  let credenciaisEnviadas = false

  if (!vm.usuarioId) {
    const resultado = await criarUsuarioParaProfissional({
      nome: vm.nome,
      email: vm.email || null,
      telefone: vm.telefone,
      tipo: "videomaker",
      referenciaId: id,
      organizacaoId,
    })

    if (!resultado.jáExistia && resultado.senha) {
      senha = resultado.senha

      // 3. Notificar via WhatsApp com as credenciais
      if (vm.telefone) {
        credenciaisEnviadas = await notificarCredenciaisWhatsapp(
          vm.telefone,
          vm.nome,
          resultado.usuario.email,
          senha,
          organizacaoId,
        )
      }
    }
  }

  // 4. Alerta de aprovação (resolve o alerta pendente — escopado à org da sessão)
  await prisma.alertaIA.updateMany({
    where: {
      tipoAlerta: "novo_videomaker_pendente",
      status: "ativo",
      organizacaoId,
    },
    data: { status: "resolvido" },
  })

  return NextResponse.json({
    ok: true,
    contaCriada: !!senha,
    credenciaisEnviadas,
    mensagem: senha
      ? `✅ Videomaker aprovado! Conta criada e credenciais enviadas via WhatsApp.`
      : `✅ Videomaker aprovado! Conta de acesso já existia.`,
  })
}
