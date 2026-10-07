// POST /api/aceite-termos — a pessoa logada aceita os documentos que faltam.
//
// O servidor recalcula o que falta: o corpo só confirma O QUE A TELA MOSTROU.
// Se a versão mudou entre abrir a tela e clicar (deploy no meio), os dois não
// batem e a resposta pede para recarregar, em vez de gravar aceite de um texto
// que a pessoa não viu.
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { getOrgId, semOrg } from "@/lib/org"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { hashDoIp } from "@/lib/limite-publico"
import { DOCUMENTOS, type SlugDocumento } from "@/lib/juridico/documentos"
import { origemDoAceiteNoPainel } from "@/lib/juridico/aceite"
import { registrarAceite, situacaoDoAceite } from "@/lib/juridico/aceite-servidor"

const schema = z.object({
  aceito: z.literal(true),
  documentos: z.array(z.string().refine((s): s is SlugDocumento => Object.hasOwn(DOCUMENTOS, s))).min(1).max(5),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  const usuarioId = session?.user?.id
  if (!usuarioId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Marque a caixa de aceite para continuar." }, { status: 400 })

  const { pendentes, anteriores } = await situacaoDoAceite(usuarioId, organizacaoId)
  if (pendentes.length === 0) return NextResponse.json({ ok: true, jaAceito: true })

  const vistos = new Set(parsed.data.documentos)
  if (!pendentes.every(p => vistos.has(p))) {
    return NextResponse.json({ error: "Os documentos foram atualizados. Recarregue a página para ler a versão nova." }, { status: 409 })
  }

  await comOrg(organizacaoId, () => prisma.$transaction(tx => registrarAceite(tx, { organizacaoId, usuarioId }, {
    organizacaoId, titularTipo: "usuario", titularId: usuarioId, documentos: pendentes,
    origem: origemDoAceiteNoPainel(anteriores), ipHash: hashDoIp(req.headers),
  })))
  return NextResponse.json({ ok: true })
}
