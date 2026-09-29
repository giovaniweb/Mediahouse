type ProdutoParaSugestao = {
  id: string
  nome: string
  categoria: string | null
  ultimoConteudo: Date | null
  createdAt: Date
  peso: number
  alertaDias: number
  totalConteudos: number
}

/** Orientação editorial, não diagnóstico ou afirmação sobre benefícios do produto. */
export function sugerirConteudoProduto(p: ProdutoParaSugestao, agora = new Date()) {
  const diasSemConteudo = Math.max(0, Math.floor((+agora - +(p.ultimoConteudo ?? p.createdAt)) / 86_400_000))
  const prazo = Math.max(p.alertaDias, 1)
  const sugestao = diasSemConteudo >= prazo
    ? `Retome a apresentação de ${p.nome} com um vídeo curto de demonstração. Mostre uma aplicação real e confirme as informações com a equipe responsável.`
    : `Planeje um vídeo de ${p.nome} respondendo a uma dúvida frequente dos clientes. Valide a resposta com a equipe antes de gravar.`
  return {
    id: p.id, nome: p.nome, categoria: p.categoria, diasSemConteudo,
    peso: p.peso, alertaDias: p.alertaDias, totalConteudos: p.totalConteudos,
    score: Math.round(p.peso * (diasSemConteudo / prazo) * 100) / 100,
    sugestao,
  }
}
