import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId } from "@/lib/org"
import { urlAssinadaDeLeitura, organizacaoDoCaminho } from "@/lib/midia"

// GET /api/midia/org/{organizacaoId}/{tipo}/{id}/{arquivo}
//
// Porta única do bucket privado. Substitui o "qualquer pessoa com a URL baixa":
// aqui alguém precisa PROVAR que pode ver, e só então recebe uma URL assinada de
// 10 minutos.
//
// Duas credenciais valem, e é de propósito que sejam duas:
//
//   sessão   quem está logado na empresa dona do arquivo. O dono vem no próprio
//            caminho (`org/{id}/...`), então a checagem é uma comparação.
//   token    quem NÃO tem conta e precisa ver assim mesmo — o cliente que aprova
//            vídeo, o videomaker que manda nota fiscal. O token já era a
//            credencial dessas páginas; o que muda é que agora ele vale para o
//            ARQUIVO também, e não só para a página que o exibe.
//
// Ganho de brinde: `publicTokenExpiraEm` passa a alcançar a mídia. Hoje o link
// da página expira e o vídeo continua acessível para sempre.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ caminho: string[] }> }
) {
  const { caminho: partes } = await params
  const caminho = partes.join("/")

  const organizacaoId = organizacaoDoCaminho(caminho)
  if (!organizacaoId) {
    // Caminho fora do formato `org/{id}/...` não é do bucket privado.
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  const autorizado =
    (await autorizadoPorSessao(organizacaoId)) ||
    (await autorizadoPorToken(req.nextUrl.searchParams.get("token"), organizacaoId))

  // 404 e não 403: confirmar que o arquivo existe já é informação.
  if (!autorizado) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const assinada = await urlAssinadaDeLeitura(caminho)
  if (!assinada) return NextResponse.json({ error: "Arquivo indisponível" }, { status: 502 })

  // 302 em vez de servir o corpo: o byte vai do Supabase direto para quem pediu,
  // sem passar pela função — o que também evita estourar o limite de resposta
  // com vídeo grande.
  return NextResponse.redirect(assinada, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=60" },
  })
}

async function autorizadoPorSessao(organizacaoId: string): Promise<boolean> {
  const session = await auth().catch(() => null)
  if (!session?.user) return false
  const ativa = await getOrgId(session)
  return ativa === organizacaoId
}

/**
 * Token de página pública. Confere que o token existe, está ativo, não expirou
 * E pertence à mesma organização do arquivo — senão um token válido de uma
 * empresa abriria arquivo de outra.
 */
async function autorizadoPorToken(token: string | null, organizacaoId: string): Promise<boolean> {
  if (!token) return false

  const demanda = await prisma.demanda
    .findFirst({
      where: { publicToken: token, publicTokenAtivo: true, organizacaoId },
      select: { publicTokenExpiraEm: true },
    })
    .catch(() => null)
  if (demanda && (!demanda.publicTokenExpiraEm || demanda.publicTokenExpiraEm > new Date())) return true

  const aprovacao = await prisma.aprovacaoVideo
    .findFirst({
      where: { token, demanda: { organizacaoId } },
      select: { expiresAt: true },
    })
    .catch(() => null)
  if (aprovacao && (!aprovacao.expiresAt || aprovacao.expiresAt > new Date())) return true

  return false
}
