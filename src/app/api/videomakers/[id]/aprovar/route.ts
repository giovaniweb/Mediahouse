import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { criarUsuarioParaProfissional, notificarCredenciaisWhatsapp } from "@/lib/user-helpers"

// POST /api/videomakers/[id]/aprovar
// Aprova um videomaker pendente: ativa, cria conta de acesso e notifica via WhatsApp
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  if (!["admin", "gestor"].includes(session.user.tipo)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const { id } = await params

  const vm = await prisma.videomaker.findUnique({ where: { id } })
  if (!vm) return NextResponse.json({ error: "Videomaker não encontrado" }, { status: 404 })
  if (vm.status !== "pendente") {
    return NextResponse.json({ error: "Videomaker não está pendente" }, { status: 400 })
  }

  // 1. Ativar o videomaker
  await prisma.videomaker.update({
    where: { id },
    data: { status: "ativo" },
  })

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
        )
      }
    }
  }

  // 4. Alerta de aprovação (resolve o alerta pendente)
  await prisma.alertaIA.updateMany({
    where: {
      tipoAlerta: "novo_videomaker_pendente",
      status: "ativo",
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
