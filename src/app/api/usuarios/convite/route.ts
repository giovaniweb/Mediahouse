import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
// O link de primeiro acesso mora em `password_reset_tokens`, que só o papel de
// autenticação grava (é a tabela da recuperação de senha).
import { prismaAuth } from "@/lib/prisma-auth"
import type { AreaAtuacao } from "@prisma/client"
import { comOrg } from "@/lib/org-contexto"
import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { criarUsuarioComVinculo, usuarioIdPorTelefone } from "@/lib/criar-usuario"
import {
  SENHA_PENDENTE, convitePendente, ehPapelConvite, emailDoConvite, enviarEmailConvite, gerarTokenConvite, linkConvite,
} from "@/lib/convite-equipe"

const AREAS: AreaAtuacao[] = ["audiovisual", "growth", "eventos"]

// POST /api/usuarios/convite — convida alguém para a equipe por e-mail (Onda 2A).
// body: { email, nome?, papel, telefone?, areas? }
//
// Três casos, pelo e-mail:
// - ninguém usa: a pessoa nasce com o convite pendente e recebe o link para
//   criar a senha (7 dias);
// - já está na equipe com o convite pendente: manda um link novo (reenviar);
// - tem conta em outra empresa: entra nesta com o papel escolhido e é avisada
//   por e-mail; a senha continua a dela.
// A criação manual, com senha digitada, segue em POST /api/usuarios.
export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarUsuarios")
  if (acesso instanceof NextResponse) return acesso
  const { organizacaoId, usuarioId: quemConvida } = acesso

  const body = await req.json().catch(() => ({}))
  const email = emailDoConvite(body.email)
  if (!email) return NextResponse.json({ error: "Informe um e-mail válido" }, { status: 400 })
  const papel = body.papel
  if (!ehPapelConvite(papel)) return NextResponse.json({ error: "Escolha o papel da pessoa" }, { status: 400 })
  // Só admin cria admin: gestor convidando admin seria promoção por tabela.
  if (papel === "admin" && acesso.papel !== "admin") {
    return NextResponse.json({ error: "Só um administrador pode convidar outro administrador" }, { status: 403 })
  }
  const nome = (typeof body.nome === "string" ? body.nome : "").trim().slice(0, 120)
  const areas = Array.isArray(body.areas) ? (body.areas as string[]).filter((a): a is AreaAtuacao => AREAS.includes(a as AreaAtuacao)) : []

  const [empresa, convidante] = await comOrg(organizacaoId, () => Promise.all([
    prisma.organizacao.findUnique({ where: { id: organizacaoId }, select: { nome: true } }),
    prisma.usuario.findUnique({ where: { id: quemConvida }, select: { nome: true } }),
  ]))
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 })

  let usuario: { id: string; nome: string }
  let pendente: boolean
  let reenvio = false
  // Pessoa criada agora, nesta empresa, por este convite. Só para ela o link de
  // primeiro acesso pode voltar na resposta (revisão do #142).
  let criadaAgora = false
  // O e-mail como está gravado: o token de senha casa o e-mail exato
  // (redefinir_senha_por_token), então a conta antiga com maiúscula recebe o
  // token com a grafia dela.
  let emailDaConta = email

  // Sem diferença de maiúscula: o e-mail digitado é normalizado, mas há contas
  // antigas gravadas com maiúscula (1 em produção em 12/11/2026). A busca exata
  // não as achava e o convite criava uma segunda identidade. A identidade é lida
  // pelo cliente de autenticação: a pessoa pode ainda não ser desta empresa.
  const contas = await prismaAuth.usuario.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, nome: true, email: true, status: true, senhaHash: true },
    take: 2,
  })
  if (contas.length > 1) {
    return NextResponse.json({ error: "Há mais de um cadastro com esse e-mail. Fale com o suporte do NuFlow para juntar antes de convidar." }, { status: 409 })
  }
  const conta = contas[0]
  if (conta) {
    if (conta.status === "inativo") {
      return NextResponse.json({ error: "Não foi possível convidar este e-mail. Fale com o suporte do NuFlow." }, { status: 409 })
    }
    const membro = await comOrg(organizacaoId, () => prisma.usuarioOrganizacao.findUnique({
      where: { usuarioId_organizacaoId: { usuarioId: conta.id, organizacaoId } }, select: { papel: true },
    }))
    pendente = convitePendente(conta.senhaHash)
    if (membro && !pendente) {
      return NextResponse.json({ error: "Essa pessoa já está na equipe e já criou a senha." }, { status: 409 })
    }
    if (!membro) {
      await comOrg(organizacaoId, () => prisma.usuarioOrganizacao.create({
        data: { usuarioId: conta.id, organizacaoId, papel, categoria: "interna", funcaoProfissional: papel, areas },
      }))
    }
    reenvio = !!membro
    usuario = { id: conta.id, nome: conta.nome }
    emailDaConta = conta.email ?? email
  } else {
    if (!nome) return NextResponse.json({ error: "Informe o nome da pessoa" }, { status: 400 })
    const telefone = typeof body.telefone === "string" && body.telefone.trim() ? body.telefone.trim().slice(0, 40) : null
    const digitos = telefone?.replace(/\D/g, "") ?? ""
    if (digitos.length >= 8 && await usuarioIdPorTelefone(digitos.slice(-9))) {
      return NextResponse.json({ error: "Esse telefone já é de outra conta. Convide sem o telefone ou use outro." }, { status: 409 })
    }
    usuario = await criarUsuarioComVinculo(
      organizacaoId,
      { nome, email, senhaHash: SENHA_PENDENTE, tipo: papel, telefone },
      { papel, categoria: "interna", funcaoProfissional: papel, areas },
      { id: true, nome: true }
    )
    pendente = true
    criadaAgora = true
  }

  const token = pendente ? await gerarTokenConvite(prismaAuth, emailDaConta) : null
  const link = token ? linkConvite(token) : null
  await comOrg(organizacaoId, () => prisma.$transaction((tx) => registrarAuditoria(tx, { organizacaoId, usuarioId: quemConvida }, {
    acao: "convite.criar", recurso: "usuario", recursoId: usuario.id, correlationId: correlacaoAuditoria(),
  })))
  const envio = await enviarEmailConvite({ para: emailDaConta, nome: usuario.nome, empresa: empresa.nome, papel, link, convidadoPor: convidante?.nome })

  return NextResponse.json({
    usuario: { ...usuario, email: emailDaConta },
    convite: {
      enviado: envio.ok,
      reenvio,
      jaTinhaConta: !pendente,
      erro: envio.ok ? null : envio.error ?? "Falha ao enviar o e-mail",
      // Só quando o e-mail não saiu e só para quem nasceu agora por este
      // convite. Uma conta que já existia (pendente de outra empresa, ou o
      // reenvio de alguém daqui) pode ser a mesma identidade de outra empresa:
      // devolver o token a quem convida deixaria essa pessoa criar a senha da
      // conta alheia e entrar como ela nas duas. Para essas, o link vai só ao
      // e-mail da própria pessoa.
      link: envio.ok || !criadaAgora ? null : link,
    },
  }, { status: reenvio ? 200 : 201 })
}
