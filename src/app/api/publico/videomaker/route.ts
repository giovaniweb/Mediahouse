import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgPublica } from "@/lib/org"
import { gravarDadosPrivadosVideomaker } from "@/lib/videomaker-dados"
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

  // Duplicidade: e-mail vive no perfil global; CPF/CNPJ mora nos dados fiscais
  // por empresa desde que o perfil global parou de guardar dado privado.
  const [porEmail, porDocumento] = await Promise.all([
    data.email ? prisma.videomaker.findFirst({ where: { email: data.email }, select: { id: true } }) : null,
    data.cpfCnpj
      ? prisma.videomakerDadosFiscais.findFirst({ where: { cpfCnpj: data.cpfCnpj }, select: { id: true } })
      : null,
  ])

  if (porEmail || porDocumento) {
    return NextResponse.json({ error: "Já existe um cadastro com este e-mail ou CNPJ/CPF." }, { status: 409 })
  }

  // A organização que vai receber e aprovar este cadastro. Vem do `?org=` do
  // formulário; sem ele, `orgPublica` cai na Contourline (legado). É a MESMA org
  // que recebe o alerta logo abaixo — antes o alerta tinha dono e o dado não.
  const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))

  // Só o que é público entra no perfil global — ele é a rede compartilhada e vai
  // ser legível por qualquer empresa sob RLS. CPF, endereço, PIX e diária são
  // dados de quem contrata: vão para o vínculo, com PIX cifrado.
  const videomaker = await prisma.videomaker.create({
    data: {
      nome: data.nome,
      email: data.email,
      telefone: data.telefone,
      cidade: data.cidade,
      estado: data.estado,
      redesSociais: data.redesSociais,
      portfolio: data.portfolio || null,
      areasAtuacao: data.areasAtuacao,
      status: "pendente", // Aguarda aprovação interna
    },
    select: { id: true, nome: true, email: true },
  })

  const gravou = await gravarDadosPrivadosVideomaker({
    videomakerId: videomaker.id,
    organizacaoId,
    comercial: { valorDiaria: data.valorDiaria, observacoes: data.observacoes, status: "pendente" },
    fiscal: {
      cpfCnpj: data.cpfCnpj,
      razaoSocial: data.razaoSocial,
      nomeFantasia: data.nomeFantasia,
      representante: data.representante,
      endereco: data.endereco,
      chavePix: data.chavePix,
    },
  })
  if (!gravou) {
    console.error("[publico/videomaker] Cadastro sem organização — dado fiscal perdido:", videomaker.id)
  }

  // Alerta para a equipe revisar — vai para a MESMA organização que ficou com o
  // vínculo e os dados fiscais. Antes o alerta resolvia a org por um caminho
  // (Contourline fixa) e o dado por outro (nenhum), então quem era avisado não
  // era necessariamente quem tinha o cadastro.
  await prisma.alertaIA.create({
    data: {
      ...(organizacaoId ? { organizacaoId } : {}),
      tipoAlerta: "novo_videomaker_pendente",
      mensagem: `Novo videomaker cadastrado: ${data.nome} — aguarda análise e aprovação.`,
      severidade: "info",
      acaoSugerida: "Revisar cadastro e aprovar/recusar",
    },
  })

  return NextResponse.json({ ok: true, id: videomaker.id }, { status: 201 })
}
