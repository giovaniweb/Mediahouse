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

/**
 * Gera um email único baseado no nome (quando o profissional não tem email)
 */
function gerarEmailFallback(nome: string): string {
  const slug = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
  return `${slug}@nuflow.local`
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
 * Cria um Usuario automaticamente para um videomaker/editor
 * Retorna o usuario criado, ou null se já existir
 */
export async function criarUsuarioParaProfissional(params: CriarUsuarioParams) {
  const { nome, email, telefone, tipo, referenciaId } = params

  // Determinar email para o login
  const emailLogin = email || gerarEmailFallback(nome)

  // Verificar se já existe
  const existe = await prisma.usuario.findUnique({ where: { email: emailLogin } })
  if (existe) return { usuario: existe, jáExistia: true, senha: null }

  // Gerar senha
  const senhaTexto = gerarSenhaPadrao(telefone)
  const senhaHash = await bcrypt.hash(senhaTexto, 12)

  // Criar usuario
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
 * Envia credenciais de acesso via WhatsApp
 */
export async function notificarCredenciaisWhatsapp(
  telefone: string,
  nome: string,
  emailLogin: string,
  senha: string,
) {
  const mensagem =
    `Olá, ${nome}! 👋\n\n` +
    `Seu acesso ao *NuFlow* foi criado:\n\n` +
    `🔗 *Link:* ${process.env.NEXTAUTH_URL || "https://nuflow.app"}/login\n` +
    `📧 *Login:* ${emailLogin}\n` +
    `🔑 *Senha:* ${senha}\n\n` +
    `Você também pode entrar usando seu número de telefone.\n\n` +
    `Recomendamos alterar sua senha no primeiro acesso. 🔒`

  try {
    await sendWhatsappMessage(telefone, mensagem)
    return true
  } catch (e) {
    console.error("[WhatsApp] Erro ao enviar credenciais:", e)
    return false
  }
}
