// Módulos congelados — ocultos da navegação e bloqueados no backend, SEM apagar
// código nem dados. Para reativar um módulo no futuro, basta mudar a flag para `true`.
//
// Decisão estratégica (jun/2026): NuFlow focado em operação audiovisual e gestão de
// videomakers. Eventos fica congelado.
// Atualização: Growth liberado como MVP de gestão de conteúdos (área própria de
// demanda, kanban próprio, sem dependência de Eventos). Eventos permanece desativado.

export const GROWTH_ATIVO = true
export const EVENTOS_ATIVO = false
export const IDEIAS_ATIVO = false
export const MENSAGENS_ATIVO = false

// Rotas (páginas + APIs) de cada módulo. O bloqueio cobre o caminho exato e tudo abaixo dele.
const ROTAS_GROWTH = [
  "/design",
  "/galeria-artes",
  "/designers",
  "/api/designers",
]
const ROTAS_EVENTOS = [
  "/eventos",
  "/fornecedores",
  "/produtos-servico",
  "/api/eventos",
  "/api/fornecedores",
  "/api/produtos-servico",
]
// Banco de Ideias (página + API própria)
const ROTAS_IDEIAS = ["/ideias", "/api/ideias"]
// Mensagens — só a página; NÃO bloquear /api/whatsapp (usado pelas notificações automáticas)
const ROTAS_MENSAGENS = ["/mensagens"]

// Lista das rotas atualmente congeladas (conforme as flags acima).
export const ROTAS_CONGELADAS: string[] = [
  ...(GROWTH_ATIVO ? [] : ROTAS_GROWTH),
  ...(EVENTOS_ATIVO ? [] : ROTAS_EVENTOS),
  ...(IDEIAS_ATIVO ? [] : ROTAS_IDEIAS),
  ...(MENSAGENS_ATIVO ? [] : ROTAS_MENSAGENS),
]

// true se o caminho pertence a um módulo congelado.
export function rotaCongelada(pathname: string): boolean {
  return ROTAS_CONGELADAS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}
