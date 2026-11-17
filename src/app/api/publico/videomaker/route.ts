import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgPublica } from "@/lib/org"
import { barrarExcesso } from "@/lib/limite-formulario"
import { gravarDadosPrivadosVideomaker } from "@/lib/videomaker-dados"
import { z } from "zod"
import { declararOrg } from "@/lib/org-contexto"
import { hashDoIp } from "@/lib/limite-publico"
import { registrarAceite } from "@/lib/juridico/aceite-servidor"
import { acrescentarCidades, listaDeCidades } from "@/lib/cidades-videomaker"
import { videomakersComOTelefone } from "@/lib/videomaker-duplicado"

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
  // Outras cidades ou regiões que atende, além da base (16/11/2026).
  cidadesAtendidas: z.union([z.array(z.string().max(80)).max(30), z.string().max(2000)]).optional(),
  // Resposta ao "este telefone já tem cadastro": acrescenta as cidades ao
  // cadastro que existe em vez de criar outro.
  acrescentarCidade: z.boolean().optional(),
  endereco: z.string().optional(),
  chavePix: z.string().optional(),
  dadosBancarios: z.string().max(300).optional(),
  valorDiaria: z.number().positive().optional(),
  redesSociais: z.array(z.string()).default([]),
  portfolio: z.string().url("URL do portfólio inválida").optional().or(z.literal("")),
  areasAtuacao: z.array(z.string()).default([]),
  observacoes: z.string().optional(),
  // Aceite dos Termos do Profissional e da Política de Privacidade: sem ele
  // não há cadastro (Onda 3). Gravado junto do perfil, como prova.
  aceiteTermos: z.literal(true, { message: "É preciso aceitar os Termos do Profissional e a Política de Privacidade." }),
})

export async function POST(req: NextRequest) {
  // Corpo que não é JSON vira 400 de validação, não 500.
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  // A organização que vai receber e aprovar este cadastro. Vem do `?org=` do
  // formulário; sem ele, não há empresa (nada de padrão). É a MESMA org
  // que recebe o alerta logo abaixo — antes o alerta tinha dono e o dado não.
  const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))
  if (!organizacaoId) {
    // Sem empresa não há para quem mandar o cadastro. Antes o perfil era criado
    // assim mesmo e o dado fiscal — CPF, endereço, PIX — era descartado com um
    // console.error: a pessoa preenchia tudo, via "cadastro enviado" e o que
    // importava não existia em lugar nenhum. Falhar aqui devolve o formulário
    // preenchido para ela tentar de novo.
    console.error("[publico/videomaker] Nenhuma organização resolvida — cadastro recusado.")
    return NextResponse.json(
      { error: "Cadastro indisponível no momento. Tente novamente em instantes." },
      { status: 503 }
    )
  }

  // O limite vem ANTES da conferência de duplicidade: sem ele, o 409 "já existe
  // um cadastro com este e-mail" servia para testar e-mails à vontade.
  const barrado = await barrarExcesso(req.headers, "videomaker", organizacaoId)
  if (barrado) return barrado

  // Mesmo telefone na mesma empresa = a mesma pessoa. Antes o videomaker que
  // atende várias cidades se cadastrava uma vez por cidade, e o número
  // repetido travava todo aviso de WhatsApp para ele. Aqui ele é avisado de que
  // já tem cadastro e pode acrescentar a cidade ao que existe.
  declararOrg(organizacaoId)
  const cidadesNovas = listaDeCidades([data.cidade, ...listaDeCidades(data.cidadesAtendidas ?? [])])
  const doTelefone = await videomakersComOTelefone(prisma, organizacaoId, data.telefone)
  if (doTelefone.length > 0) {
    if (!data.acrescentarCidade) {
      // Sem nome nem cidades do cadastro: quem digita só fica sabendo que o
      // número já está aqui (o limite acima segura a tentativa em série).
      return NextResponse.json({
        duplicado: true,
        error: "Este telefone já tem cadastro nesta empresa. Você pode acrescentar as cidades deste formulário ao seu cadastro, sem criar outro.",
      }, { status: 409 })
    }
    // O mais antigo ativo fica com as cidades; se já houver repetidos, a
    // gestão junta depois (scripts/juntar-videomakers-duplicados.mjs).
    const alvo = doTelefone.find(v => v.status !== "inativo") ?? doTelefone[0]
    const cidades = acrescentarCidades(alvo, cidadesNovas)
    const novas = cidades.filter(c => !alvo.cidadesAtendidas.includes(c))
    if (novas.length > 0) {
      await prisma.videomaker.update({ where: { id: alvo.id }, data: { cidadesAtendidas: cidades } })
      await prisma.alertaIA.create({
        data: {
          organizacaoId,
          tipoAlerta: "videomaker_cidade_acrescentada",
          mensagem: `${alvo.nome} acrescentou pelo formulário de cadastro: ${novas.join(", ")}.`,
          severidade: "info",
          acaoSugerida: "Conferir as cidades na ficha do videomaker",
        },
      })
    }
    return NextResponse.json({ ok: true, acrescentado: true, novas: novas.length }, { status: 200 })
  }

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

  // Sob RLS a empresa precisa ser DECLARADA: rota pública não tem sessão de
  // onde deduzi-la, e sem declaração o banco devolve vazio. Já foi declarada
  // acima, antes da conferência do telefone.

  // Só o que é público entra no perfil global — ele é a rede compartilhada e vai
  // ser legível por qualquer empresa sob RLS. CPF, endereço, PIX e diária são
  // dados de quem contrata: vão para o vínculo, com PIX cifrado.
  // Perfil e aceite na mesma transação: cadastro sem a prova do aceite não existe.
  const videomaker = await prisma.$transaction(async tx => {
    const criado = await tx.videomaker.create({
      data: {
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        cidade: data.cidade,
        cidadesAtendidas: listaDeCidades(data.cidadesAtendidas ?? [], data.cidade),
        estado: data.estado,
        redesSociais: data.redesSociais,
        portfolio: data.portfolio || null,
        areasAtuacao: data.areasAtuacao,
        status: "pendente", // Aguarda aprovação interna
      },
      select: { id: true, nome: true, email: true },
    })
    await registrarAceite(tx, { organizacaoId, tecnico: "cadastro.publico" }, {
      organizacaoId, titularTipo: "videomaker", titularId: criado.id,
      documentos: ["profissionais", "privacidade"], origem: "cadastro_videomaker", ipHash: hashDoIp(req.headers),
    })
    return criado
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
      dadosBancarios: data.dadosBancarios,
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
      organizacaoId,
      tipoAlerta: "novo_videomaker_pendente",
      mensagem: `Novo videomaker cadastrado: ${data.nome} — aguarda análise e aprovação.`,
      severidade: "info",
      acaoSugerida: "Revisar cadastro e aprovar/recusar",
    },
  })

  return NextResponse.json({ ok: true, id: videomaker.id }, { status: 201 })
}
