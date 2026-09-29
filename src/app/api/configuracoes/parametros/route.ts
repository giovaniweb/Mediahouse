import { registrarAuditoria, correlacaoAuditoria } from "@/lib/auditoria"
import { comOrg } from "@/lib/org-contexto"
import { requireAcesso } from "@/lib/acesso"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { TIPOS_VIDEO_SEED, TIPOS_CRIATIVO_SEED } from "@/lib/tipos-demanda"

// Seed inicial com valores hardcoded
const SEED_PARAMETROS = [
  // Departamentos
  { grupo: "departamentos", valor: "growth", label: "Growth", ordem: 0 },
  { grupo: "departamentos", valor: "eventos", label: "Eventos", ordem: 1 },
  { grupo: "departamentos", valor: "institucional", label: "Institucional", ordem: 2 },
  { grupo: "departamentos", valor: "rh", label: "RH", ordem: 3 },
  { grupo: "departamentos", valor: "audiovisual", label: "Audiovisual", ordem: 4 },
  { grupo: "departamentos", valor: "outros", label: "Outros", ordem: 5 },
  // Tipos de vídeo (audiovisual) e tipos de criativo (Growth). Os formulários
  // liam listas fixas no código que não batiam com estes valores — gravavam
  // "institucional" onde o parâmetro era "video_institucional", e ofereciam
  // "youtube"/"depoimento", que não existiam aqui. Editar a tela não surtia
  // efeito nenhum. Estas listas passaram a incluir tudo que já é usado.
  ...TIPOS_VIDEO_SEED,
  ...TIPOS_CRIATIVO_SEED,
  // Habilidades
  { grupo: "habilidades", valor: "edicao", label: "Edição", ordem: 0 },
  { grupo: "habilidades", valor: "captacao_camera", label: "Captação com câmera", ordem: 1 },
  { grupo: "habilidades", valor: "captacao_celular", label: "Captação com celular", ordem: 2 },
  { grupo: "habilidades", valor: "fotos", label: "Fotos", ordem: 3 },
  { grupo: "habilidades", valor: "3d", label: "3D", ordem: 4 },
  { grupo: "habilidades", valor: "ia_maker", label: "IA Maker", ordem: 5 },
  { grupo: "habilidades", valor: "motion_graphics", label: "Motion Graphics", ordem: 6 },
  { grupo: "habilidades", valor: "colorização", label: "Colorização", ordem: 7 },
  { grupo: "habilidades", valor: "drone", label: "Drone", ordem: 8 },
  { grupo: "habilidades", valor: "entrevista", label: "Entrevista", ordem: 9 },
  { grupo: "habilidades", valor: "live", label: "Live/Transmissão", ordem: 10 },
  { grupo: "habilidades", valor: "animacao", label: "Animação", ordem: 11 },
  { grupo: "habilidades", valor: "podcast", label: "Podcast", ordem: 12 },
  { grupo: "habilidades", valor: "roteiro", label: "Roteiro", ordem: 13 },
  { grupo: "habilidades", valor: "trilha_sonora", label: "Trilha Sonora", ordem: 14 },
  // Áreas de atuação (videomaker)
  { grupo: "areas_atuacao", valor: "eventos", label: "Eventos", ordem: 0 },
  { grupo: "areas_atuacao", valor: "institucional", label: "Institucional", ordem: 1 },
  { grupo: "areas_atuacao", valor: "ads", label: "Ads / Publicidade", ordem: 2 },
  { grupo: "areas_atuacao", valor: "social_media", label: "Social Media", ordem: 3 },
  { grupo: "areas_atuacao", valor: "reels", label: "Reels", ordem: 4 },
  { grupo: "areas_atuacao", valor: "aftermovie", label: "Aftermovie", ordem: 5 },
  { grupo: "areas_atuacao", valor: "documentario", label: "Documentário", ordem: 6 },
  { grupo: "areas_atuacao", valor: "live", label: "Live", ordem: 7 },
]

// GET /api/configuracoes/parametros?grupo=departamentos
export async function GET(req: NextRequest) {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  const { organizacaoId } = acesso

  const { searchParams } = new URL(req.url)
  const grupo = searchParams.get("grupo")

  // Seed se estiver vazio (por organização)
  const count = await prisma.configParametro.count({ where: { organizacaoId } })
  if (count === 0) {
    await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
      const criados = await tx.configParametro.createMany({ data: SEED_PARAMETROS.map((p) => ({ ...p, organizacaoId })), skipDuplicates: true })
      if (criados.count) await registrarAuditoria(tx, { organizacaoId, tecnico: "parametros.seed" }, { acao: "configuracao.alterada", recurso: "config_parametros", recursoId: organizacaoId, correlationId: correlacaoAuditoria(), depois: { alterados: criados.count } })
    }))
  }

  const parametros = await prisma.configParametro.findMany({
    where: { organizacaoId, ...(grupo && { grupo }), ativo: true },
    orderBy: [{ grupo: "asc" }, { ordem: "asc" }],
  })

  // Agrupar por grupo se não filtrado
  if (!grupo) {
    const agrupados: Record<string, typeof parametros> = {}
    for (const p of parametros) {
      if (!agrupados[p.grupo]) agrupados[p.grupo] = []
      agrupados[p.grupo].push(p)
    }
    return NextResponse.json({ agrupados, parametros })
  }

  return NextResponse.json({ parametros })
}

// POST /api/configuracoes/parametros — criar novo
export async function POST(req: NextRequest) {
  const acesso = await requireAcesso("gerenciarConfig")
  if (acesso instanceof NextResponse) return acesso

  const papel = acesso.papel
  if (!["admin", "gestor"].includes(papel ?? "")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  const { organizacaoId } = acesso

  const body = await req.json()
  const { grupo, valor, label, ordem } = body

  if (!grupo || !valor || !label) {
    return NextResponse.json({ error: "grupo, valor e label são obrigatórios" }, { status: 400 })
  }

  const p = await comOrg(organizacaoId, () => prisma.$transaction(async tx => {
    const atual = await tx.configParametro.create({ data: { grupo, valor, label, ordem: ordem ?? 0, organizacaoId } })
    await registrarAuditoria(tx, acesso, { acao: "configuracao.alterada", recurso: "config_parametro", recursoId: atual.id, correlationId: correlacaoAuditoria(), depois: { ativo: true, campos: ["grupo", "valor", "label", "ordem"] } })
    return atual
  }))
  return NextResponse.json({ parametro: p }, { status: 201 })
}
