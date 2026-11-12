import type { Prisma } from "@prisma/client"
import { permissaoEfetiva, type MapaPermissoes } from "@/lib/permissoes"
import { decryptSecret } from "@/lib/secret-crypto"
import { valorConhecido } from "@/lib/pagamentos"

// Os dados de pagamento do videomaker que vão junto com a nota fiscal (Giovani,
// 12/11/2026: "as notificações da nota fiscal têm que vir com os dados de
// pagamento, por exemplo o pix").
//
// Dado sensível. Regras (Giovani, 12/11/2026):
//   - Quem vê: quem é do financeiro (`verCustos`, que a gestão tem pelo papel —
//     a porta de /api/custos-videomaker) ou da operação ("Opera Gravações
//     Externas"). Quem só aprova (`verAprovacoes`) continua sem PIX nem valor,
//     como no hotfix de 02/10/2026 (PR #73).
//   - Onde vai inteiro: e-mail e WhatsApp (a mensagem fica cifrada na fila e
//     some na retenção). No sino vai só o tipo e o final da chave: o sino grava
//     o texto em claro (alertas_ia), e a chave é guardada cifrada justamente
//     para não ficar legível em consulta direta. A página Notas fiscais mostra.
//   - Nunca em log: nada aqui escreve no console.

type Tx = Prisma.TransactionClient

export type TipoPix = "CPF" | "CNPJ" | "E-mail" | "Telefone" | "Aleatória" | "Chave"

const soDigitos = (s: string) => s.replace(/\D/g, "")

function cpfValido(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

/** O tipo da chave PIX, pelo formato (o cadastro do videomaker não guarda o tipo). */
export function tipoDaChavePix(chave: string | null | undefined): TipoPix | null {
  const c = chave?.trim()
  if (!c) return null
  if (c.includes("@")) return "E-mail"
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return "Aleatória"
  if (c.startsWith("+")) return "Telefone"
  if (/[a-z]/i.test(c)) return "Chave"
  const d = soDigitos(c)
  if (d.length === 14) return "CNPJ"
  if (d.length === 11) return cpfValido(d) ? "CPF" : "Telefone"
  if (d.length >= 10 && d.length <= 13) return "Telefone"
  return "Chave"
}

/** Os 4 últimos caracteres da chave (letras e números), para o sino e o WhatsApp. */
export function finalDaChave(chave: string | null | undefined): string | null {
  const c = (chave ?? "").replace(/[^0-9a-z]/gi, "")
  return c.length >= 4 ? c.slice(-4) : null
}

export type DadosDePagamento = {
  /** O valor do lançamento ou, sem ele, a diária combinada com a empresa. */
  valor: number | null
  /** De onde veio o valor: o custo confirmado, ou a diária ainda a confirmar. */
  origemValor: "custo" | "diaria" | null
  chavePix: string | null
  tipoPix: TipoPix | null
  dadosBancarios: string | null
  cpfCnpj: string | null
  razaoSocial: string | null
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export function rotuloDoValor(p: Pick<DadosDePagamento, "valor" | "origemValor">): string {
  if (p.valor === null) return "A confirmar"
  const v = brl.format(p.valor).replace(/ /g, " ")
  return p.origemValor === "diaria" ? `${v} (diária combinada, a confirmar)` : v
}

/** A chave sem mostrar tudo: "CPF final 1234". */
export function pixResumido(p: Pick<DadosDePagamento, "chavePix" | "tipoPix">): string | null {
  const fim = finalDaChave(p.chavePix)
  if (!p.chavePix || !fim) return null
  return `${p.tipoPix ?? "Chave"} final ${fim}`
}

/** As linhas completas, para o e-mail de quem vê o financeiro. */
export function linhasDoPagamento(p: DadosDePagamento): [string, string][] {
  const linhas: [string, string][] = [["Valor", rotuloDoValor(p)]]
  if (p.chavePix) linhas.push([`PIX (${p.tipoPix ?? "chave"})`, p.chavePix])
  if (p.dadosBancarios) linhas.push(["Dados bancários", p.dadosBancarios])
  if (!p.chavePix && !p.dadosBancarios) linhas.push(["PIX", "Não cadastrado — peça ao videomaker"])
  if (p.cpfCnpj) linhas.push([soDigitos(p.cpfCnpj).length === 14 ? "CNPJ da nota" : "CPF da nota", p.cpfCnpj])
  if (p.razaoSocial) linhas.push(["Razão social", p.razaoSocial])
  return linhas
}

/** Uma linha curta, sem a chave inteira: o sino. */
export function resumoDoPagamento(p: DadosDePagamento): string {
  const pix = pixResumido(p)
  return [`Valor: ${rotuloDoValor(p)}`, pix ? `PIX ${pix}` : p.dadosBancarios ? "Pagamento por dados bancários" : "PIX não cadastrado"].join(" · ")
}

function decifrar(v: string | null | undefined): string | null {
  if (!v) return null
  try { return decryptSecret(v) || null } catch { return null }
}

/** Monta os dados de pagamento a partir do que já foi lido (fiscais já decifrados). */
export function pagamentoDe(
  custos: { valor: number; valorConfirmadoEm: Date | null }[],
  diaria: number | null | undefined,
  f: { chavePix: string | null; dadosBancarios: string | null; cpfCnpj: string | null; razaoSocial: string | null } | null | undefined,
): DadosDePagamento {
  const custo = custos.length === 1 && valorConhecido(custos[0]) ? custos[0] : null
  const d = diaria ?? null
  const chavePix = f?.chavePix?.trim() || null
  return {
    valor: custo ? custo.valor : d,
    origemValor: custo ? "custo" : d !== null ? "diaria" : null,
    chavePix,
    tipoPix: tipoDaChavePix(chavePix),
    dadosBancarios: f?.dadosBancarios?.trim() || null,
    cpfCnpj: f?.cpfCnpj?.trim() || null,
    razaoSocial: f?.razaoSocial?.trim() || null,
  }
}

/** Os dados de pagamento desta gravação, decifrados. Só para quem vê o financeiro. */
export async function dadosDePagamento(
  tx: Pick<Tx, "custoVideomaker" | "videomakerOrganizacao" | "videomakerDadosFiscais">,
  organizacaoId: string, demandaId: string, videomakerId: string,
): Promise<DadosDePagamento> {
  const [custos, vinculo, f] = await Promise.all([
    tx.custoVideomaker.findMany({ where: { organizacaoId, demandaId, videomakerId }, select: { valor: true, valorConfirmadoEm: true }, take: 2 }),
    tx.videomakerOrganizacao.findUnique({ where: { organizacaoId_videomakerId: { organizacaoId, videomakerId } }, select: { valorDiaria: true } }),
    tx.videomakerDadosFiscais.findUnique({ where: { organizacaoId_videomakerId: { organizacaoId, videomakerId } } }),
  ])
  return pagamentoDe(custos, vinculo?.valorDiaria, f ? {
    chavePix: decifrar(f.chavePix), dadosBancarios: decifrar(f.dadosBancarios), cpfCnpj: f.cpfCnpj, razaoSocial: f.razaoSocial,
  } : null)
}

/** O bloco do pagamento no WhatsApp: as linhas completas, uma por linha. */
export function pagamentoNoWhatsapp(p: DadosDePagamento): string {
  return ["💰 Pagamento", ...linhasDoPagamento(p).map(([r, v]) => `${r}: ${v}`)].join("\n")
}

/**
 * Destes usuários, quem vê os dados de pagamento da nota: quem vê o
 * financeiro ou quem é da operação ("Opera Gravações Externas") nesta empresa.
 */
export async function quemVeDadosDePagamento(
  tx: Pick<Tx, "usuarioOrganizacao" | "permissaoUsuario">, organizacaoId: string, usuarioIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(usuarioIds)]
  if (!ids.length) return new Set()
  const [financeiro, operam] = await Promise.all([
    quemVeFinanceiro(tx, organizacaoId, ids),
    tx.usuarioOrganizacao.findMany({
      where: { organizacaoId, usuarioId: { in: ids }, operaGravacoes: true, usuario: { status: "ativo" } }, select: { usuarioId: true },
    }),
  ])
  return new Set([...financeiro, ...operam.map((o) => o.usuarioId)])
}

/**
 * Destes usuários, quem vê o financeiro nesta empresa (`verCustos` efetivo:
 * papel, com o registro explícito por cima — a mesma regra de
 * lib/permissoes-server.ts permissoesEfetivas, em lote e dentro da transação).
 */
export async function quemVeFinanceiro(
  tx: Pick<Tx, "usuarioOrganizacao" | "permissaoUsuario">, organizacaoId: string, usuarioIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(usuarioIds)]
  if (!ids.length) return new Set()
  const [vinculos, explicitas] = await Promise.all([
    tx.usuarioOrganizacao.findMany({
      where: { organizacaoId, usuarioId: { in: ids } },
      select: { usuarioId: true, papel: true, organizacaoId: true, usuario: { select: { status: true } } },
    }),
    tx.permissaoUsuario.findMany({ where: { organizacaoId, usuarioId: { in: ids } } }),
  ])
  const porUsuario = new Map(explicitas.map((p) => [p.usuarioId, p]))
  const sim = new Set<string>()
  for (const v of vinculos) {
    const p = permissaoEfetiva({
      membro: { papel: v.papel, organizacaoId: v.organizacaoId, statusUsuario: v.usuario.status },
      permissaoExplicita: (porUsuario.get(v.usuarioId) as Partial<MapaPermissoes> | undefined) ?? null,
      organizacaoId,
    })
    if (p?.verCustos) sim.add(v.usuarioId)
  }
  return sim
}
