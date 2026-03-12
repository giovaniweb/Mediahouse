import type {
  Usuario,
  Videomaker,
  Editor,
  Demanda,
  Arquivo,
  HistoricoStatus,
  Comentario,
  AlertaIA,
} from "@prisma/client"

export type DemandaComRelacoes = Demanda & {
  solicitante: Pick<Usuario, "id" | "nome" | "email">
  gestor?: Pick<Usuario, "id" | "nome"> | null
  videomaker?: Pick<Videomaker, "id" | "nome" | "cidade"> | null
  editor?: Pick<Editor, "id" | "nome"> | null
  arquivos: Arquivo[]
  historicos: (HistoricoStatus & {
    usuario?: Pick<Usuario, "id" | "nome"> | null
  })[]
  comentarios: (Comentario & {
    usuario: Pick<Usuario, "id" | "nome">
  })[]
  alertas: AlertaIA[]
  _count?: {
    arquivos: number
    comentarios: number
  }
}

export type DemandaCard = Pick<
  Demanda,
  | "id"
  | "codigo"
  | "titulo"
  | "prioridade"
  | "departamento"
  | "statusVisivel"
  | "statusInterno"
  | "dataLimite"
  | "pesoDemanda"
  | "riscoAtraso"
  | "motivoImpedimento"
  | "createdAt"
> & {
  solicitante: Pick<Usuario, "id" | "nome">
  videomaker?: Pick<Videomaker, "id" | "nome"> | null
  editor?: Pick<Editor, "id" | "nome"> | null
  _count: { comentarios: number; arquivos: number }
}

export type MetricasDashboard = {
  novasHoje: number
  urgentesAtivas: number
  emEdicao: number
  aguardandoAprovacao: number
  paraPostar: number
  atrasadas: number
  captacoesSemana: number
  expiracoesSemana: number
}

export type CargaEditor = {
  editor: Editor
  demandasAtivas: number
  cargaTotal: number
  status: "ok" | "atencao" | "sobrecarga"
}

export type CargaVideomaker = {
  videomaker: Videomaker
  demandasAtivas: number
}

export type TipoVideoOption = {
  value: string
  label: string
}

export type DepartamentoOptions = {
  [dept: string]: TipoVideoOption[]
}

// Opções de tipo de vídeo por departamento
export const TIPOS_VIDEO: DepartamentoOptions = {
  growth: [
    { value: "video_meta_ads", label: "Vídeo Meta Ads" },
    { value: "video_google_ads", label: "Vídeo Google Ads" },
    { value: "vsl", label: "VSL" },
    { value: "teste_criativo", label: "Teste Criativo" },
    { value: "reels", label: "Reels" },
  ],
  eventos: [
    { value: "cobertura_evento", label: "Cobertura de Evento" },
    { value: "video_convite", label: "Vídeo Convite" },
    { value: "teaser", label: "Teaser" },
    { value: "aftermovie", label: "Aftermovie" },
    { value: "painel_telao", label: "Painel / Telão" },
  ],
  institucional: [
    { value: "video_institucional", label: "Vídeo Institucional" },
    { value: "treinamento", label: "Treinamento" },
    { value: "comunicacao_interna", label: "Comunicação Interna" },
    { value: "video_cultura", label: "Vídeo de Cultura" },
  ],
  rh: [
    { value: "treinamento", label: "Treinamento" },
    { value: "comunicacao_interna", label: "Comunicação Interna" },
    { value: "video_cultura", label: "Vídeo de Cultura" },
    { value: "datas_comemorativas", label: "Datas Comemorativas" },
  ],
  audiovisual: [
    { value: "corte_simples", label: "Corte Simples" },
    { value: "reels", label: "Reels" },
    { value: "social_media", label: "Social Media" },
    { value: "stories", label: "Stories" },
  ],
  outros: [
    { value: "outros", label: "Outros" },
  ],
}

export const MOTIVOS_URGENCIA = [
  "Trend do Instagram / TikTok",
  "Pedido de Diretor / CEO",
  "Hype de mercado",
  "Oportunidade de publicação imediata",
  "Demanda para hoje",
  "Data comemorativa perdida",
  "Outro",
]
