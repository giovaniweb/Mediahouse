import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { emSegundoPlano } from "@/lib/notificar"
import { z } from "zod"
import { calcularPeso } from "@/lib/peso-demanda"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { orgPublica } from "@/lib/org"
import { notificarLideresAudiovisual } from "@/app/api/demandas/route"
import { validarPrazo } from "@/lib/datas"
import { erroDeZod } from "@/lib/erros-api"
import { gerarTokenAnexo } from "@/lib/anexo-token"
import { declararOrg } from "@/lib/org-contexto"

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

function gerarCodigo(): string {
  const ano = new Date().getFullYear().toString().slice(-2)
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `VOP-EXT-${ano}-${rand}`
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return erroDeZod(parsed.error)
  }

  const data = parsed.data

  // Busca ou cria usuário solicitante externo
  // Prioridade: telefone (evita duplicatas), depois email
  const telDigits = data.telefone.replace(/\D/g, "")
  let solicitante = null

  // 1. Buscar por telefone primeiro (previne duplicatas)
  if (telDigits.length >= 8) {
    solicitante = await prisma.usuario.findFirst({
      where: { telefone: { contains: telDigits.slice(-9) } },
    })
  }

  // 2. Se não achou por telefone, buscar por email
  if (!solicitante) {
    solicitante = await prisma.usuario.findUnique({ where: { email: data.email } })
  }

  if (!solicitante) {
    const { randomBytes } = await import("crypto")
    const bcrypt = (await import("bcryptjs")).default
    const tempSenha = randomBytes(16).toString("hex")
    const senhaHash = await bcrypt.hash(tempSenha, 10)

    solicitante = await prisma.usuario.create({
      data: {
        nome: data.nomeCliente,
        email: data.email,
        telefone: data.telefone,
        tipo: "solicitante",
        senhaHash,
      },
    })
  } else {
    // Atualiza dados faltantes no cadastro existente
    const updates: Record<string, string> = {}
    if (!solicitante.telefone && data.telefone) updates.telefone = data.telefone
    if (!solicitante.email && data.email) updates.email = data.email
    if (Object.keys(updates).length > 0) {
      await prisma.usuario.update({ where: { id: solicitante.id }, data: updates })
    }
  }

  // Roteia a área/departamento conforme o que o cliente escolheu ("O que você precisa?")
  const isCobertura = data.tipoSolicitacao === "cobertura" || data.tipoVideo === "cobertura_evento"
  const isConteudo = data.tipoSolicitacao === "conteudo"
  const area: "audiovisual" | "design" = isConteudo ? "design" : "audiovisual"
  const departamento = isConteudo ? "growth" : isCobertura ? "eventos" : "outros"
  const peso = calcularPeso(data.tipoVideo, "normal")

  // Normaliza telefone do solicitante para WhatsApp
  const telSolicitante = data.telefone.replace(/\D/g, "")

  // TEMPORÁRIO (Fase 1): o formulário público é fixado na organização Contourline.
  // Futuro: o formulário deve receber slug/token da empresa para multiempresa real.
  // `?org=<slug>` identifica a empresa dona do formulário; sem ele, a padrão.
  const organizacaoId = await orgPublica(req.nextUrl.searchParams.get("org"))
  if (!organizacaoId) {
    return NextResponse.json({ error: "Organização não encontrada. Verifique o link do formulário." }, { status: 404 })
  }

  // Sob RLS a empresa precisa ser DECLARADA: rota pública não tem sessão de
  // onde deduzi-la, e sem declaração o banco devolve vazio.
  declararOrg(organizacaoId)

  // Garante a membership do solicitante na organização (categoria=solicitante).
  // Sem isso, a pessoa nasceria sem vínculo org e não apareceria em Pessoas & Acessos.
  await prisma.usuarioOrganizacao.upsert({
    where: { usuarioId_organizacaoId: { usuarioId: solicitante.id, organizacaoId } },
    update: {},
    create: { usuarioId: solicitante.id, organizacaoId, papel: "solicitante", categoria: "solicitante", funcaoProfissional: null, areas: [] },
  })

  const demanda = await prisma.demanda.create({
    data: {
      organizacaoId,
      codigo: gerarCodigo(),
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
  })

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
