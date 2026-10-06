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
  /** Pedido feito direto no Audiovisual/Growth, sem ideia: o "dataPostagem" é o prazo. */
  direto: boolean
  enviadaPor: string | null
  solicitacao: boolean
  /** A social dona do card (quem pediu, ou a da linha). */
  socialId: string | null
  socialNome: string | null
  /** Anotar, editar, descartar e pedir a ideia: a social da linha ou gestor/admin. */
  podeEditar: boolean
  /** Priorizar, cobrar, aprovar e marcar como postado: só a social. */
  podeMexer: boolean
  demanda: PedidoSocial | null
}

export type LinhaDoQuadro = { id: string; nome: string; minha: boolean; socials: string[] }

export type RespostaQuadro = {
  usuarioId: string
  veTodas: boolean
  podeCriar: boolean
  temSocialLigada: boolean
  linhas: LinhaDoQuadro[]
  cards: CardSocial[]
}
