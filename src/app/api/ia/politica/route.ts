import { NextRequest, NextResponse } from "next/server"
import { requireAcesso } from "@/lib/acesso"
import { prisma } from "@/lib/prisma"
import { alteracaoPoliticaSchema, alterarPoliticaIA, ConflitoPoliticaIA } from "@/lib/ia-politica"
const resposta = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
export async function PATCH(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso
  let body: unknown
  try { body = await req.json() } catch { return resposta({ error: "Dados inválidos." }, 400) }
  const validado = alteracaoPoliticaSchema.safeParse(body)
  if (!validado.success) return resposta({ error: "Use um limite diário inteiro entre 0 e 1.000.000 tokens e de 1 a 5 chamadas simultâneas." }, 400)
  try {
    return resposta(await alterarPoliticaIA(prisma, { organizacaoId: acesso.organizacaoId, usuarioId: acesso.usuarioId }, validado.data))
  } catch (e) {
    if (e instanceof ConflitoPoliticaIA) return resposta({ error: "Os limites foram alterados por outra pessoa. Atualize o consumo e revise antes de salvar." }, 409)
    return resposta({ error: "Não foi possível confirmar a alteração. Atualize o consumo antes de tentar novamente." }, 503)
  }
}
