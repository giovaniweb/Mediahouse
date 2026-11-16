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
import { NextRequest, NextResponse, after } from "next/server"
import { randomUUID } from "node:crypto"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { getOrgId, semOrg } from "@/lib/org"
import { comOrg } from "@/lib/org-contexto"
import { permissoesEfetivas, setPermissoes } from "@/lib/permissoes-server"
import { PRESETS } from "@/lib/permissoes"
import { ehGestaoDaEmpresa } from "@/lib/parceria"
import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { consumirLimitePublico } from "@/lib/limite-publico"
import { criarUsuarioComVinculo, usuarioIdPorEmail, usuarioIdPorTelefone } from "@/lib/criar-usuario"
import { podeAdministrarIdentidade } from "@/lib/identidade-admin"
import { dimensoesParaTipo } from "@/lib/pessoas"
import { SENHA_PENDENTE, gerarTokenConvite, linkConvite } from "@/lib/convite-equipe"
import { sendEmailNotificacao } from "@/lib/email"
import { cancelarSaidasPendentes, criarSaida, processarSaidas } from "@/lib/whatsapp-outbox"
import { telefoneCompleto } from "@/lib/whatsapp-identidade"
import {
  JANELA_REENVIO_SEG, PREFIXO_CHAVE, TETO_EMPRESA_HORA, emailInterno, emailReal, htmlAcessoEmail,
  mascararEmail, mascararTelefone, situacaoDaConta, textoAcessoWhatsapp,
} from "@/lib/acesso-videomaker"

type Params = { params: Promise<{ id: string }> }
const naoEncontrado = () => NextResponse.json({ error: "Não encontrado" }, { status: 404 })
const conflito = (error: string) => NextResponse.json({ error }, { status: 409 })

type Conta = { id: string; nome: string; email: string | null; telefone: string | null; status: string; senhaHash: string }

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

/** A conta vem do cliente de autenticação: a pessoa pode ter vínculo com outra empresa. */
async function contaDe(usuarioId: string | null): Promise<Conta | null> {
  if (!usuarioId) return null
  return prismaAuth.usuario.findUnique({
    where: { id: usuarioId },
    select: { id: true, nome: true, email: true, telefone: true, status: true, senhaHash: true },
  })
}

/** Para onde vai o link. Conta compartilhada: só os contatos da própria conta. */
function destinos(vm: { telefone: string | null }, conta: Pick<Conta, "email" | "telefone"> | null, compartilhada: boolean) {
  const telefone = telefoneCompleto(conta?.telefone ?? null) ?? (compartilhada ? null : telefoneCompleto(vm.telefone))
  return { telefone, email: emailReal(conta?.email) }
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
  const { organizacaoId, usuarioId: quemEnvia, vo } = g
  const vm = vo.videomaker

  if (vo.status === "pendente") return conflito("Aprove o cadastro primeiro: a aprovação já cria o acesso.")
  if (vo.emListaNegra) return conflito("Ele está na lista negra desta empresa.")

  let conta = await contaDe(vm.usuarioId)
  if (conta?.status === "inativo") return conflito("A conta dele está desativada. Fale com o suporte do NuFlow.")

  // Sem conta: antes de criar, ninguém pode já usar o e-mail ou o telefone.
  // Ligar o perfil a uma conta achada só pelo número poderia entregar a conta
  // de outra pessoa; isso fica com o suporte.
  if (!conta) {
    const real = emailReal(vm.email)
    const digitos = vm.telefone?.replace(/\D/g, "") ?? ""
    if (!telefoneCompleto(vm.telefone) && !real) return conflito("Sem WhatsApp nem e-mail para mandar o acesso. Cadastre o telefone em Editar.")
    const jaExiste = (real && await usuarioIdPorEmail(real)) || (digitos.length >= 8 && await usuarioIdPorTelefone(digitos.slice(-9)))
    if (jaExiste) return conflito("Já existe uma conta com este telefone ou e-mail. Fale com o suporte do NuFlow para ligar ao perfil dele.")
  }

  const compartilhada = conta ? !(await podeAdministrarIdentidade(quemEnvia, organizacaoId, conta.id)) : false
  const d = destinos(vm, conta, compartilhada)
  if (!d.telefone && !d.email) {
    return conflito(compartilhada
      ? "A conta dele também é de outra empresa e não tem telefone nem e-mail próprio. Peça para ele usar \"Esqueci minha senha\"."
      : "Sem WhatsApp nem e-mail para mandar o acesso. Cadastre o telefone em Editar.")
  }
  if (conta && !conta.email) return conflito("A conta dele não tem e-mail de login. Fale com o suporte do NuFlow.")

  // Limites: um envio por videomaker a cada 5 minutos (de qualquer empresa) e
  // um teto por empresa. Contados no banco, então dois cliques juntos não passam.
  if (!(await consumirLimitePublico(`acesso-videomaker:${id}`, 1, JANELA_REENVIO_SEG))) {
    return NextResponse.json({ error: "O acesso acabou de ser enviado. Espere alguns minutos para mandar de novo." }, { status: 429, headers: { "Retry-After": String(JANELA_REENVIO_SEG) } })
  }
  if (!(await consumirLimitePublico(`acesso-videomaker-org:${organizacaoId}`, TETO_EMPRESA_HORA, 3600))) {
    return NextResponse.json({ error: "Muitos envios de acesso nesta hora. Tente de novo mais tarde." }, { status: 429, headers: { "Retry-After": "3600" } })
  }

  // Conta nova: nasce como no cadastro (vínculo de videomaker e permissões do
  // preset), mas sem senha — a senha é ele quem cria pelo link.
  let contaCriada = false
  if (!conta) {
    const dim = dimensoesParaTipo("videomaker")
    const nova = await criarUsuarioComVinculo(
      organizacaoId,
      { nome: vm.nome, email: emailReal(vm.email) ?? emailInterno(vm.id), telefone: vm.telefone, tipo: "videomaker", senhaHash: SENHA_PENDENTE },
      { papel: "videomaker", categoria: dim.categoria, funcaoProfissional: dim.funcaoProfissional, areas: dim.areas },
      { id: true },
    )
    const ligou = await comOrg(organizacaoId, () => prisma.$transaction(async (tx) => {
      const r = await tx.videomaker.updateMany({ where: { id: vm.id, usuarioId: null }, data: { usuarioId: nova.id } })
      if (r.count === 1) await setPermissoes(nova.id, organizacaoId, PRESETS.videomaker ?? {}, tx)
      return r.count === 1
    }))
    if (!ligou) return conflito("Outra pessoa acabou de criar o acesso dele. Recarregue a página.")
    conta = await contaDe(nova.id)
    if (!conta) throw new Error("conta recém-criada não encontrada")
    contaCriada = true
  }

  const empresa = await comOrg(organizacaoId, () => prisma.organizacao.findUnique({ where: { id: organizacaoId }, select: { nome: true } }))
  const nomeEmpresa = empresa?.nome ?? "NuFlow"
  // Link novo: o anterior (e qualquer "esqueci minha senha" em aberto) deixa de valer.
  const token = await gerarTokenConvite(prismaAuth, conta.email!)
  const link = linkConvite(token)
  const telefoneLogin = telefoneDeLogin(conta.telefone)

  let whatsapp = "sem_telefone" as "na_fila" | "nao_enviado" | "sem_telefone"
  const correlationId = correlacaoAuditoria()
  await comOrg(organizacaoId, () => prisma.$transaction(async (tx) => {
    await cancelarSaidasPendentes(tx, organizacaoId, { prefixo: `${PREFIXO_CHAVE}${vm.id}:` }, "substituido")
    if (d.telefone) {
      try {
        await criarSaida(tx, {
          organizacaoId, origem: "manual", chave: `${PREFIXO_CHAVE}${vm.id}:${randomUUID().slice(0, 12)}`, referencia: vm.id,
          telefone: d.telefone, texto: textoAcessoWhatsapp({ nome: vm.nome, link, telefoneLogin, emailLogin: emailReal(conta!.email), empresa: nomeEmpresa }),
          expiraEm: new Date(Date.now() + 24 * 3600_000),
        })
        whatsapp = "na_fila"
      } catch (e) {
        // "Destinatário não autorizado": o número está em dois cadastros, ou ele
        // não está ativo aqui. Não manda e diz por quê.
        console.error("[acesso-videomaker] WhatsApp não entrou na fila:", (e as Error).message)
        whatsapp = "nao_enviado"
      }
    }
    await registrarAuditoria(tx, { organizacaoId, usuarioId: quemEnvia }, {
      acao: "videomaker.acesso", recurso: "videomaker", recursoId: vm.id, correlationId,
      depois: { campos: [...(whatsapp === "na_fila" ? ["telefone"] : []), ...(d.email ? ["email"] : [])] },
    })
  }))

  let email: "enviado" | "falhou" | "sem_email" = "sem_email"
  if (d.email) {
    const r = await sendEmailNotificacao({
      destinatario: d.email,
      assunto: `Seu acesso ao NuFlow (${nomeEmpresa.replace(/[\r\n]+/g, " ").slice(0, 80)})`,
      html: htmlAcessoEmail({ nome: vm.nome, link, empresa: nomeEmpresa, telefoneLogin }),
      evento: "acesso-videomaker",
    }).catch(() => ({ ok: false }))
    email = r.ok ? "enviado" : "falhou"
  }

  if (whatsapp === "na_fila") {
    try { after(async () => { await processarSaidas(organizacaoId).catch(() => undefined) }) } catch { /* fila persistida */ }
  }
  if (whatsapp !== "na_fila" && email !== "enviado") {
    return NextResponse.json({ error: "Não deu para mandar o acesso: o número dele está em mais de um cadastro ou fora da lista ativa, e não há e-mail.", whatsapp, email, contaCriada }, { status: 422 })
  }
  return NextResponse.json({ ok: true, contaCriada, whatsapp, email })
}

/** O telefone que ele usa para entrar, como aparece na mensagem: só dígitos locais. */
function telefoneDeLogin(telefone: string | null): string | null {
  const t = telefoneCompleto(telefone)
  if (!t) return null
  return t.startsWith("55") && t.length >= 12 ? t.slice(2) : t
}
