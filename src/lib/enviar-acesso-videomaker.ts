// "Enviar acesso" do videomaker (16/11/2026), fora da rota para o cadastro e a
// aprovação usarem o mesmo caminho. Desde a auditoria de 18/11/2026 a conta de
// profissional não nasce mais com a senha "nuflow" + 4 últimos dígitos do
// telefone, mandada pelo WhatsApp: nasce sem senha (SENHA_PENDENTE, que nunca
// confere no login) e a pessoa recebe o link de criar a senha dela.
//
// Quem chama já conferiu: gestão desta empresa e vínculo com o videomaker
// (ver `guarda` em src/app/api/videomakers/[id]/acesso/route.ts).
import { NextResponse, after } from "next/server"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { prismaAuth } from "@/lib/prisma-auth"
import { comOrg } from "@/lib/org-contexto"
import { permissoesEfetivas, setPermissoes } from "@/lib/permissoes-server"
import { ehGestaoDaEmpresa } from "@/lib/parceria"
import { PRESETS } from "@/lib/permissoes"
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
  textoAcessoWhatsapp,
} from "@/lib/acesso-videomaker"

const conflito = (error: string) => NextResponse.json({ error }, { status: 409 })

export type Conta = { id: string; nome: string; email: string | null; telefone: string | null; status: string; senhaHash: string }

/** A conta vem do cliente de autenticação: a pessoa pode ter vínculo com outra empresa. */
export async function contaDe(usuarioId: string | null): Promise<Conta | null> {
  if (!usuarioId) return null
  return prismaAuth.usuario.findUnique({
    where: { id: usuarioId },
    select: { id: true, nome: true, email: true, telefone: true, status: true, senhaHash: true },
  })
}

/** Para onde vai o link. Conta compartilhada: só os contatos da própria conta.
 * Conta só desta empresa, ou que ainda vai nascer: vale também o que está na ficha. */
export function destinos(vm: { telefone: string | null; email: string | null }, conta: Pick<Conta, "email" | "telefone"> | null, compartilhada: boolean) {
  const daFicha = !compartilhada
  const telefone = telefoneCompleto(conta?.telefone ?? null) ?? (daFicha ? telefoneCompleto(vm.telefone) : null)
  const email = emailReal(conta?.email) ?? (daFicha ? emailReal(vm.email) : null)
  return { telefone, email }
}

export type ContextoAcesso = {
  organizacaoId: string
  /** Quem manda (gestão). */
  usuarioId: string
  vo: {
    status: string
    emListaNegra: boolean
    videomaker: { id: string; nome: string; telefone: string | null; email: string | null; usuarioId: string | null }
  }
}

/** Cria a conta se faltar e manda o link de criar senha pelo WhatsApp e pelo e-mail. */
export async function enviarAcessoVideomaker(g: ContextoAcesso): Promise<NextResponse> {
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

  // Limites: um envio por videomaker a cada 5 minutos (de qualquer empresa) e
  // um teto por empresa. Contados no banco, então dois cliques juntos não passam.
  if (!(await consumirLimitePublico(`acesso-videomaker:${vm.id}`, 1, JANELA_REENVIO_SEG))) {
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

  // Conta do cadastro sem e-mail (login só pelo telefone): o link de criar
  // senha é por e-mail de login (password_reset_tokens), então ela ganha o
  // e-mail interno, como as contas do script. O login dela continua o telefone.
  // Só grava onde está vazio: nenhum e-mail existente é trocado.
  if (!conta.email) {
    const interno = emailInterno(vm.id)
    await comOrg(organizacaoId, () => prisma.usuario.updateMany({ where: { id: conta!.id, email: null }, data: { email: interno } }))
    conta = await contaDe(conta.id)
    if (!conta?.email) return conflito("Não deu para preparar o login dele. Fale com o suporte do NuFlow.")
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
          telefone: d.telefone, texto: textoAcessoWhatsapp({ nome: vm.nome, link, telefoneLogin, emailLogin: conta!.email, empresa: nomeEmpresa }),
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
      html: htmlAcessoEmail({ nome: vm.nome, link, empresa: nomeEmpresa, telefoneLogin, emailLogin: conta.email }),
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

/**
 * Depois de cadastrar ou aprovar: manda o link de criar senha, se quem cadastrou
 * é a gestão desta empresa (a mesma regra do botão "Enviar acesso"). Não lança:
 * a conta já existe e o botão continua lá para mandar de novo.
 */
export async function enviarAcessoPeloCadastro(
  quemEnvia: string,
  organizacaoId: string,
  videomakerId: string,
): Promise<{ enviado: boolean; motivo: string | null }> {
  try {
    const g = await comOrg(organizacaoId, async () => {
      const vinculo = await permissoesEfetivas(quemEnvia, organizacaoId)
      if (!ehGestaoDaEmpresa(vinculo?.papel)) return null
      return prisma.videomakerOrganizacao.findUnique({
        where: { organizacaoId_videomakerId: { organizacaoId, videomakerId } },
        select: { status: true, emListaNegra: true, videomaker: { select: { id: true, nome: true, telefone: true, email: true, usuarioId: true } } },
      })
    })
    if (!g) return { enviado: false, motivo: "Só a gestão manda o acesso. Peça para alguém da gestão usar \"Enviar acesso\" na ficha." }
    const res = await enviarAcessoVideomaker({ organizacaoId, usuarioId: quemEnvia, vo: g })
    if (res.ok) return { enviado: true, motivo: null }
    const corpo = await res.json().catch(() => ({})) as { error?: string }
    return { enviado: false, motivo: corpo.error ?? "Não deu para mandar o acesso." }
  } catch (e) {
    console.error("[acesso-videomaker] Envio depois do cadastro falhou:", (e as Error).message)
    return { enviado: false, motivo: "Não deu para mandar o acesso agora. Use \"Enviar acesso\" na ficha." }
  }
}
