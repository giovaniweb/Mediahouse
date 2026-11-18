/**
 * Helpers para criação automática de usuários (videomakers/editores)
 */

import { prisma } from "@/lib/prisma"
import { SENHA_PENDENTE } from "@/lib/convite-equipe"
import { PRESETS } from "@/lib/permissoes"
import { setPermissoes } from "@/lib/permissoes-server"
import { dimensoesParaTipo } from "@/lib/pessoas"
import { criarUsuarioComVinculo, usuarioIdPorEmail, usuarioIdPorTelefone } from "@/lib/criar-usuario"

const SELECT_PESSOA = { id: true, nome: true, email: true, telefone: true } as const

interface CriarUsuarioParams {
  nome: string
  email?: string | null
  telefone?: string | null
  tipo: "videomaker" | "editor" | "designer"
  /** ID do videomaker, editor ou designer para vincular */
  referenciaId?: string
  /** Org que está cadastrando — cria a membership (UsuarioOrganizacao) explícita */
  organizacaoId: string
}

// Garante a membership do usuário na org com papel + dimensões (categoria/função/áreas)
// derivadas do tipo. Idempotente: ao já existir, só preenche campos vazios — não
// sobrescreve edições manuais (categoria já definida ou áreas já preenchidas).
async function garantirMembership(usuarioId: string, organizacaoId: string, papel: CriarUsuarioParams["tipo"]) {
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

  // Verificar se já existe por email (se tiver) ou por telefone. A busca vê a
  // plataforma inteira: a pessoa pode ter sido cadastrada por outra empresa, e
  // sob RLS o cliente normal não a encontraria (ver src/lib/criar-usuario.ts).
  const existenteId = emailLogin
    ? await usuarioIdPorEmail(emailLogin)
    : telefone ? await usuarioIdPorTelefone(telefone.replace(/\D/g, "")) : null
  if (existenteId) {
    // Mesmo já existindo, garante a membership na org que está cadastrando —
    // e é ela que torna a pessoa legível para esta empresa logo abaixo.
    await garantirMembership(existenteId, organizacaoId, tipo)
    const existe = await prisma.usuario.findUniqueOrThrow({ where: { id: existenteId }, select: SELECT_PESSOA })
    return { usuario: existe, jáExistia: true }
  }

  // Sem senha (auditoria de 18/11/2026). Até aqui a conta nascia com
  // "nuflow" + os 4 últimos dígitos do telefone, mandada pelo WhatsApp: quem
  // soubesse o telefone entrava. Agora nasce com SENHA_PENDENTE — não é hash
  // bcrypt, então nenhuma senha confere — e a pessoa cria a dela pelo link
  // ("Enviar acesso" do videomaker; convite por e-mail do editor).
  const senhaHash = SENHA_PENDENTE

  // Criar usuario (email pode ser null — login será pelo telefone), já com a
  // membership explícita na org que está cadastrando (multiempresa).
  const dim = dimensoesParaTipo(tipo)
  const usuario = await criarUsuarioComVinculo(
    organizacaoId,
    { nome, email: emailLogin, telefone, tipo, senhaHash },
    { papel: tipo, categoria: dim.categoria, funcaoProfissional: dim.funcaoProfissional, areas: dim.areas },
    SELECT_PESSOA
  )

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

  // Permissões do preset, válidas NESTA empresa. Vem depois da membership de
  // propósito: a permissão pertence ao vínculo, não à pessoa — sem empresa não
  // há permissão a conceder.
  await setPermissoes(usuario.id, organizacaoId, PRESETS[tipo] ?? {})

  return { usuario, jáExistia: false }
}
