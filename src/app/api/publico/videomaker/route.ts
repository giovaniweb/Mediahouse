import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// Rota pública — não requer autenticação
const schema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  cpfCnpj: z.string().min(11, "CNPJ/CPF inválido"),
  razaoSocial: z.string().optional(),
  nomeFantasia: z.string().optional(),
  representante: z.string().optional(),
  email: z.string().email("E-mail inválido"),
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
  const body = await req.json()
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  // Verifica se já tem cadastro com mesmo e-mail ou CNPJ
  const existente = await prisma.videomaker.findFirst({
    where: { OR: [{ email: data.email }, { cpfCnpj: data.cpfCnpj }] },
  })

  if (existente) {
    return NextResponse.json({ error: "Já existe um cadastro com este e-mail ou CNPJ/CPF." }, { status: 409 })
  }

  const videomaker = await prisma.videomaker.create({
    data: {
      nome: data.nome,
      cpfCnpj: data.cpfCnpj,
      razaoSocial: data.razaoSocial,
      nomeFantasia: data.nomeFantasia,
      representante: data.representante,
      email: data.email,
      telefone: data.telefone,
      cidade: data.cidade,
      estado: data.estado,
      endereco: data.endereco,
      chavePix: data.chavePix,
      valorDiaria: data.valorDiaria,
      redesSociais: data.redesSociais,
      portfolio: data.portfolio || null,
      areasAtuacao: data.areasAtuacao,
      observacoes: data.observacoes,
      status: "pendente", // Aguarda aprovação interna
    },
    select: { id: true, nome: true, email: true },
  })

  // Cria alerta interno para a equipe revisar
  await prisma.alertaIA.create({
    data: {
      tipoAlerta: "novo_videomaker_pendente",
      mensagem: `Novo videomaker cadastrado: ${data.nome} — aguarda análise e aprovação.`,
      severidade: "info",
      acaoSugerida: "Revisar cadastro e aprovar/recusar",
    },
  })

  return NextResponse.json({ ok: true, id: videomaker.id }, { status: 201 })
}
