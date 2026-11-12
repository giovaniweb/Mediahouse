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
import { DOCUMENTOS, marcaDeVersao } from "@/lib/juridico/documentos"
import { origemDoAceiteNoPainel } from "@/lib/juridico/aceite"
import { registrarAceite, situacaoDoAceite } from "@/lib/juridico/aceite-servidor"

// `documentos` traz a marca "slug@versao" do que a tela exibiu. Só o slug, sem
// versão, é tela de antes desta regra: tratada como desatualizada (409).
const slugDe = (s: string) => s.split("@")[0]
const schema = z.object({
  aceito: z.literal(true),
  organizacaoId: z.string().min(1).max(128).optional(),
  documentos: z.array(z.string().max(40).refine(s => Object.hasOwn(DOCUMENTOS, slugDe(s)))).min(1).max(5),
})
const RECARREGAR = "Os documentos foram atualizados. Recarregue a página para ler a versão nova."
const OUTRA_EMPRESA = "A empresa ativa mudou em outra aba. Recarregue a página para ver o que aceitar nela."

export async function POST(req: NextRequest) {
  const session = await auth()
  const usuarioId = session?.user?.id
  if (!usuarioId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Marque a caixa de aceite para continuar." }, { status: 400 })

  // A tela foi montada para uma empresa; se outra aba trocou a empresa ativa,
  // gravar agora seria aceitar em nome de quem a pessoa não viu.
  if (parsed.data.organizacaoId !== organizacaoId) {
    return NextResponse.json({ error: OUTRA_EMPRESA }, { status: 409 })
  }

  const { pendentes, anteriores } = await situacaoDoAceite(usuarioId, organizacaoId)
  if (pendentes.length === 0) return NextResponse.json({ ok: true, jaAceito: true })

  // Cada pendente tem de ter sido exibido NA VERSÃO ATUAL. Versão nova publicada
  // com a tela aberta não bate: pede para recarregar em vez de gravar um texto
  // que a pessoa não leu.
  const vistos = new Set(parsed.data.documentos)
  if (!pendentes.every(p => vistos.has(marcaDeVersao(p)))) {
    return NextResponse.json({ error: RECARREGAR }, { status: 409 })
  }

  await comOrg(organizacaoId, () => prisma.$transaction(tx => registrarAceite(tx, { organizacaoId, usuarioId }, {
    organizacaoId, titularTipo: "usuario", titularId: usuarioId, documentos: pendentes,
    origem: origemDoAceiteNoPainel(anteriores), ipHash: hashDoIp(req.headers),
  })))
  return NextResponse.json({ ok: true })
}
