import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Seed inicial com valores hardcoded
const SEED_PARAMETROS = [
  // Departamentos
  { grupo: "departamentos", valor: "growth", label: "Growth", ordem: 0 },
  { grupo: "departamentos", valor: "eventos", label: "Eventos", ordem: 1 },
  { grupo: "departamentos", valor: "institucional", label: "Institucional", ordem: 2 },
  { grupo: "departamentos", valor: "rh", label: "RH", ordem: 3 },
  { grupo: "departamentos", valor: "audiovisual", label: "Audiovisual", ordem: 4 },
  { grupo: "departamentos", valor: "outros", label: "Outros", ordem: 5 },
  // Tipos de vídeo
  { grupo: "tipos_video", valor: "social_media", label: "Social Media", ordem: 0 },
  { grupo: "tipos_video", valor: "reels", label: "Reels", ordem: 1 },
  { grupo: "tipos_video", valor: "vsl", label: "VSL", ordem: 2 },
  { grupo: "tipos_video", valor: "video_meta_ads", label: "Meta Ads", ordem: 3 },
  { grupo: "tipos_video", valor: "aftermovie", label: "Aftermovie", ordem: 4 },
  { grupo: "tipos_video", valor: "video_institucional", label: "Institucional", ordem: 5 },
  { grupo: "tipos_video", valor: "cobertura_evento", label: "Cobertura de Evento", ordem: 6 },
  { grupo: "tipos_video", valor: "tutorial", label: "Tutorial", ordem: 7 },
  { grupo: "tipos_video", valor: "corte_simples", label: "Corte Simples", ordem: 8 },
  { grupo: "tipos_video", valor: "treinamento", label: "Treinamento", ordem: 9 },
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
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const grupo = searchParams.get("grupo")

  // Seed se estiver vazio
  const count = await prisma.configParametro.count()
  if (count === 0) {
    await prisma.configParametro.createMany({ data: SEED_PARAMETROS, skipDuplicates: true })
  }

  const parametros = await prisma.configParametro.findMany({
    where: { ...(grupo && { grupo }), ativo: true },
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
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const papel = (session.user as { tipo?: string }).tipo
  if (!["admin", "gestor"].includes(papel ?? "")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const body = await req.json()
  const { grupo, valor, label, ordem } = body

  if (!grupo || !valor || !label) {
    return NextResponse.json({ error: "grupo, valor e label são obrigatórios" }, { status: 400 })
  }

  const p = await prisma.configParametro.create({
    data: { grupo, valor, label, ordem: ordem ?? 0 },
  })
  return NextResponse.json({ parametro: p }, { status: 201 })
}
