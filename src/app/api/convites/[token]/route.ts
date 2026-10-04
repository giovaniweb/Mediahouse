import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z, ZodError } from "zod"
import { ConviteInvalido, responderConvite } from "@/lib/convites"
import { comOrg, declararOrg } from "@/lib/org-contexto"
import { orgPorCredencial } from "@/lib/org-por-credencial"

const resposta = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })

// GET /api/convites/[token] — buscar dados do convite (página pública)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // A credencial é a chave: ela diz de qual empresa é este registro, e sob RLS a
  // empresa precisa ser declarada ANTES da primeira consulta — senão o banco
  // devolve vazio e a página some. `orgPorCredencial` resolve por uma função no
  // banco que devolve só o id da empresa, sem abrir a tabela.
  //
  // O 404 aqui responde igual para credencial inválida e para credencial de
  // outra empresa: a diferença entre "não existe" e "existe e não é sua" seria
  // um oráculo.
  const organizacaoId = await orgPorCredencial("convite", token)
  if (!organizacaoId) return resposta({ error: "Convite não encontrado" }, 404)
  declararOrg(organizacaoId)

  const convite = await prisma.conviteVideomaker.findUnique({
    where: { token },
    include: {
      videomaker: { select: { id: true, nome: true } },
      demanda: {
        select: {
          id: true,
          codigo: true,
          titulo: true,
          descricao: true,
          tipoVideo: true,
          cidade: true,
          dataEvento: true,
          localEvento: true,
          localGravacao: true,
          dataCaptacao: true,
          prioridade: true,
        },
      },
    },
  })

  if (!convite) {
    return resposta({ error: "Convite não encontrado" }, 404)
  }

  if (convite.status !== "pendente") {
    return resposta({ error: "Convite já foi respondido", status: convite.status }, 400)
  }

  if (new Date() > convite.expiresAt) {
    return resposta({ error: "Convite expirado" }, 410)
  }

  return resposta(convite)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const organizacaoId = await orgPorCredencial("convite", token)
  if (!organizacaoId) return resposta({ error: "Convite não encontrado" }, 404)
  try {
    const e = z.object({ acao: z.enum(["aceitar", "recusar"]), versao: z.number().int().positive().optional() }).strict().parse(await req.json())
    return resposta(await comOrg(organizacaoId, () => prisma.$transaction(tx => responderConvite(tx, {
      organizacaoId, token, ...e, origem: "automacao",
    }))))
  } catch (e) {
    if (e instanceof ConviteInvalido) return resposta({ error: e.message }, e.status)
    if (e instanceof ZodError || e instanceof SyntaxError) return resposta({ error: "Ação inválida" }, 400)
    throw e
  }
}
