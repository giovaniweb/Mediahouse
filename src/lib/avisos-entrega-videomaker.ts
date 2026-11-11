import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { sendEmailAvisoDaOperacao, type AvisoDaOperacaoEmail } from "@/lib/email"
import { avisarGravacao, dadosDaGravacao } from "@/lib/avisos-gravacao"
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
// Sino só do material: a nota já acende o sino (`nf_recebida`, em
// lib/pagamentos.ts receberNotaFiscal) — outro seria o mesmo aviso duas vezes.
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

/** O e-mail da nota: uma gravação ou a nota que cobre várias. */
export function emailDaNota(gravacoes: DadosDoAviso[]): { assunto: string; dados: AvisoDaOperacaoEmail } {
  const [g] = gravacoes
  const nome = nomeDoVideomaker(g)
  const nota = linksDaNota(g).find((l) => l.rotulo === "Nota fiscal")
  const varias = gravacoes.length > 1
  const q = quando(g)
  return {
    assunto: varias ? `Nota fiscal de ${nome} — ${gravacoes.length} gravações` : `Nota fiscal de ${nome} — ${cliente(g)} (${g.codigo})`,
    dados: {
      titulo: "Nota fiscal recebida",
      intro: `${nome} mandou a nota fiscal. Confira e envie para compras no NuFlow.`,
      linhas: varias
        ? [["Videomaker", nome], ...gravacoes.map((d) => ["Gravação", `${cliente(d)} (${d.codigo})`] as [string, string])]
        : [["Videomaker", nome], ["Cliente", cliente(g)], ...(q ? [["Gravação", q] as [string, string]] : []), ["Código", g.codigo]],
      links: [
        ...(nota ? [{ rotulo: "Abrir a nota fiscal", url: nota.url }] : []),
        ...gravacoes.flatMap((d) => d.linkCard ? [{ rotulo: varias ? `Abrir ${d.codigo} no NuFlow` : "Abrir no NuFlow", url: d.linkCard }] : []),
      ],
    },
  }
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

/** A nota chegou (de uma gravação ou de várias): um e-mail para a operação, com o link do arquivo. */
export async function avisarNotaDoVideomaker(
  organizacaoId: string, demandaIds: string[], autorUsuarioId?: string | null,
): Promise<{ emails: number }> {
  try {
    const r = await comOrg(organizacaoId, () => prisma.$transaction(async (tx) => {
      const gravacoes = []
      for (const id of demandaIds) {
        const g = await dadosDaGravacao(tx, organizacaoId, id)
        if (g) gravacoes.push(g)
      }
      if (!gravacoes.length) return null
      const pessoas = await pessoasDaOperacao(tx, organizacaoId, [autorUsuarioId, await usuarioDoVideomaker(tx, gravacoes[0].videomakerId)])
      return { gravacoes, pessoas }
    }))
    if (!r) return { emails: 0 }
    const emails = r.pessoas.map((p) => p.email).filter((x): x is string => !!x)
    if (!emails.length) return { emails: 0 }
    const { assunto, dados } = emailDaNota(r.gravacoes)
    const env = await sendEmailAvisoDaOperacao(emails, assunto, dados, "nota-do-videomaker")
    if (!env.ok) console.error("[Avisos de entrega] e-mail da nota não saiu", { demandaIds, erro: env.error })
    return { emails: env.ok ? emails.length : 0 }
  } catch (err) {
    console.error("[Avisos de entrega] nota falhou", { demandaIds, erro: err instanceof Error ? err.message : String(err) })
    return { emails: 0 }
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
