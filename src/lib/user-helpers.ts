/**
 * Helpers para criação automática de usuários (videomakers/editores)
 */

import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { sendWhatsappMessage } from "@/lib/whatsapp"

/**
 * Gera senha padrão: nuflow + últimos 4 dígitos do telefone
 */
export function gerarSenhaPadrao(telefone: string | null | undefined): string {
  if (!telefone) return "nuflow0000"
  const digits = telefone.replace(/\D/g, "")
  const last4 = digits.slice(-4) || "0000"
  return `nuflow${last4}`
}

interface CriarUsuarioParams {
  nome: string
  email?: string | null
  telefone?: string | null
  tipo: "videomaker" | "editor"
  /** ID do videomaker ou editor para vincular */
  referenciaId?: string
}

/**
 * Cria um Usuario automaticamente para um videomaker/editor.
 * Email é opcional — o login pode ser feito apenas pelo telefone.
 */
export async function criarUsuarioParaProfissional(params: CriarUsuarioParams) {
  const { nome, email, telefone, tipo, referenciaId } = params

  // Email real se fornecido, senão null (login será feito pelo telefone)
  const emailLogin = email?.trim() || null

  // Verificar se já existe por email (se tiver) ou por telefone
  let existe = null
  if (emailLogin) {
    existe = await prisma.usuario.findUnique({ where: { email: emailLogin } })
  } else if (telefone) {
    const cleanDigits = telefone.replace(/\D/g, "")
    existe = await prisma.usuario.findFirst({
      where: {
        telefone: { contains: cleanDigits },
      },
    })
  }
  if (existe) return { usuario: existe, jáExistia: true, senha: null }

  // Gerar senha
  const senhaTexto = gerarSenhaPadrao(telefone)
  const senhaHash = await bcrypt.hash(senhaTexto, 12)

  // Criar usuario (email pode ser null — login será pelo telefone)
  const usuario = await prisma.usuario.create({
    data: {
      nome,
      email: emailLogin,
      telefone,
      tipo,
      senhaHash,
    },
  })

  // Vincular ao videomaker/editor
  if (referenciaId) {
    if (tipo === "videomaker") {
      await prisma.videomaker.update({
        where: { id: referenciaId },
        data: { usuarioId: usuario.id },
      })
    } else if (tipo === "editor") {
      await prisma.editor.update({
        where: { id: referenciaId },
        data: { usuarioId: usuario.id },
      })
    }
  }

  // Criar permissões básicas
  await prisma.permissaoUsuario.create({
    data: {
      usuarioId: usuario.id,
      // Páginas visíveis
      verDashboard: true,
      verDemandas: true,
      verAgenda: true,
      verAprovacoes: false,
      verProdutos: false,
      verVideomakers: false,
      verEquipe: false,
      verCustos: false,
      verIA: false,
      verAlertas: false,
      verRelatorios: false,
      verUsuarios: false,
      verConfiguracoes: false,
      verIdeias: false,
      // Ações
      criarDemanda: false,
      editarDemanda: false,
      excluirDemanda: false,
      moverKanban: false,
      verTodasDemandas: false,
      verKanban: true,
      gerenciarUsuarios: false,
      gerenciarConfig: false,
    },
  })

  return { usuario, jáExistia: false, senha: senhaTexto }
}

/**
 * Envia credenciais de acesso via WhatsApp.
 * Mostra telefone como login se não houver email real.
 */
export async function notificarCredenciaisWhatsapp(
  telefone: string,
  nome: string,
  emailLogin: string | null,
  senha: string,
) {
  const baseUrl = process.env.NEXTAUTH_URL || "https://nuflow.space"

  // Se tiver email real, mostrar email. Senão, mostrar telefone como login.
  const loginLine = emailLogin && !emailLogin.endsWith("@nuflow.local")
    ? `📧 *Login:* ${emailLogin}\n`
    : `📱 *Login:* seu número de telefone (${telefone})\n`

  const mensagem =
    `Olá, ${nome}! 👋\n\n` +
    `Seu acesso ao *NuFlow* foi criado:\n\n` +
    `🔗 *Link:* ${baseUrl}/login\n` +
    loginLine +
    `🔑 *Senha:* ${senha}\n\n` +
    `Recomendamos alterar sua senha no primeiro acesso. 🔒`

  try {
    await sendWhatsappMessage(telefone, mensagem)
    return true
  } catch (e) {
    console.error("[WhatsApp] Erro ao enviar credenciais:", e)
    return false
  }
}
