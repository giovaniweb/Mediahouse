// "Enviar acesso" na ficha do videomaker (16/11/2026). Ver src/lib/acesso-videomaker.ts.
//
// GET  — a situação do acesso: tem conta? já criou senha? último envio e como
//        ficou o WhatsApp dele. Para onde o próximo envio vai, mascarado.
// POST — cria a conta (se não houver) e manda o link de criar senha pelo
//        WhatsApp (fila) e pelo e-mail real, se houver. O link anterior deixa
//        de valer; a mensagem anterior ainda na fila é cancelada.
//
// Só a gestão (admin/gestor) da empresa que tem o vínculo com ele. Os outros —
// videomaker, outra empresa, perfil aberto pela rede — recebem 404, como em
// "Empresa dele": não ficam sabendo que o cadastro existe.
//
// Conta compartilhada (a pessoa também está em outra empresa, como o Gabriel na
// GH Produção): o link vai só para o telefone e o e-mail da PRÓPRIA conta, nunca
// para o telefone do perfil, que a gestão desta empresa edita. Senão bastaria
// trocar o telefone na ficha para criar a senha da conta de outra empresa.
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { comOrg } from "@/lib/org-contexto"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { ehGestaoDaEmpresa } from "@/lib/parceria"
import { podeAdministrarIdentidade } from "@/lib/identidade-admin"
import { JANELA_REENVIO_SEG, PREFIXO_CHAVE, mascararEmail, mascararTelefone, situacaoDaConta } from "@/lib/acesso-videomaker"
import { contaDe, destinos, enviarAcessoVideomaker } from "@/lib/enviar-acesso-videomaker"

type Params = { params: Promise<{ id: string }> }
const naoEncontrado = () => NextResponse.json({ error: "Não encontrado" }, { status: 404 })

/** Gestão desta empresa e vínculo com o videomaker; o resto é 404. */
async function guarda(id: string) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  const usuarioId = session.user.id
  return comOrg(organizacaoId, async () => {
    const vinculo = await permissoesEfetivas(usuarioId, organizacaoId)
    if (!ehGestaoDaEmpresa(vinculo?.papel)) return naoEncontrado()
    const vo = await prisma.videomakerOrganizacao.findUnique({
      where: { organizacaoId_videomakerId: { organizacaoId, videomakerId: id } },
      select: { status: true, emListaNegra: true, videomaker: { select: { id: true, nome: true, telefone: true, email: true, usuarioId: true } } },
    })
    if (!vo) return naoEncontrado()
    return { organizacaoId, usuarioId, vo }
  })
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const g = await guarda(id)
  if (g instanceof NextResponse) return g
  const { organizacaoId, usuarioId, vo } = g
  const vm = vo.videomaker
  const conta = await contaDe(vm.usuarioId)
  const compartilhada = conta ? !(await podeAdministrarIdentidade(usuarioId, organizacaoId, conta.id)) : false

  const [ultimo, saida, primeiroAceite] = await comOrg(organizacaoId, () => Promise.all([
    prisma.eventoAuditoria.findFirst({
      where: { organizacaoId, acao: "videomaker.acesso", recurso: "videomaker", recursoId: id, resultado: "sucesso" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, atorId: true },
    }),
    prisma.saidaWhatsapp.findFirst({
      where: { organizacaoId, chave: { startsWith: `${PREFIXO_CHAVE}${id}:` } },
      orderBy: { createdAt: "desc" },
      select: { estado: true, createdAt: true },
    }),
    // O primeiro aceite dos Termos no painel é a prova de que a pessoa entrou
    // (Onda 3, no ar desde 12/11/2026: antes disso não há registro de entrada).
    conta ? prisma.aceiteTermos.findFirst({
      where: { organizacaoId, titularTipo: "usuario", titularId: conta.id },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }) : null,
  ]))
  const quem = ultimo ? await comOrg(organizacaoId, () => prisma.usuario.findUnique({ where: { id: ultimo.atorId }, select: { nome: true } })) : null
  const d = destinos(vm, conta, compartilhada)

  return NextResponse.json({
    conta: situacaoDaConta(conta?.senhaHash, !!conta),
    entrouEm: primeiroAceite?.createdAt ?? null,
    compartilhada,
    ultimoEnvio: ultimo ? { em: ultimo.createdAt, por: quem?.nome ?? null, whatsapp: saida?.estado ?? null } : null,
    proximoEnvioEm: ultimo && Date.now() - ultimo.createdAt.getTime() < JANELA_REENVIO_SEG * 1000
      ? new Date(ultimo.createdAt.getTime() + JANELA_REENVIO_SEG * 1000) : null,
    destino: { whatsapp: mascararTelefone(d.telefone), email: mascararEmail(d.email) },
    bloqueio: vo.status === "pendente" ? "Aprove o cadastro primeiro: a aprovação já cria o acesso."
      : vo.emListaNegra ? "Ele está na lista negra desta empresa."
      : conta?.status === "inativo" ? "A conta dele está desativada."
      : !d.telefone && !d.email ? "Sem WhatsApp nem e-mail para mandar o acesso. Cadastre o telefone em Editar." : null,
  })
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const g = await guarda(id)
  if (g instanceof NextResponse) return g
  return enviarAcessoVideomaker(g)
}
