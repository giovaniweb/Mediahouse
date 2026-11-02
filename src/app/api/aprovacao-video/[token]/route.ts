import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { comToken } from "@/lib/midia"
import { paraDownload } from "@/lib/midia-download"
import { getOrgId } from "@/lib/org"
import { orgPorCredencial } from "@/lib/org-por-credencial"
import { declararOrg } from "@/lib/org-contexto"
import { responderAprovacao } from "@/lib/responder-aprovacao"

// Sob RLS, ler a aprovação pelo token já exige a empresa declarada — sem ela o
// banco devolve vazio e o cliente lê "link não encontrado". O token diz de qual
// empresa ele é, e cada handler declara antes da primeira consulta.
//
// A declaração fica no corpo do handler, não numa função auxiliar: `declararOrg`
// usa `enterWith`, que vale para o contexto assíncrono corrente — chamada depois
// de um `await` dentro de um helper, ela vale só para o resto do helper e o
// handler segue sem empresa. O ensaio pegou exatamente isso.
//
// Token sem empresa não interrompe de propósito: segue para a busca, que sob
// RLS volta vazia (o mesmo 404 de token inválido) e sem RLS segue como sempre.
// É o que deixa o deploy indiferente à ordem da migration 20261004000000, que é
// quem ensina o tipo `aprovacao_video` à função.
const empresaDoToken = (token: string) => orgPorCredencial("aprovacao_video", token)

// A validade do token protege o link que vai ao CLIENTE por WhatsApp — não a
// equipe. Como o botão "Abrir aprovação" do sistema reusa esse mesmo token, a
// expiração trancava a própria equipe para fora da aprovação depois de 30 dias.
// Quem está logado na empresa dona da demanda enxerga e decide sempre; o acesso
// anônimo continua expirando normalmente.
async function ehAcessoInterno(organizacaoId: string | null | undefined): Promise<boolean> {
  if (!organizacaoId) return false
  const session = await auth()
  if (!session?.user) return false
  return (await getOrgId(session)) === organizacaoId
}

// GET /api/aprovacao-video/[token] — busca info da aprovação (público, sem auth)
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const empresa = await empresaDoToken(token)
  if (empresa) declararOrg(empresa)

  const aprovacao = await prisma.aprovacaoVideo.findUnique({
    where: { token },
    include: {
      demanda: {
        select: {
          id: true, codigo: true, titulo: true, departamento: true, tipoVideo: true,
          organizacaoId: true,
          // Growth: área + copy + todas as artes (carrossel) + produto/linha
          area: true, descricao: true, detalhesEntrega: true,
          linhaProjetoRef: { select: { nome: true } },
          produtos: { select: { produto: { select: { nome: true } } }, take: 1 },
          arquivos: {
            where: { tipoArquivo: "final" },
            select: { id: true, url: true, nomeArquivo: true, sequencia: true },
            orderBy: { sequencia: "asc" },
          },
        },
      },
    },
  })

  if (!aprovacao) {
    return NextResponse.json({ error: "Link de aprovação não encontrado" }, { status: 404 })
  }

  const expirado = !!aprovacao.expiresAt && aprovacao.expiresAt < new Date()
  const interno = expirado && (await ehAcessoInterno(aprovacao.demanda?.organizacaoId))
  if (expirado && !interno) {
    return NextResponse.json({ error: "Este link de aprovação expirou" }, { status: 410 })
  }

  // Versão anterior do mesmo vídeo. Cada rodada de ajuste cria uma AprovacaoVideo
  // nova, então a anterior é o corte que o cliente já viu — poder comparar os dois
  // lado a lado é o que responde "o que mudou?" sem precisar confiar na memória.
  // Campos deliberadamente mínimos: nada de quem aprovou nem de dados internos.
  const versaoAnterior = aprovacao.demandaId
    ? await prisma.aprovacaoVideo.findFirst({
        where: { demandaId: aprovacao.demandaId, createdAt: { lt: aprovacao.createdAt } },
        orderBy: { createdAt: "desc" },
        select: { urlVideo: true, nomeVideo: true, comentario: true, status: true, createdAt: true },
      })
    : null

  // A mídia nova vive em bucket privado. Quem abre esta página não tem conta —
  // a credencial dela é o token, e ele passa a valer para o ARQUIVO também.
  // Anexado aqui, no servidor, para a página não precisar mudar.
  // URL do acervo antigo (pública) passa intacta.
  // Assiste-se à prévia convertida; baixa-se o original do mesmo arquivo, quando houver.
  const original = aprovacao.demandaId
    ? (await prisma.arquivo.findFirst({
        where: { demandaId: aprovacao.demandaId, tipoArquivo: "final", url: aprovacao.urlVideo, originalUrl: { not: null } },
        select: { originalUrl: true },
      }))?.originalUrl ?? null
    : null

  return NextResponse.json({
    aprovacao: { ...aprovacao, urlVideo: comToken(aprovacao.urlVideo, token) ?? aprovacao.urlVideo },
    urlDownload: paraDownload(comToken(original ?? aprovacao.urlVideo, token) ?? aprovacao.urlVideo),
    expirado,
    versaoAnterior: versaoAnterior
      ? { ...versaoAnterior, urlVideo: comToken(versaoAnterior.urlVideo, token) ?? versaoAnterior.urlVideo }
      : null,
  })
}

// PATCH /api/aprovacao-video/[token] — renova a validade do link do cliente.
// Só quem está logado na empresa dona da demanda: reabre o mesmo link por mais 30
// dias sem recriar a aprovação (preserva token, histórico e comentários).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const empresa = await empresaDoToken(token)
  if (empresa) declararOrg(empresa)

  const aprovacao = await prisma.aprovacaoVideo.findUnique({
    where: { token },
    select: { id: true, demanda: { select: { organizacaoId: true } } },
  })
  if (!aprovacao) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })

  if (!(await ehAcessoInterno(aprovacao.demanda?.organizacaoId))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const dias = 30
  const atualizada = await prisma.aprovacaoVideo.update({
    where: { token },
    data: { expiresAt: new Date(Date.now() + dias * 24 * 60 * 60 * 1000) },
    select: { expiresAt: true },
  })

  return NextResponse.json({ ok: true, expiresAt: atualizada.expiresAt })
}

// POST /api/aprovacao-video/[token] — aprova ou solicita feedback (público, sem auth)
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json()
  const { acao, aprovadoPor, comentario } = body // acao: "aprovar" | "feedback"

  if (!["aprovar", "feedback"].includes(acao)) {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  }
  const empresa = await empresaDoToken(token)
  if (empresa) declararOrg(empresa)

  const aprovacao = await prisma.aprovacaoVideo.findUnique({ where: { token } })
  if (!aprovacao) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })

  // Rota pública resolve a org pelo registro (demanda do token)
  const demandaOrg = await prisma.demanda.findUnique({
    where: { id: aprovacao.demandaId },
    select: { organizacaoId: true },
  })
  // A demanda é a credencial deste token. Se ela sumiu, não há empresa a quem
  // atribuir a aprovação nem quem avisar — e o alerta que este fluxo cria
  // nasceria órfão, invisível para todas as telas.
  if (!demandaOrg) {
    return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })
  }
  const organizacaoId = demandaOrg.organizacaoId

  if (aprovacao.expiresAt && aprovacao.expiresAt < new Date() && !(await ehAcessoInterno(organizacaoId))) {
    return NextResponse.json({ error: "Link expirado" }, { status: 410 })
  }

  // O que acontece depois (status, histórico, alerta, avisos) é o mesmo de quem
  // responde por dentro do NuFlow — lib/responder-aprovacao.ts.
  const r = await responderAprovacao({ aprovacao, organizacaoId, acao, comentario, aprovadoPor })
  if (!r.ok) return NextResponse.json({ error: r.erro, status: r.status }, { status: r.http })
  return NextResponse.json({ ok: true, status: r.status })
}
