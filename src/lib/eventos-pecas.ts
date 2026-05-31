// Catálogo de peças audiovisuais que um evento pode gerar como Demandas.
// Cada peça marcada no cadastro vira 1 Demanda vinculada ao EventoGestao.

export interface PecaAudiovisual {
  key: string
  label: string
  tipoVideo: string       // mapeia para Demanda.tipoVideo
  descricao: string       // descrição base da demanda gerada
  criaCobertura?: boolean // se true, também cria um EventoCobertura vinculado
}

export const PECAS_AUDIOVISUAIS: PecaAudiovisual[] = [
  { key: "video_led", label: "Vídeo para LED", tipoVideo: "institucional", descricao: "Vídeo para painel de LED do stand/palco do evento." },
  { key: "video_convite", label: "Vídeo Convite", tipoVideo: "reels", descricao: "Vídeo de convite para divulgação do evento." },
  { key: "teaser", label: "Teaser", tipoVideo: "reels", descricao: "Teaser de pré-evento para redes sociais." },
  { key: "cobertura", label: "Cobertura do Evento", tipoVideo: "cobertura_evento", descricao: "Cobertura audiovisual completa do evento (captação no local).", criaCobertura: true },
  { key: "aftermovie", label: "Aftermovie", tipoVideo: "youtube", descricao: "Vídeo resumo/aftermovie pós-evento." },
  { key: "reels", label: "Reels", tipoVideo: "reels", descricao: "Reels para redes sociais durante/após o evento." },
  { key: "stories", label: "Stories", tipoVideo: "reels", descricao: "Stories para redes sociais durante o evento." },
  { key: "depoimentos", label: "Depoimentos", tipoVideo: "depoimento", descricao: "Captação de depoimentos no evento." },
]

// Peças pré-marcadas por tipo de evento
export const PECAS_DEFAULT_POR_TIPO: Record<string, string[]> = {
  congresso: ["video_led", "video_convite", "cobertura", "aftermovie", "reels"],
  feira: ["video_led", "video_convite", "cobertura", "reels"],
  jantar: ["video_convite", "cobertura", "reels"],
  cafe: ["cobertura", "reels"],
  webinar: ["video_convite", "teaser"],
  ativacao: ["cobertura", "reels", "stories"],
  unyque_experience: ["video_led", "cobertura", "aftermovie", "reels"],
  treinamento: ["cobertura", "depoimentos"],
  lancamento: ["video_led", "teaser", "cobertura", "aftermovie", "reels"],
  evento_interno: ["cobertura", "reels"],
  evento_medicos: ["video_convite", "cobertura", "depoimentos", "reels"],
  evento_fornecedores: ["cobertura", "reels"],
  outro: ["cobertura", "reels"],
}

export function pecasDefaultPara(tipo: string): string[] {
  return PECAS_DEFAULT_POR_TIPO[tipo] ?? PECAS_DEFAULT_POR_TIPO.outro
}

export function getPeca(key: string): PecaAudiovisual | undefined {
  return PECAS_AUDIOVISUAIS.find((p) => p.key === key)
}
