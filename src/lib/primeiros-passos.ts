// Primeiros passos de uma empresa nova (Onda 2A, 21/10/2026).
//
// Uma lista curta no painel do admin, sem tour: cada item some quando é feito,
// e a lista inteira some quando tudo está feito ou quando o admin dispensa.
// Quase tudo se deduz dos dados — não há "marcar como feito". A exceção é o
// link da página da empresa, que só se sabe copiado quando o botão é usado.
// As empresas que já existiam nasceram com a lista dispensada (migration).
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { LINHA_INICIAL } from "@/lib/pacote-inicial"

export type ChavePasso = "whatsapp" | "equipe" | "produtos" | "link" | "demanda"
export type Passo = { chave: ChavePasso; titulo: string; descricao: string; feito: boolean; href?: string }
export type EstadoPrimeirosPassos = { mostrar: boolean; itens: Passo[]; linkPagina: string | null }

export function montarPassos(d: {
  whatsappConectado: boolean; pessoas: number; produtos: number; linhasProprias: number; linkCopiado: boolean; demandas: number
}): Passo[] {
  return [
    { chave: "whatsapp", titulo: "Conectar o WhatsApp", descricao: "Os avisos de prazo, convite e aprovação saem por ele.",
      feito: d.whatsappConectado, href: "/configuracoes?tab=whatsapp" },
    { chave: "equipe", titulo: "Convidar a equipe", descricao: "Cada pessoa recebe um e-mail e cria a própria senha.",
      feito: d.pessoas > 1, href: "/usuarios" },
    { chave: "produtos", titulo: "Cadastrar produtos e linhas", descricao: "Para os pedidos já chegarem com o produto certo.",
      feito: d.produtos > 0 || d.linhasProprias > 0, href: "/produtos" },
    { chave: "link", titulo: "Copiar o link da página da empresa", descricao: "É por ele que clientes e profissionais pedem e se cadastram.",
      feito: d.linkCopiado },
    { chave: "demanda", titulo: "Criar a primeira demanda", descricao: "O quadro começa a andar a partir dela.",
      feito: d.demandas > 0, href: "/demandas?nova=1" },
  ]
}

function linkDaPagina(slug: string) {
  const base = (process.env.NEXTAUTH_URL?.trim() || "https://nuflow.space").replace(/\/$/, "")
  return `${base}/c/${slug}`
}

export async function primeirosPassos(organizacaoId: string): Promise<EstadoPrimeirosPassos> {
  return comOrg(organizacaoId, async () => {
    const org = await prisma.organizacao.findUnique({
      where: { id: organizacaoId },
      select: { slug: true, primeirosPassosDispensadosEm: true, linkPaginaCopiadoEm: true },
    })
    if (!org || org.primeirosPassosDispensadosEm) return { mostrar: false, itens: [], linkPagina: null }
    const [whatsapp, pessoas, produtos, linhasProprias, demandas] = await Promise.all([
      prisma.configWhatsapp.findUnique({ where: { organizacaoId }, select: { ativo: true, connectedAt: true } }),
      prisma.usuarioOrganizacao.count({ where: { organizacaoId } }),
      prisma.produto.count({ where: { organizacaoId } }),
      prisma.linhaProjeto.count({ where: { organizacaoId, nome: { not: LINHA_INICIAL } } }),
      prisma.demanda.count({ where: { organizacaoId } }),
    ])
    const itens = montarPassos({
      whatsappConectado: !!whatsapp?.ativo && !!whatsapp.connectedAt,
      pessoas, produtos, linhasProprias, linkCopiado: !!org.linkPaginaCopiadoEm, demandas,
    })
    return { mostrar: itens.some((i) => !i.feito), itens, linkPagina: linkDaPagina(org.slug) }
  })
}

export async function registrarPrimeiroPasso(organizacaoId: string, acao: "dispensar" | "link-copiado") {
  await comOrg(organizacaoId, () => prisma.organizacao.update({
    where: { id: organizacaoId },
    data: acao === "dispensar" ? { primeirosPassosDispensadosEm: new Date() } : { linkPaginaCopiadoEm: new Date() },
  }))
}
