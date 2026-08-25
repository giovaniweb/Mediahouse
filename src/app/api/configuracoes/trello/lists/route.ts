import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { getOrgId, semOrg } from "@/lib/org"
import { getBoardLists } from "@/lib/trello"
import { configTrelloDaOrg } from "@/lib/trello-config"

export async function GET() {
  const session = await auth()
  if (!session || !ehGestor(session)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  // A config vinha de `findFirst({ ativo: true })`: a primeira linha da tabela,
  // fosse de quem fosse. Agora ela só é entregue à empresa dona do board.
  const conf = await configTrelloDaOrg(organizacaoId)
  if (!conf.ok) return NextResponse.json({ error: conf.erro }, { status: conf.status })

  try {
    const lists = await getBoardLists(conf.cfg)
    return NextResponse.json({ lists, mapping: conf.listMapping })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao buscar listas" },
      { status: 500 }
    )
  }
}
