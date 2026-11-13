import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
// Painel de Super Admin: lista TODAS as empresas, por definição. Atravessa o
// isolamento pela conexão de dono, atrás de `requireSuperAdmin`.
// Ver src/lib/prisma-admin.ts.
import { prismaAdmin as prisma } from "@/lib/prisma-admin"
import { requireSuperAdmin } from "@/lib/org"
import { SLUG_PUBLICO, SUBDOMINIOS_RESERVADOS } from "@/lib/subdominio"
import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { semearPacoteInicial } from "@/lib/pacote-inicial"
import { prefixoValido, sugerirPrefixo } from "@/lib/codigo-demanda"
import { SENHA_PENDENTE, convitePendente, emailDoConvite, enviarEmailConvite, gerarTokenConvite, linkConvite } from "@/lib/convite-equipe"

// Gera um slug seguro (a-z0-9-, sem acentos) a partir do nome ou do slug
// digitado. O digitado também passa por aqui: até 30/10/2026 ele era gravado
// como veio, e uma empresa ganhou slug com espaço e acento — o link /c/ dela
// nunca abriu.
function gerarSlug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 40)
    .replace(/^-+|-+$/g, "")
}

// GET /api/admin/organizacoes — lista organizações (super-admin)
export async function GET() {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const orgs = await prisma.organizacao.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, nome: true, slug: true, logoUrl: true, ativo: true, createdAt: true, prefixoCodigo: true,
      _count: { select: { membros: true } },
    },
  })
  return NextResponse.json({ organizacoes: orgs })
}

// POST /api/admin/organizacoes — cria a empresa pronta para usar (super-admin).
// body: { nome, slug?, prefixoCodigo?, adminNome, adminEmail, veRede? }
//
// `veRede`: a empresa vê e escala os videomakers da rede (módulo "rede", pago).
// Sem marcar, nasce só com os próprios videomakers.
//
// Uma transação só (Onda 2A): empresa, pacote inicial (departamentos, tipos,
// checklists, linha "Geral"), administrador e o link de primeiro acesso dele.
// Se qualquer parte falhar, nada fica pela metade. O e-mail sai depois do
// commit — e-mail que falha não desfaz a empresa: a resposta traz o link para
// mandar por outro caminho.
export async function POST(req: NextRequest) {
  const session = await auth()
  const guard = await requireSuperAdmin(session)
  if (guard instanceof NextResponse) return guard

  const body = await req.json().catch(() => ({}))
  const nome = (typeof body.nome === "string" ? body.nome : "").trim().slice(0, 120)
  if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  let slug = gerarSlug((typeof body.slug === "string" && body.slug.trim()) || nome)
  if (!SLUG_PUBLICO.test(slug)) return NextResponse.json({ error: "Slug inválido: use letras, números e hífen." }, { status: 400 })

  const prefixoInformado = typeof body.prefixoCodigo === "string" ? body.prefixoCodigo.trim().toUpperCase() : ""
  if (prefixoInformado && !prefixoValido(prefixoInformado)) {
    return NextResponse.json({ error: "Prefixo do código: de 2 a 5 letras, sem números (ex.: GH)" }, { status: 400 })
  }
  const prefixoCodigo = prefixoInformado || sugerirPrefixo(nome)

  // O admin é obrigatório (Onda 2A): ou alguém que já tem conta, escolhido na
  // busca (adminUsuarioId), ou um e-mail que recebe o convite.
  const adminUsuarioId = typeof body.adminUsuarioId === "string" ? body.adminUsuarioId : ""
  const adminEmailDigitado = emailDoConvite(body.adminEmail)
  const adminNome = (typeof body.adminNome === "string" ? body.adminNome : "").trim().slice(0, 120)
  if (!adminUsuarioId && !adminEmailDigitado) {
    return NextResponse.json({ error: "Informe o administrador da empresa: escolha quem já tem conta ou digite um e-mail" }, { status: 400 })
  }

  // Garante unicidade do slug (sufixo incremental se necessário). Endereço
  // reservado do NuFlow (www, api, teste…) conta como ocupado.
  const base = slug
  for (let i = 2; SUBDOMINIOS_RESERVADOS.has(slug) || await prisma.organizacao.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = `${base}-${i}`
  }

  // E-mail sem diferenciar maiúsculas (como em src/lib/criar-usuario.ts): há
  // contas antigas gravadas com maiúscula, e o convite não pode criar a mesma
  // pessoa de novo. Dois cadastros com o mesmo e-mail = pedir para escolher.
  const selecao = { id: true, nome: true, email: true, status: true, senhaHash: true } as const
  let existente: { id: string; nome: string; email: string | null; status: string; senhaHash: string } | null = null
  if (adminUsuarioId) {
    existente = await prisma.usuario.findUnique({ where: { id: adminUsuarioId }, select: selecao })
    if (!existente) return NextResponse.json({ error: "Pessoa escolhida não encontrada" }, { status: 404 })
    if (!existente.email) return NextResponse.json({ error: "Essa pessoa não tem e-mail. Cadastre o e-mail dela antes." }, { status: 400 })
  } else {
    const achados = await prisma.usuario.findMany({
      where: { email: { equals: adminEmailDigitado!, mode: "insensitive" } },
      select: selecao,
      take: 2,
    })
    if (achados.length > 1) {
      return NextResponse.json({ error: "Há mais de um cadastro com esse e-mail. Escolha a pessoa na busca." }, { status: 409 })
    }
    existente = achados[0] ?? null
  }
  const adminEmail = existente?.email ?? adminEmailDigitado!
  if (existente?.status === "inativo") {
    return NextResponse.json({ error: "Esse e-mail é de uma conta desativada. Reative a pessoa antes ou use outro e-mail." }, { status: 409 })
  }
  if (!existente && !adminNome) return NextResponse.json({ error: "Informe o nome do administrador" }, { status: 400 })

  const resultado = await prisma.$transaction(async (tx) => {
    const org = await tx.organizacao.create({
      data: { nome, slug, ativo: true, prefixoCodigo },
      select: { id: true, nome: true, slug: true, ativo: true, createdAt: true, prefixoCodigo: true },
    })
    const pacote = await semearPacoteInicial(tx, org.id)
    // Linha explícita, ligada ou não: na tela de módulos aparece como decidido
    // na criação, e não como "seguindo o padrão".
    await tx.moduloOrganizacao.create({ data: { organizacaoId: org.id, modulo: "rede", ativo: body.veRede === true } })

    const usuario = existente ?? await tx.usuario.create({
      data: { nome: adminNome, email: adminEmail, senhaHash: SENHA_PENDENTE, tipo: "admin" },
      select: { id: true, nome: true, status: true, senhaHash: true },
    })
    await tx.usuarioOrganizacao.create({
      data: {
        usuarioId: usuario.id, organizacaoId: org.id, papel: "admin",
        categoria: "interna", funcaoProfissional: "admin", recebeTodosAvisos: true,
      },
    })
    // Quem já tem senha (trabalha em outra empresa) só é avisado; quem não tem
    // recebe o link de primeiro acesso.
    const token = convitePendente(usuario.senhaHash) ? await gerarTokenConvite(tx, adminEmail) : null

    await registrarAuditoria(tx, { organizacaoId: org.id, usuarioId: session!.user!.id! }, {
      acao: "configuracao.alterada", recurso: "organizacao", recursoId: org.id, correlationId: correlacaoAuditoria(),
    })
    return { org, pacote, usuario, token }
  })

  const link = resultado.token ? linkConvite(resultado.token) : null
  const email = await enviarEmailConvite({
    para: adminEmail, nome: resultado.usuario.nome, empresa: resultado.org.nome, papel: "admin", link,
  })

  return NextResponse.json({
    organizacao: resultado.org,
    pacote: resultado.pacote,
    admin: { usuarioId: resultado.usuario.id, nome: resultado.usuario.nome, email: adminEmail, jaTinhaConta: !resultado.token },
    convite: { enviado: email.ok, erro: email.ok ? null : email.error ?? "Falha ao enviar o e-mail", link },
  }, { status: 201 })
}
