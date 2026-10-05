// Formas que a tela da área Social Media recebe de GET /api/social.

export type PedidoSocial = {
  id: string
  codigo: string
  statusVisivel: string
  statusInterno: string
  prioridade: "normal" | "alta" | "urgente"
  cobrancas: number
  cobradoEm: string | null
  linkPostagem: string | null
  responsaveis: string[]
  ultimaMudanca: string | null
  tokenAprovacao: string | null
}

export type CardSocial = {
  id: string
  titulo: string
  descricao: string | null
  linkReferencia: string | null
  area: "audiovisual" | "design" | null
  dataPostagem: string | null
  linhaProjetoId: string | null
  createdAt: string
  formulario: Record<string, unknown> | null
  linha: string | null
  enviadaPor: string | null
  solicitacao: boolean
  podeMexer: boolean
  demanda: PedidoSocial | null
}

export type LinhaDoQuadro = { id: string; nome: string; minha: boolean; socials: string[] }

export type RespostaQuadro = {
  usuarioId: string
  veTodas: boolean
  linhas: LinhaDoQuadro[]
  cards: CardSocial[]
}
