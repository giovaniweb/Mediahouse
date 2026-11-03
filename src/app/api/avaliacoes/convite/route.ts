import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { criarConvite } from "@/lib/convite-avaliacao"

// POST /api/avaliacoes/convite — o link (e o QR) para o cliente avaliar o
// profissional por UM serviço desta empresa. Ver lib/convite-avaliacao.
//
// Quem gera é quem gerencia a equipe externa (videomaker) ou interna (editor).
// O próprio profissional, logado, não gera convite para si: seria dar nota a si
// mesmo na média que a rede inteira vê.
const schema = z.object({
  tipo: z.enum(["videomaker", "editor"]),
  profissionalId: z.string().min(1).max(64),
  demandaId: z.string().min(1).max(64),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Escolha o serviço a avaliar." }, { status: 400 })
  const { tipo, profissionalId, demandaId } = parsed.data

  const acesso = await permissoesEfetivas(session.user.id, organizacaoId)
  const pode = tipo === "videomaker" ? acesso?.permissoes.verVideomakers : acesso?.permissoes.verEquipe
  if (!pode) return NextResponse.json({ error: "Sem permissão para gerar convite de avaliação." }, { status: 403 })

  // O serviço tem que ser desta empresa e deste profissional.
  const demanda = await prisma.demanda.findFirst({
    where: {
      id: demandaId,
      organizacaoId,
      ...(tipo === "videomaker" ? { videomakerId: profissionalId } : { editorId: profissionalId }),
    },
    select: { id: true },
  })
  if (!demanda) return NextResponse.json({ error: "Serviço não encontrado para este profissional." }, { status: 404 })

  const { token, expiraEm } = criarConvite({ tipo, profissionalId, demandaId, organizacaoId })
  const caminho = tipo === "videomaker" ? `/avaliar/${profissionalId}` : `/avaliar-editor/${profissionalId}`
  return NextResponse.json({ caminho: `${caminho}?c=${encodeURIComponent(token)}`, expiraEm })
}
