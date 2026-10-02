import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgPublica } from "@/lib/org"
import { cifrarOuNulo } from "@/lib/videomaker-dados"
import { z } from "zod"
import { declararOrg } from "@/lib/org-contexto"

// Rota pública — não requer autenticação
const schema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  cpfCnpj: z.string().min(11, "CNPJ/CPF inválido"),
  razaoSocial: z.string().optional(),
  nomeFantasia: z.string().optional(),
  representante: z.string().optional(),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  telefone: z.string().min(10, "Telefone inválido"),
  cidade: z.string().min(2, "Cidade é obrigatória"),
  estado: z.string().min(2, "Estado é obrigatório"),
  endereco: z.string().optional(),
  chavePix: z.string().optional(),
  valorDiaria: z.number().positive().optional(),
  redesSociais: z.array(z.string()).default([]),
  portfolio: z.string().url("URL do portfólio inválida").optional().or(z.literal("")),
  areasAtuacao: z.array(z.string()).default([]),
  observacoes: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))
  if (!organizacaoId) return NextResponse.json({ error: "Cadastro indisponível para esta empresa. Confira o link recebido." }, { status: 503 })
  declararOrg(organizacaoId)
  const [porEmail, porDocumento] = await Promise.all([
    prisma.videomaker.findFirst({ where: { email: data.email }, select: { id: true } }),
    prisma.videomakerDadosFiscais.findFirst({ where: { organizacaoId, cpfCnpj: data.cpfCnpj }, select: { id: true } }),
  ])
  if (porEmail || porDocumento) return NextResponse.json({ error: "Já existe um cadastro com este e-mail ou CNPJ/CPF." }, { status: 409 })

  try {
  // Cifrar antes de qualquer escrita; todas as gravações abaixo são atômicas.
  const chavePix = cifrarOuNulo(data.chavePix)
  const videomaker = await prisma.$transaction(async tx => {
    const criado = await tx.videomaker.create({
      data: {
        nome: data.nome, email: data.email, telefone: data.telefone,
        cidade: data.cidade, estado: data.estado, redesSociais: data.redesSociais,
        portfolio: data.portfolio || null, areasAtuacao: data.areasAtuacao, status: "pendente",
        vinculos: { create: { organizacaoId, valorDiaria: data.valorDiaria, observacoes: data.observacoes, status: "pendente" } },
        dadosFiscais: { create: { organizacaoId, cpfCnpj: data.cpfCnpj, razaoSocial: data.razaoSocial,
          nomeFantasia: data.nomeFantasia, representante: data.representante, endereco: data.endereco, chavePix } },
      }, select: { id: true },
    })
    await tx.alertaIA.create({ data: { organizacaoId, tipoAlerta: "novo_videomaker_pendente",
      mensagem: `Novo videomaker cadastrado: ${data.nome} — aguarda análise e aprovação.`,
      severidade: "info", acaoSugerida: "Revisar cadastro e aprovar/recusar" } })
    return criado
  })
  return NextResponse.json({ ok: true, id: videomaker.id }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Não foi possível concluir o cadastro. Seus dados não foram gravados. Tente novamente mais tarde." }, { status: 503 })
  }
}
