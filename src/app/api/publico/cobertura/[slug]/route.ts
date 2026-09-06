import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolverParaAssinada } from "@/lib/midia"
import { declararOrg } from "@/lib/org-contexto"
import { orgPorCredencial } from "@/lib/org-por-credencial"

type Params = { params: Promise<{ slug: string }> }

// GET /api/publico/cobertura/[slug] — sem auth
export async function GET(req: NextRequest, { params }: Params) {
  const { slug } = await params

  // A credencial é a chave: ela diz de qual empresa é este registro, e sob RLS a
  // empresa precisa ser declarada ANTES da primeira consulta — senão o banco
  // devolve vazio e a página some. `orgPorCredencial` resolve por uma função no
  // banco que devolve só o id da empresa, sem abrir a tabela.
  //
  // O 404 aqui responde igual para credencial inválida e para credencial de
  // outra empresa: a diferença entre "não existe" e "existe e não é sua" seria
  // um oráculo.
  const organizacaoId = await orgPorCredencial("cobertura", slug)
  if (!organizacaoId) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
  declararOrg(organizacaoId)
  const senha = req.nextUrl.searchParams.get("senha")

  const cobertura = await prisma.eventoCobertura.findUnique({
    where: { slug },
    select: {
      id: true,
      titulo: true,
      tipo: true,
      status: true,
      descricao: true,
      cliente: true,
      local: true,
      cidade: true,
      dataInicio: true,
      dataFim: true,
      totalDias: true,
      linkDownloadPublico: true,
      senhaDownload: true,
      uploads: {
        orderBy: [{ dia: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          dia: true,
          tipo: true,
          momento: true,
          titulo: true,
          url: true,
          thumbnailUrl: true,
          duracao: true,
        },
      },
    },
  })

  if (!cobertura) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })

  if (!cobertura.linkDownloadPublico) {
    return NextResponse.json({ error: "Link de download não ativo" }, { status: 403 })
  }

  // Verificar senha se definida
  if (cobertura.senhaDownload && senha !== cobertura.senhaDownload) {
    return NextResponse.json({ error: "Senha incorreta", requireSenha: true }, { status: 401 })
  }

  // Remover senha do response
  const { senhaDownload: _, ...coberturaPublica } = cobertura

  // A página /e/[slug] não tem sessão nem token: a credencial dela é o slug mais
  // a senha, já conferidos acima. Como é este endpoint que decide o acesso, ele
  // assina as URLs no servidor e entrega prontas. Arquivo do acervo antigo
  // (público) passa intacto.
  const uploadsAssinados = await Promise.all(
    coberturaPublica.uploads.map(async (u) => ({
      ...u,
      url: (await resolverParaAssinada(u.url)) ?? u.url,
      ...("thumbnailUrl" in u
        ? { thumbnailUrl: (await resolverParaAssinada(u.thumbnailUrl as string | null)) ?? u.thumbnailUrl }
        : {}),
    }))
  )

  return NextResponse.json({ cobertura: { ...coberturaPublica, uploads: uploadsAssinados } })
}
