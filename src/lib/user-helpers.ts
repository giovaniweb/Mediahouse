/**
 * Helpers para criação automática de usuários (videomakers/editores)
 */

import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { PRESETS } from "@/lib/permissoes"
import { dimensoesParaTipo } from "@/lib/pessoas"

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
  tipo: "videomaker" | "editor" | "designer"
  /** ID do videomaker, editor ou designer para vincular */
  referenciaId?: string
  /** Org que está cadastrando — cria a membership (UsuarioOrganizacao) explícita */
  organizacaoId?: string | null
}

// Garante a membership do usuário na org com papel + dimensões (categoria/função/áreas)
// derivadas do tipo. Idempotente: ao já existir, só preenche campos vazios — não
// sobrescreve edições manuais (categoria já definida ou áreas já preenchidas).
async function garantirMembership(usuarioId: string, organizacaoId: string | null | undefined, papel: CriarUsuarioParams["tipo"]) {
  if (!organizacaoId) return
  const dim = dimensoesParaTipo(papel)
  const existente = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
    select: { id: true, funcaoProfissional: true, areas: true },
  })
  if (!existente) {
    await prisma.usuarioOrganizacao.create({
      data: { usuarioId, organizacaoId, papel, categoria: dim.categoria, funcaoProfissional: dim.funcaoProfissional, areas: dim.areas },
    })
    return
  }
  // Preenche só o que estiver vazio (preserva classificação manual prévia)
  const update: Record<string, unknown> = {}
  if (!existente.funcaoProfissional) update.funcaoProfissional = dim.funcaoProfissional
  if (!existente.areas || existente.areas.length === 0) update.areas = dim.areas
  if (Object.keys(update).length > 0) {
    await prisma.usuarioOrganizacao.update({ where: { id: existente.id }, data: update })
  }
}

/**
 * Cria um Usuario automaticamente para um videomaker/editor.
 * Email é opcional — o login pode ser feito apenas pelo telefone.
 */
export async function criarUsuarioParaProfissional(params: CriarUsuarioParams) {
  const { nome, email, telefone, tipo, referenciaId, organizacaoId } = params

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
  if (existe) {
    // Mesmo já existindo, garante a membership na org que está cadastrando.
    await garantirMembership(existe.id, organizacaoId, tipo)
    return { usuario: existe, jáExistia: true, senha: null }
  }

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

  // Vincular ao videomaker/editor/designer
  if (referenciaId) {
    if (tipo === "videomaker") {
      await prisma.videomaker.update({ where: { id: referenciaId }, data: { usuarioId: usuario.id } })
    } else if (tipo === "editor") {
      await prisma.editor.update({ where: { id: referenciaId }, data: { usuarioId: usuario.id } })
    } else if (tipo === "designer") {
      await prisma.designer.update({ where: { id: referenciaId }, data: { usuarioId: usuario.id } })
    }
  }

  // Criar permissões a partir do preset do tipo
  await prisma.permissaoUsuario.create({
    data: { usuarioId: usuario.id, ...(PRESETS[tipo] ?? {}) },
  })

  // Membership explícita na org que está cadastrando (multiempresa)
  await garantirMembership(usuario.id, organizacaoId, tipo)

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
  organizacaoId?: string | null,
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
    await sendWhatsappMessage(telefone, mensagem, undefined, organizacaoId)
    return true
  } catch (e) {
    console.error("[WhatsApp] Erro ao enviar credenciais:", e)
    return false
  }
}
