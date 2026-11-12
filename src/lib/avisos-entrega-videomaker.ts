import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { destinatariosNotasFiscais, sendEmailAvisoDaOperacao, type AvisoDaOperacaoEmail } from "@/lib/email"
import { avisarGravacao, dadosDaGravacao, type GravacaoDoAviso } from "@/lib/avisos-gravacao"
import { rotuloDoTipoDeGravacao } from "@/lib/etapas-da-gravacao"
import { dadosDePagamento, linhasDoPagamento, quemVeDadosDePagamento, rotuloDoValor, type DadosDePagamento } from "@/lib/pagamento-do-videomaker"
import { faltaDaEntrega, linksDaEntrega, linksDaNota, type DadosDoAviso } from "@/lib/avisos-gravacao-textos"
import { momentoDoJob, rotuloDoMomento } from "@/lib/ficha-do-job"

// O videomaker entregou material ou mandou a nota: a operação recebe e-mail e,
// no material, o aviso no sino (Giovani, 11/11/2026: "toda vez que o
// videomaker anexar o link ou anexar a nota fiscal o sistema manda para o
// email e também notificação com link da nota fiscal").
//
// O WhatsApp continua em lib/avisos-gravacao.ts (fila, com os links agora).
// Aqui fica o resto, e pelas mesmas regras de quem recebe:
//   - operação: quem tem "Opera Gravações Externas"; sem ninguém marcado, a
//     gestão (admin, gestor, quem recebe todos os avisos);
//   - nunca quem fez a mudança, nem o próprio videomaker.
// Sino do material e da nota (`nf_recebida`), direcionados. Até 12/11/2026 o da
// nota era um sino para todos, criado em lib/pagamentos.ts receberNotaFiscal;
// passou para cá para levar os dados de pagamento só a quem vê o financeiro.
//
// Roda depois do commit (emSegundoPlano) e nunca lança: a entrega e a nota já
// estão gravadas, e um e-mail que falha não pode desfazer isso.

type Tx = Prisma.TransactionClient
type Pessoa = { id: string; email: string | null }

/** Quem da operação recebe, menos quem não deve (autor, o próprio videomaker). */
export async function pessoasDaOperacao(tx: Pick<Tx, "usuario">, organizacaoId: string, fora: (string | null | undefined)[] = []): Promise<Pessoa[]> {
  const select = { id: true, email: true }
  const operam = await tx.usuario.findMany({
    where: { status: "ativo", organizacoes: { some: { organizacaoId, operaGravacoes: true } } }, select,
  })
  const lista = operam.length ? operam : await tx.usuario.findMany({
    where: { status: "ativo", organizacoes: { some: { organizacaoId, OR: [{ papel: { in: ["admin", "gestor"] } }, { recebeTodosAvisos: true }] } } }, select,
  })
  return lista.filter((p) => !fora.includes(p.id))
}

const cliente = (d: DadosDoAviso) => d.clienteFinalNome?.trim() || d.titulo
const nomeDoVideomaker = (d: DadosDoAviso) => d.videomaker?.nome?.trim() || "Videomaker"
const quando = (d: DadosDoAviso) => {
  const m = momentoDoJob(d)
  return m ? rotuloDoMomento(m) : null
}

/** A frase do sino quando o material chega. */
export function sinoDaEntrega(d: DadosDoAviso, completo: boolean): string {
  const falta = completo ? null : faltaDaEntrega(d)
  return `📁 ${nomeDoVideomaker(d).split(/\s+/)[0]} mandou material de ${cliente(d)} (${d.codigo}).${falta ? ` Falta ${falta}.` : ""}`
}

/** O e-mail do material, sem banco (testável e para a prévia). */
export function emailDaEntrega(d: DadosDoAviso, completo: boolean): { assunto: string; dados: AvisoDaOperacaoEmail } {
  const falta = completo ? null : faltaDaEntrega(d)
  // Sem mudar de etapa (link salvo na ficha), o completo não diz para onde vai.
  const situacao = falta ? `Falta ${falta}`
    : !completo ? "Material completo"
    : d.statusInterno === "aprovado" ? "Pronto para enviar ao cliente" : "Vai para a edição"
  const q = quando(d)
  return {
    assunto: `Material recebido — ${cliente(d)} (${d.codigo})`,
    dados: {
      titulo: "Material recebido",
      intro: `${nomeDoVideomaker(d)} mandou o material da gravação pelo NuFlow.`,
      linhas: [
        ["Videomaker", nomeDoVideomaker(d)],
        ["Cliente", cliente(d)],
        ...(q ? [["Gravação", q] as [string, string]] : []),
        ["Código", d.codigo],
        ["Situação", situacao],
      ],
      links: linksDaEntrega(d).map((l) => ({ ...l, rotulo: l.rotulo === "No NuFlow" ? "Abrir no NuFlow" : `Abrir ${l.rotulo.toLowerCase()}` })),
    },
  }
}

/** A descrição do trabalho de uma gravação, para quem paga (e-mail da nota). */
export function trabalhoDaGravacao(d: DadosDoAviso): [string, string][] {
  const tipo = rotuloDoTipoDeGravacao(d.tipoGravacao)
  const q = quando(d)
  const local = [d.localGravacao?.trim() || d.localEvento?.trim(), d.cidade?.trim()].filter(Boolean).join(" — ")
  return [
    ["Trabalho", tipo ? `Gravação — ${tipo}` : "Gravação"],
    ...(q ? [["Data", q] as [string, string]] : []),
    ...(local ? [["Local", local] as [string, string]] : []),
    ["Médico / cliente", cliente(d)],
    ["Código do card", d.codigo],
  ]
}

/**
 * O e-mail da nota: uma gravação ou a nota que cobre várias.
 *
 * Com `pagamentos` (um por gravação, na mesma ordem), é o e-mail de quem vê o
 * financeiro e do e-mail das notas da empresa (a Débora): leva a descrição do
 * trabalho e os dados de pagamento completos, PIX inclusive. Sem, é o de antes,
 * para a operação que não vê valores.
 */
export function emailDaNota(gravacoes: DadosDoAviso[], pagamentos?: DadosDePagamento[]): { assunto: string; dados: AvisoDaOperacaoEmail } {
  const [g] = gravacoes
  const nome = nomeDoVideomaker(g)
  const nota = linksDaNota(g).find((l) => l.rotulo === "Nota fiscal")
  const varias = gravacoes.length > 1
  const q = quando(g)
  const links = [
    ...(nota ? [{ rotulo: "Abrir a nota fiscal", url: nota.url }] : []),
    ...gravacoes.flatMap((d) => d.linkCard ? [{ rotulo: varias ? `Abrir ${d.codigo} no NuFlow` : `Abrir o card ${d.codigo}`, url: d.linkCard }] : []),
  ]
  const assunto = varias ? `Nota fiscal de ${nome} — ${gravacoes.length} gravações` : `Nota fiscal de ${nome} — ${cliente(g)} (${g.codigo})`
  if (pagamentos?.length === gravacoes.length) {
    const [p] = pagamentos
    const total = pagamentos.every((x) => x.valor !== null) ? pagamentos.reduce((s, x) => s + (x.valor ?? 0), 0) : null
    const aConfirmar = pagamentos.some((x) => x.origemValor !== "custo")
    const pagamento = linhasDoPagamento(varias ? { ...p, valor: total, origemValor: aConfirmar ? "diaria" : "custo" } : p)
    if (varias) pagamento[0] = ["Valor total", pagamento[0][1]]
    return {
      assunto,
      dados: {
        titulo: "Nota fiscal para pagamento",
        intro: `${nome} mandou a nota fiscal${varias ? ` de ${gravacoes.length} gravações` : ""}. O trabalho e os dados de pagamento estão abaixo.`,
        linhas: [["Videomaker", nome]],
        blocos: [
          ...gravacoes.map((d, i) => ({
            titulo: varias ? `Gravação ${i + 1} de ${gravacoes.length}` : "O trabalho",
            linhas: [...trabalhoDaGravacao(d), ...(varias ? [["Valor", rotuloDoValor(pagamentos[i])] as [string, string]] : [])],
          })),
          { titulo: "Dados de pagamento", linhas: pagamento },
        ],
        links,
      },
    }
  }
  return {
    assunto,
    dados: {
      titulo: "Nota fiscal recebida",
      intro: `${nome} mandou a nota fiscal. Confira e marque no NuFlow quando ela for cadastrada para pagamento.`,
      linhas: varias
        ? [["Videomaker", nome], ...gravacoes.map((d) => ["Gravação", `${cliente(d)} (${d.codigo})`] as [string, string])]
        : [["Videomaker", nome], ["Cliente", cliente(g)], ...(q ? [["Gravação", q] as [string, string]] : []), ["Código", g.codigo]],
      links,
    },
  }
}

/**
 * A frase do sino da nota. Nunca leva valor nem PIX: o texto fica em
 * alertas_ia, que outros leitores (central de alertas, painéis, assistente)
 * mostram a quem não vê o financeiro.
 */
export function sinoDaNota(d: DadosDoAviso): string {
  return `🧾 ${nomeDoVideomaker(d).split(/\s+/)[0]} mandou a nota de ${cliente(d)} (${d.codigo}).`
}

async function usuarioDoVideomaker(tx: Pick<Tx, "videomaker">, videomakerId: string | null | undefined) {
  if (!videomakerId) return null
  return (await tx.videomaker.findUnique({ where: { id: videomakerId }, select: { usuarioId: true } }))?.usuarioId ?? null
}

/**
 * O material chegou (todo ou uma parte): sino para cada pessoa da operação e
 * um e-mail para elas. Para chamar em segundo plano. Devolve o que fez.
 */
export async function avisarEntregaDoVideomaker(
  organizacaoId: string, demandaId: string, e: { completo: boolean; autorUsuarioId?: string | null },
): Promise<{ sinos: number; emails: number }> {
  try {
    const r = await comOrg(organizacaoId, () => prisma.$transaction(async (tx) => {
      const g = await dadosDaGravacao(tx, organizacaoId, demandaId)
      if (!g) return null
      const pessoas = await pessoasDaOperacao(tx, organizacaoId, [e.autorUsuarioId, await usuarioDoVideomaker(tx, g.videomakerId)])
      if (pessoas.length) {
        await tx.alertaIA.createMany({ data: pessoas.map((p) => ({
          organizacaoId, demandaId, usuarioId: p.id, tipoAlerta: "material_recebido",
          mensagem: sinoDaEntrega(g, e.completo), severidade: "info" as const, acaoSugerida: "Abra o card e confira o material.",
        })) })
      }
      return { g, pessoas }
    }))
    if (!r) return { sinos: 0, emails: 0 }
    const { assunto, dados } = emailDaEntrega(r.g, e.completo)
    const emails = r.pessoas.map((p) => p.email).filter((x): x is string => !!x)
    const env = emails.length ? await sendEmailAvisoDaOperacao(emails, assunto, dados, "material-do-videomaker") : null
    if (env && !env.ok) console.error("[Avisos de entrega] e-mail do material não saiu", { demandaId, erro: env.error })
    return { sinos: r.pessoas.length, emails: env?.ok ? emails.length : 0 }
  } catch (err) {
    console.error("[Avisos de entrega] material falhou", { demandaId, erro: err instanceof Error ? err.message : String(err) })
    return { sinos: 0, emails: 0 }
  }
}

/**
 * A nota chegou (de uma gravação ou de várias). Para chamar em segundo plano;
 * nunca lança.
 *
 *   - Sino, direcionado, para cada pessoa da operação (uma por gravação), sem
 *     valor nem PIX (ver sinoDaNota); quem vê os dados de pagamento recebe o
 *     caminho da página Notas fiscais.
 *   - E-mail para a operação: quem vê os dados de pagamento recebe o completo
 *     (trabalho e dados de pagamento, PIX inteiro); os outros, o de antes.
 *   - E-mail das notas da empresa (Configurações → E-mail; a Débora): sempre o
 *     completo. Quem já está nele não recebe o da operação de novo.
 */
export async function avisarNotaDoVideomaker(
  organizacaoId: string, demandaIds: string[], autorUsuarioId?: string | null,
): Promise<{ emails: number; sinos: number }> {
  try {
    const paraNotas = await destinatariosNotasFiscais(organizacaoId)
    const r = await comOrg(organizacaoId, () => prisma.$transaction(async (tx) => {
      const gravacoes: GravacaoDoAviso[] = []
      for (const id of demandaIds) {
        const g = await dadosDaGravacao(tx, organizacaoId, id)
        if (g) gravacoes.push(g)
      }
      const vm = gravacoes[0]?.videomakerId
      if (!gravacoes.length || !vm) return null
      const pessoas = await pessoasDaOperacao(tx, organizacaoId, [autorUsuarioId, await usuarioDoVideomaker(tx, vm)])
      const financeiro = await quemVeDadosDePagamento(tx, organizacaoId, pessoas.map((p) => p.id))
      const precisa = financeiro.size > 0 || paraNotas.length > 0
      const pagamentos = precisa ? await Promise.all(gravacoes.map((g) => dadosDePagamento(tx, organizacaoId, g.id, vm))) : null
      if (pessoas.length) {
        await tx.alertaIA.createMany({ data: pessoas.flatMap((p) => gravacoes.map((g) => ({
          organizacaoId, demandaId: g.id, usuarioId: p.id, tipoAlerta: "nf_recebida",
          // Sem valor nem PIX no texto gravado: a central de alertas, os painéis
          // e o assistente leem alertas_ia de outras pessoas sem olhar o
          // financeiro (revisão do #145). Quem vê o financeiro recebe o caminho.
          mensagem: sinoDaNota(g), severidade: "aviso" as const,
          acaoSugerida: financeiro.has(p.id) ? "Valor e PIX em Notas fiscais (/notas-fiscais) e no e-mail." : "Abra o card e marque quando a nota for cadastrada para pagamento.",
        }))) })
      }
      return { gravacoes, pessoas, financeiro, pagamentos }
    }))
    if (!r) return { emails: 0, sinos: 0 }
    const sinos = r.pessoas.length * r.gravacoes.length
    const jaNasNotas = new Set(paraNotas)
    const emailDe = (p: Pessoa) => p.email?.trim().toLowerCase() || null
    const completos = [...paraNotas, ...r.pessoas.filter((p) => r.financeiro.has(p.id)).map(emailDe)].filter((e): e is string => !!e)
    const simples = r.pessoas.filter((p) => !r.financeiro.has(p.id)).map(emailDe).filter((e): e is string => !!e && !jaNasNotas.has(e))
    let emails = 0
    const enviar = async (para: string[], completo: boolean) => {
      const lista = [...new Set(para)]
      if (!lista.length) return
      const { assunto, dados } = emailDaNota(r.gravacoes, completo ? r.pagamentos ?? undefined : undefined)
      const env = await sendEmailAvisoDaOperacao(lista, assunto, dados, completo ? "nota-do-videomaker-pagamento" : "nota-do-videomaker")
      // Só o erro do envio: nem destinatário nem dado de pagamento vão para o log.
      if (!env.ok) console.error("[Avisos de entrega] e-mail da nota não saiu", { demandaIds, completo, erro: env.error })
      else emails += lista.length
    }
    if (r.pagamentos) await enviar(completos, true)
    await enviar(simples, false)
    return { emails, sinos }
  } catch (err) {
    console.error("[Avisos de entrega] nota falhou", { demandaIds, erro: err instanceof Error ? err.message : String(err) })
    return { emails: 0, sinos: 0 }
  }
}

/**
 * O videomaker logado salvou o link dos brutos ou do vídeo pronto direto na
 * ficha (PUT /api/demandas/[id]), sem mudar a etapa. É entrega como as outras:
 * WhatsApp com os links (chave própria por parte, não repete no dia), e-mail
 * e sino. Para chamar em segundo plano; nunca lança.
 */
export async function avisarMaterialSalvoNoCard(
  organizacaoId: string, demandaId: string, partes: ("brutos" | "video")[], autorUsuarioId: string,
) {
  await avisarGravacao(organizacaoId, demandaId, "material_parcial", autorUsuarioId, `material:${partes.join("+")}`)
  return avisarEntregaDoVideomaker(organizacaoId, demandaId, { completo: false, autorUsuarioId })
}
