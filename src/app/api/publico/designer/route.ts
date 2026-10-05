import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { orgPublica } from "@/lib/org"
import { barrarExcesso } from "@/lib/limite-formulario"
import { declararOrg } from "@/lib/org-contexto"
import { cifrarOuNulo } from "@/lib/videomaker-dados"
import { linkDePortfolio } from "@/lib/cadastro-profissional"

// POST /api/publico/designer — "Quer ser um designer?", na área da empresa.
//
// O mesmo cadastro do videomaker (/api/publico/videomaker), com o mesmo corpo:
// o perfil é da rede (Designer, só o que é público), a candidatura e o
// combinado são da empresa (DesignerOrganizacao, "pendente"), e CPF/CNPJ,
// endereço, PIX e banco vão para DesignerDadosFiscais, com PIX e banco cifrados.
// A equipe aprova em Growth → Equipe. Não cria conta de acesso.
const schema = z.object({
  nome: z.string().trim().min(2, "Nome é obrigatório").max(120),
  cpfCnpj: z.string().trim().min(11, "CNPJ/CPF inválido").max(20),
  razaoSocial: z.string().max(200).optional(),
  nomeFantasia: z.string().max(200).optional(),
  representante: z.string().max(120).optional(),
  email: z.string().trim().email("E-mail inválido").max(160),
  telefone: z.string().trim().min(10, "Telefone inválido").max(30),
  cidade: z.string().trim().min(2, "Cidade é obrigatória").max(80),
  estado: z.string().trim().min(2, "Estado é obrigatório").max(2).transform(s => s.toUpperCase()),
  endereco: z.string().max(300).optional(),
  chavePix: z.string().max(200).optional(),
  dadosBancarios: z.string().max(300).optional(),
  valorDiaria: z.number().positive().optional(),
  redesSociais: z.array(z.string().max(200)).max(10).default([]),
  portfolio: z.string().max(300).optional()
    .refine(t => !t?.trim() || linkDePortfolio(t) !== null, "URL do portfólio inválida"),
  areasAtuacao: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  observacoes: z.string().max(2000).optional(),
})

const vazioViraNulo = (t: string | undefined) => t?.trim() || null

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))
  if (!organizacaoId) {
    return NextResponse.json({ error: "Cadastro indisponível no momento. Tente novamente em instantes." }, { status: 503 })
  }

  // Limite antes de qualquer leitura: o 409 abaixo não pode virar teste de
  // e-mail e CPF à vontade.
  const barrado = await barrarExcesso(req.headers, "designer", organizacaoId)
  if (barrado) return barrado

  declararOrg(organizacaoId)

  // Duplicidade só dentro desta empresa: o mesmo designer pode se candidatar a
  // outra empresa do NuFlow sem esbarrar no cadastro daqui.
  const [porEmail, porDocumento] = await Promise.all([
    prisma.designerOrganizacao.findFirst({ where: { organizacaoId, designer: { email: data.email } }, select: { id: true } }),
    prisma.designerDadosFiscais.findFirst({ where: { organizacaoId, cpfCnpj: data.cpfCnpj }, select: { id: true } }),
  ])
  if (porEmail || porDocumento) {
    return NextResponse.json({ error: "Já existe um cadastro com este e-mail ou CNPJ/CPF." }, { status: 409 })
  }

  const designer = await prisma.designer.create({
    data: {
      nome: data.nome,
      email: data.email,
      telefone: data.telefone,
      whatsapp: data.telefone,
      cidade: data.cidade,
      estado: data.estado,
      redesSociais: data.redesSociais.filter(r => r.trim()),
      portfolio: linkDePortfolio(data.portfolio),
      especialidade: data.areasAtuacao,
      status: "pendente",
      vinculos: {
        create: { organizacaoId, status: "pendente", valorDiaria: data.valorDiaria ?? null, observacoes: vazioViraNulo(data.observacoes) },
      },
      fiscais: {
        create: {
          organizacaoId,
          cpfCnpj: data.cpfCnpj,
          razaoSocial: vazioViraNulo(data.razaoSocial),
          nomeFantasia: vazioViraNulo(data.nomeFantasia),
          representante: vazioViraNulo(data.representante),
          endereco: vazioViraNulo(data.endereco),
          chavePix: cifrarOuNulo(data.chavePix?.trim()),
          dadosBancarios: cifrarOuNulo(data.dadosBancarios?.trim()),
        },
      },
    },
    select: { id: true },
  })

  await prisma.alertaIA.create({
    data: {
      organizacaoId,
      tipoAlerta: "novo_designer_pendente",
      mensagem: `Novo designer cadastrado: ${data.nome} — aguarda análise em Growth → Equipe.`,
      severidade: "info",
      acaoSugerida: "Revisar portfólio e aprovar/recusar",
    },
  })

  return NextResponse.json({ ok: true, id: designer.id }, { status: 201 })
}
