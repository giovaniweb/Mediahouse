import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { comToken } from "@/lib/midia"
import { declararOrg } from "@/lib/org-contexto"
import { orgPorCredencial } from "@/lib/org-por-credencial"

type Params = { params: Promise<{ token: string }> }

// GET /api/publico/demanda/[token] — acompanhamento público de UMA demanda.
//
// O `select` abaixo é uma ALLOWLIST deliberada: só sai daqui o que um convidado
// externo pode ver. Ficam de fora, por decisão e não por esquecimento: custos,
// dados bancários, telefones de terceiros, comentários internos, histórico de
// status, motivo de impedimento e qualquer dado de outra pessoa.
// Não use `include` nem espalhe a demanda inteira nesta resposta.
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params

  // A credencial é a chave: ela diz de qual empresa é este registro, e sob RLS a
  // empresa precisa ser declarada ANTES da primeira consulta — senão o banco
  // devolve vazio e a página some. `orgPorCredencial` resolve por uma função no
  // banco que devolve só o id da empresa, sem abrir a tabela.
  //
  // O 404 aqui responde igual para credencial inválida e para credencial de
  // outra empresa: a diferença entre "não existe" e "existe e não é sua" seria
  // um oráculo.
  const organizacaoId = await orgPorCredencial("demanda_publica", token)
  if (!organizacaoId) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })
  declararOrg(organizacaoId)
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 })
  }

  const demanda = await prisma.demanda.findUnique({
    where: { publicToken: token },
    select: {
      codigo: true,
      titulo: true,
      descricao: true,
      statusVisivel: true,
      area: true,
      tipoVideo: true,
      dataLimite: true,
      dataEvento: true,
      finalizadaEm: true,
      createdAt: true,
      linkFinal: true,
      thumbnailUrl: true,
      publicTokenAtivo: true,
      publicTokenExpiraEm: true,
      organizacaoId: true,
      arquivos: {
        where: { tipoArquivo: "final" },
        orderBy: [{ sequencia: "asc" }, { createdAt: "asc" }],
        select: { url: true, nomeArquivo: true, sequencia: true },
      },
    },
  })

  // Mesma resposta para token inexistente, revogado ou expirado — não confirma
  // a existência da demanda para quem tem um link velho.
  const expirado = demanda?.publicTokenExpiraEm ? demanda.publicTokenExpiraEm < new Date() : false
  if (!demanda || !demanda.publicTokenAtivo || expirado) {
    return NextResponse.json({ error: "Link inválido ou revogado" }, { status: 404 })
  }

  // Nome/logo da empresa só para identificar quem entregou (Demanda não tem
  // relação declarada com Organizacao — por isso a busca separada).
  const organizacao = demanda.organizacaoId
    ? await prisma.organizacao.findUnique({
        where: { id: demanda.organizacaoId },
        select: { nome: true, logoUrl: true },
      })
    : null

  const { publicTokenAtivo: _a, publicTokenExpiraEm: _e, organizacaoId: _o, ...publico } = demanda
  // Mesma regra da aprovação: o token é a credencial de quem não tem conta, e
  // passa a valer também para a thumbnail que vive no bucket privado.
  return NextResponse.json({
    demanda: {
      ...publico,
      thumbnailUrl: comToken(publico.thumbnailUrl, token) ?? publico.thumbnailUrl,
      organizacao,
    },
  })
}
