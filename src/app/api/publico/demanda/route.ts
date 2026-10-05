import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { emSegundoPlano } from "@/lib/notificar"
import { z } from "zod"
import { calcularPeso } from "@/lib/peso-demanda"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { orgPublica } from "@/lib/org"
import { barrarExcesso } from "@/lib/limite-formulario"
import { notificarLideresAudiovisual } from "@/lib/lideres-audiovisual"
import { validarPrazo } from "@/lib/datas"
import { erroDeZod } from "@/lib/erros-api"
import { gerarTokenAnexo } from "@/lib/anexo-token"
import { declararOrg } from "@/lib/org-contexto"
import { criarUsuarioComVinculo, usuarioIdPorEmail, usuarioIdPorTelefone } from "@/lib/criar-usuario"
import { criarComCodigoUnico } from "@/lib/codigo-demanda"

// Rota pública — não requer autenticação
const schema = z.object({
  nomeCliente: z.string().min(2, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  telefone: z.string().min(10, "Telefone inválido"),
  empresa: z.string().optional(),
  titulo: z.string().trim().min(3, "O título precisa ter pelo menos 3 caracteres."),
  descricao: z.string().trim().min(10, "A descrição precisa ter pelo menos 10 caracteres."),
  tipoVideo: z.string().min(1),
  cidade: z.string().optional().default("N/A"),
  // Formulário público também é porta de entrada de prazo — antes gravava
  // qualquer string sem checagem nenhuma.
  dataLimite: z
    .string()
    .optional()
    .superRefine((valor, ctx) => {
      const r = validarPrazo(valor)
      if (!r.ok) ctx.addIssue({ code: "custom", message: r.motivo })
    }),
  dataEvento: z.string().optional(),
  localEvento: z.string().optional(),
  referencia: z.string().optional(),
  // Cobertura — cliente final
  clienteFinalNome: z.string().optional(),
  clienteFinalTelefone: z.string().optional(),
  clienteFinalEmail: z.string().optional(),
  // O que o cliente precisa → roteia a área correta (sem linguagem interna)
  tipoSolicitacao: z.enum(["video", "conteudo", "cobertura"]).optional(),
  objetivo: z.string().optional(),
  detalhesEntrega: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: NextRequest) {
  // Corpo que não é JSON vira 400 de validação, não 500.
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return erroDeZod(parsed.error)
  }

  const data = parsed.data

  // `?org=<slug>` identifica a empresa dona do formulário (o portal /c/<slug>
  // sempre manda); sem ele, a padrão — os links antigos da Contourline.
  const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))
  if (!organizacaoId) {
    return NextResponse.json({ error: "Organização não encontrada. Verifique o link do formulário." }, { status: 404 })
  }

  // Antes de criar o solicitante, a demanda e o aviso aos gestores: 20 pedidos
  // por hora por empresa e IP.
  const barrado = await barrarExcesso(req.headers, "demanda", organizacaoId)
  if (barrado) return barrado

  // Sob RLS a empresa precisa ser DECLARADA: rota pública não tem sessão de
  // onde deduzi-la, e sem declaração o banco devolve vazio. Vem antes da busca
  // do solicitante — antes, a busca rodava sem empresa e nunca achava ninguém.
  declararOrg(organizacaoId)

  // Busca ou cria usuário solicitante externo
  // Prioridade: telefone (evita duplicatas), depois email. A busca enxerga a
  // plataforma inteira: o cliente pode já ter conta por outra empresa, e o
  // e-mail é único na plataforma (ver src/lib/criar-usuario.ts).
  const telDigits = data.telefone.replace(/\D/g, "")
  let solicitanteId = telDigits.length >= 8 ? await usuarioIdPorTelefone(telDigits.slice(-9)) : null
  if (!solicitanteId) solicitanteId = await usuarioIdPorEmail(data.email)

  let solicitante: { id: string }
  if (!solicitanteId) {
    const { randomBytes } = await import("crypto")
    const bcrypt = (await import("bcryptjs")).default
    const tempSenha = randomBytes(16).toString("hex")
    const senhaHash = await bcrypt.hash(tempSenha, 10)

    // Nasce já com a membership de solicitante: sem ela a pessoa não apareceria
    // em Pessoas & Acessos — e, sob RLS, nem poderia ser lida de volta.
    solicitante = await criarUsuarioComVinculo(
      organizacaoId,
      { nome: data.nomeCliente, email: data.email, telefone: data.telefone, tipo: "solicitante", senhaHash },
      { papel: "solicitante", categoria: "solicitante", funcaoProfissional: null, areas: [] },
      { id: true }
    )
  } else {
    // Garante a membership do solicitante na organização (categoria=solicitante).
    // Vem antes de ler e atualizar a pessoa: é o vínculo que a torna visível
    // para esta empresa.
    await prisma.usuarioOrganizacao.upsert({
      where: { usuarioId_organizacaoId: { usuarioId: solicitanteId, organizacaoId } },
      update: {},
      create: { usuarioId: solicitanteId, organizacaoId, papel: "solicitante", categoria: "solicitante", funcaoProfissional: null, areas: [] },
    })
    const existente = await prisma.usuario.findUniqueOrThrow({
      where: { id: solicitanteId },
      select: { id: true, telefone: true, email: true },
    })
    // Atualiza dados faltantes no cadastro existente
    const updates: Record<string, string> = {}
    if (!existente.telefone && data.telefone) updates.telefone = data.telefone
    if (!existente.email && data.email) updates.email = data.email
    if (Object.keys(updates).length > 0) {
      await prisma.usuario.update({ where: { id: existente.id }, data: updates })
    }
    solicitante = existente
  }

  // Roteia a área/departamento conforme o que o cliente escolheu ("O que você precisa?")
  const isCobertura = data.tipoSolicitacao === "cobertura" || data.tipoVideo === "cobertura_evento"
  const isConteudo = data.tipoSolicitacao === "conteudo"
  const area: "audiovisual" | "design" = isConteudo ? "design" : "audiovisual"
  const departamento = isConteudo ? "growth" : isCobertura ? "eventos" : "outros"
  const peso = calcularPeso(data.tipoVideo, "normal")

  // Normaliza telefone do solicitante para WhatsApp
  const telSolicitante = data.telefone.replace(/\D/g, "")

  const demanda = await criarComCodigoUnico("VOP-EXT", (codigo) => prisma.demanda.create({
    data: {
      organizacaoId,
      codigo,
      titulo: data.titulo,
      descricao: data.descricao + (data.empresa ? `\n\nEmpresa: ${data.empresa}` : ""),
      departamento,
      area,
      objetivo: data.objetivo || undefined,
      detalhesEntrega: data.detalhesEntrega ? (data.detalhesEntrega as object) : undefined,
      tipoVideo: data.tipoVideo,
      cidade: data.cidade || "N/A",
      prioridade: "normal",
      statusInterno: "aguardando_aprovacao_interna",
      statusVisivel: "entrada",
      pesoDemanda: peso,
      solicitanteId: solicitante.id,
      telefoneSolicitante: telSolicitante,
      dataLimite: data.dataLimite ? new Date(data.dataLimite) : undefined,
      dataEvento: data.dataEvento ? new Date(data.dataEvento) : undefined,
      localEvento: data.localEvento,
      referencia: data.referencia,
      // Cliente final (cobertura)
      clienteFinalNome: data.clienteFinalNome,
      clienteFinalTelefone: data.clienteFinalTelefone,
      clienteFinalEmail: data.clienteFinalEmail,
    },
  }))

  await prisma.historicoStatus.create({
    data: {
      demandaId: demanda.id,
      statusNovo: "aguardando_aprovacao_interna",
      usuarioId: solicitante.id,
      origem: "manual",
      observacao: `Demanda criada via formulário externo por ${data.nomeCliente}`,
    },
  })

  await prisma.alertaIA.create({
    data: {
      organizacaoId,
      demandaId: demanda.id,
      tipoAlerta: "demanda_externa",
      mensagem: `📥 Demanda externa de ${data.nomeCliente} (${data.email}): "${data.titulo}" aguarda aprovação.`,
      severidade: "aviso",
      acaoSugerida: "Aprovar ou recusar demanda externa",
    },
  })

  // Notifica os líderes do audiovisual (alerta direcionado + WhatsApp)
  if (area === "audiovisual") {
    emSegundoPlano(
      () => notificarLideresAudiovisual(demanda.id, demanda.codigo, data.titulo, organizacaoId),
      "lideres-audiovisual"
    )
  }

  // Notifica o solicitante via WhatsApp
  if (telSolicitante.length >= 10) {
    const primeiroNome = data.nomeCliente.split(" ")[0]
    emSegundoPlano(() => sendWhatsappMessage(
      telSolicitante,
      `Hey ${primeiroNome}! Aqui é a *NuFlow* 🤖\n\n✅ Sua solicitação foi recebida!\n\n📋 *${demanda.codigo}* — ${data.titulo}\n\nNossa equipe vai analisar e te aviso assim que tiver novidade. 🚀`,
      demanda.id, organizacaoId
    ), "wa-solicitante-recebida")
  }

  // Notifica gestores via WhatsApp (da organização da demanda)
  const gestores = await prisma.usuario.findMany({
    where: { tipo: { in: ["admin", "gestor"] }, status: "ativo", organizacoes: { some: { organizacaoId } } },
    select: { telefone: true, nome: true },
  })
  for (const g of gestores) {
    if (g.telefone) {
      sendWhatsappMessage(
        g.telefone,
        `📥 *Nova solicitação externa*\n\n📋 *${demanda.codigo}* — ${data.titulo}\n👤 De: ${data.nomeCliente} (${data.telefone})\n${isCobertura ? `📸 Cobertura em ${data.cidade}` : `🎬 Vídeo: ${data.tipoVideo}`}\n\nAguarda aprovação no sistema.`,
        demanda.id, organizacaoId
      ).catch(() => null)
    }
  }

  // Token de 30 min para anexar referência logo depois de enviar. O upload é por
  // demandaId e a demanda só passa a existir aqui — sem isto, o formulário
  // público continuaria aceitando apenas link.
  return NextResponse.json(
    { ok: true, codigo: demanda.codigo, anexoToken: gerarTokenAnexo(demanda.id) },
    { status: 201 }
  )
}
