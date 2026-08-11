import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgPublica, SLUG_ORG_LEGADA } from "@/lib/org"
import { TIPOS_VIDEO_SEED, TIPOS_CRIATIVO_SEED, GRUPO_VIDEO, GRUPO_CRIATIVO } from "@/lib/tipos-demanda"

// Relatório e formulários públicos precisam ler o vocabulário de tipos, mas
// /api/configuracoes/parametros exige sessão. Este endpoint expõe SÓ os grupos
// de tipo — nunca departamentos, habilidades ou qualquer outro parâmetro — e
// devolve apenas valor e rótulo.
const GRUPOS_PUBLICOS = new Set([GRUPO_VIDEO, GRUPO_CRIATIVO])

export const dynamic = "force-dynamic"

// GET /api/publico/parametros?grupo=tipos_video&org=<slug>
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const grupo = sp.get("grupo") ?? GRUPO_VIDEO

  if (!GRUPOS_PUBLICOS.has(grupo)) {
    return NextResponse.json({ error: "Grupo não disponível publicamente" }, { status: 404 })
  }

  // O formulário público sempre pertenceu à organização legada; `org` permite
  // que outra empresa use o mesmo formulário sem herdar a lista da primeira.
  const organizacaoId = await orgPublica(sp.get("org") ?? SLUG_ORG_LEGADA)

  const parametros = organizacaoId
    ? await prisma.configParametro.findMany({
        where: { organizacaoId, grupo, ativo: true },
        orderBy: [{ ordem: "asc" }, { label: "asc" }],
        select: { valor: true, label: true },
      })
    : []

  // Empresa sem parâmetros cadastrados cai na semente — o formulário nunca
  // aparece sem nenhuma opção.
  const padrao = grupo === GRUPO_CRIATIVO ? TIPOS_CRIATIVO_SEED : TIPOS_VIDEO_SEED
  return NextResponse.json({
    parametros: parametros.length > 0
      ? parametros
      : padrao.map((p) => ({ valor: p.valor, label: p.label })),
  })
}
