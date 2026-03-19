/**
 * Sistema de Permissões Configuráveis
 * Cada usuário tem um registro PermissaoUsuario com checkboxes.
 * Gestor/admin podem editar qualquer permissão via UI.
 */

// Preset padrão por tipo de usuário (aplicado ao criar usuário se não houver permissões)
export type PermissaoKey =
  | "verDashboard"
  | "verDemandas"
  | "verAprovacoes"
  | "verAgenda"
  | "verProdutos"
  | "verVideomakers"
  | "verEquipe"
  | "verCustos"
  | "verIA"
  | "verAlertas"
  | "verRelatorios"
  | "verUsuarios"
  | "verConfiguracoes"
  | "verIdeias"
  | "criarDemanda"
  | "editarDemanda"
  | "excluirDemanda"
  | "moverKanban"
  | "verTodasDemandas"
  | "verKanban"
  | "gerenciarUsuarios"
  | "gerenciarConfig"

export const PERMISSAO_LABELS: Record<PermissaoKey, string> = {
  verDashboard: "Ver Dashboard",
  verDemandas: "Ver Demandas",
  verAprovacoes: "Ver Aprovações",
  verAgenda: "Ver Agenda",
  verProdutos: "Ver Produtos",
  verVideomakers: "Ver Videomakers Ext",
  verEquipe: "Ver Videomakers Int",
  verCustos: "Ver Custos",
  verIA: "Ver Central IA",
  verAlertas: "Ver Alertas IA",
  verRelatorios: "Ver Relatórios",
  verUsuarios: "Ver Usuários",
  verConfiguracoes: "Ver Configurações",
  verIdeias: "Ver Banco de Ideias",
  criarDemanda: "Criar Demanda",
  editarDemanda: "Editar Demanda",
  excluirDemanda: "Excluir Demanda",
  moverKanban: "Mover Kanban",
  verTodasDemandas: "Ver Todas Demandas",
  verKanban: "Ver como Kanban",
  gerenciarUsuarios: "Gerenciar Usuários",
  gerenciarConfig: "Gerenciar Configurações",
}

export const PERMISSAO_GRUPOS = [
  {
    label: "Páginas",
    keys: [
      "verDashboard",
      "verDemandas",
      "verAprovacoes",
      "verAgenda",
      "verProdutos",
      "verVideomakers",
      "verEquipe",
      "verCustos",
      "verIA",
      "verAlertas",
      "verRelatorios",
      "verUsuarios",
      "verConfiguracoes",
      "verIdeias",
    ] as PermissaoKey[],
  },
  {
    label: "Ações em Demandas",
    keys: [
      "criarDemanda",
      "editarDemanda",
      "excluirDemanda",
      "moverKanban",
      "verTodasDemandas",
      "verKanban",
    ] as PermissaoKey[],
  },
  {
    label: "Administração",
    keys: ["gerenciarUsuarios", "gerenciarConfig"] as PermissaoKey[],
  },
]

// Presets — o que cada tipo de usuário recebe por padrão
type PresetPerms = Record<PermissaoKey, boolean>

const BASE_FALSE: PresetPerms = {
  verDashboard: false,
  verDemandas: false,
  verAprovacoes: false,
  verAgenda: false,
  verProdutos: false,
  verVideomakers: false,
  verEquipe: false,
  verCustos: false,
  verIA: false,
  verAlertas: false,
  verRelatorios: false,
  verUsuarios: false,
  verConfiguracoes: false,
  verIdeias: false,
  criarDemanda: false,
  editarDemanda: false,
  excluirDemanda: false,
  moverKanban: false,
  verTodasDemandas: false,
  verKanban: false,
  gerenciarUsuarios: false,
  gerenciarConfig: false,
}

const ALL_TRUE: PresetPerms = Object.fromEntries(
  Object.keys(BASE_FALSE).map((k) => [k, true])
) as PresetPerms

export const PRESETS: Record<string, PresetPerms> = {
  admin: ALL_TRUE,
  gestor: ALL_TRUE,

  // Videomaker interno (editor) — dashboard, demandas, agenda, produtos
  editor: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    verAgenda: true,
    verProdutos: true,
    criarDemanda: true,
    editarDemanda: true,
    excluirDemanda: true,
    moverKanban: true,
    verKanban: true,
  },

  // Social — dashboard, demandas, agenda, produtos
  social: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    verAgenda: true,
    verProdutos: true,
    criarDemanda: true,
    editarDemanda: true,
    excluirDemanda: true,
    moverKanban: true,
    verKanban: true,
  },

  // Videomaker externo — dashboard dele, demandas dele, feedbacks, perfil
  videomaker: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    verKanban: false, // visualização em cards, não kanban
  },

  // Operação
  operacao: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    verAprovacoes: true,
    verAgenda: true,
    verProdutos: true,
    criarDemanda: true,
    editarDemanda: true,
    moverKanban: true,
    verTodasDemandas: true,
    verKanban: true,
  },

  // Solicitante — só cria e vê as próprias
  solicitante: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    criarDemanda: true,
  },
}

// Mapeia permissão de página → href da sidebar
export const PERMISSAO_HREF_MAP: Record<string, PermissaoKey> = {
  "/dashboard": "verDashboard",
  "/demandas": "verDemandas",
  "/aprovacoes": "verAprovacoes",
  "/agenda": "verAgenda",
  "/produtos": "verProdutos",
  "/videomakers": "verVideomakers",
  "/equipe": "verEquipe",
  "/custos": "verCustos",
  "/ia": "verIA",
  "/alertas": "verAlertas",
  "/relatorios": "verRelatorios",
  "/usuarios": "verUsuarios",
  "/configuracoes": "verConfiguracoes",
  "/ideias": "verIdeias",
}
