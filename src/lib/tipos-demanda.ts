// Vocabulário de "tipo" da demanda — vídeo no audiovisual, criativo no Growth.
//
// O problema que isto resolve: a tela de Parâmetros gerenciava `tipos_video`,
// mas os formulários liam listas fixas no código, e as duas não batiam. O
// formulário gravava "institucional" enquanto o parâmetro era
// "video_institucional"; gravava "ads" para "video_meta_ads"; e oferecia
// "youtube", "depoimento" e "outro", que não existiam como parâmetro. Das 22
// variações gravadas em produção, só 5 estavam configuradas — mexer na tela não
// mudava nada em lugar nenhum.
//
// Estas listas são a semente: incluem tudo que já está em uso, para que nenhuma
// demanda existente fique órfã de rótulo, e o formulário passa a lê-las da API.

export const GRUPO_VIDEO = "tipos_video"
export const GRUPO_CRIATIVO = "tipos_criativo"

type Semente = { grupo: string; valor: string; label: string; ordem: number }

const video: [string, string][] = [
  ["video_institucional", "Institucional"],
  ["reels", "Reels / Stories"],
  ["cobertura_evento", "Cobertura de Evento"],
  ["youtube", "YouTube"],
  ["apresentacao_equipamento", "Apresentação de Equipamento"],
  ["treinamento", "Treinamento"],
  ["depoimento", "Depoimento"],
  ["video_meta_ads", "Anúncio (Ads)"],
  ["vsl", "VSL (Video Sales Letter)"],
  ["tutorial", "Tutorial"],
  ["social_media", "Social Media"],
  ["aftermovie", "Aftermovie"],
  ["corte_simples", "Corte Simples"],
  ["outro", "Outro"],
]

const criativo: [string, string][] = [
  ["post", "Post"],
  ["carrossel", "Carrossel"],
  ["story", "Story"],
  ["material_grafico", "Material Gráfico"],
  ["anuncio", "Anúncio"],
  ["email_marketing", "E-mail Marketing"],
  ["landing_page", "Landing Page"],
  ["landing_copy", "Copy de Landing"],
  ["apresentacao", "Apresentação"],
  ["atualizacao_materiais", "Atualização de Materiais"],
  ["administrativo", "Administrativo"],
  ["design", "Design (geral)"],
]

export const TIPOS_VIDEO_SEED: Semente[] = video.map(([valor, label], i) => ({
  grupo: GRUPO_VIDEO, valor, label, ordem: i,
}))

export const TIPOS_CRIATIVO_SEED: Semente[] = criativo.map(([valor, label], i) => ({
  grupo: GRUPO_CRIATIVO, valor, label, ordem: i,
}))

/**
 * Valores que são o mesmo tipo escrito de duas formas, resultado de o
 * formulário e a tela de parâmetros terem vocabulários diferentes. A chave é o
 * valor a aposentar; o destino é o que fica.
 */
export const TIPOS_DUPLICADOS: Record<string, string> = {
  institucional: "video_institucional",
  ads: "video_meta_ads",
}
